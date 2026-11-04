const DISCORD_API = "https://discord.com/api/v10";
const SESSION_COOKIE = "vanta_session";
const STATE_COOKIE = "vanta_oauth_state";
const SESSION_SECONDS = 60 * 60 * 8;

const ROLE_PERMISSIONS = {
  "Executives": ["*"],
  "Co-Executives": ["management"],
  "Operations Team": ["operations"],
  "Operations Lead": ["operations"],
  "Operations": ["operations"],
  "Trial Operations": ["operations_limited"],
  "Sales Team": ["sales", "orders:create"],
  "Senior Sales Associate": ["sales", "orders:create"],
  "Sales Associate": ["sales", "orders:create"],
  "Support Team": ["support"],
  "Senior Support Agent": ["support"],
  "Support Agent": ["support"],
  "Trial Agent": ["support_limited"],
  "Creative Team": ["creative"],
  "Clothing Designer": ["orders:clothing"],
  "Livery Designer": ["orders:livery"],
  "Graphics Designer": ["orders:graphics"],
  "Official Partner": ["customer"],
  "Pixel+": ["customer"],
  "Customer": ["customer"],
  "Pixel Member": ["customer"],
  "Subscribed User": ["customer"]
};

const BLOCKED_ROLE_NAMES = new Set([
  "Wick", "Server Automation", "Quarantine", "News", "Order Status",
  "Careers", "Releases", "Verified", "Bloxlink", "Melonly",
  "Unverified", "GMRP Central"
]);

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
  });
}

function cookie(name, value, maxAge) {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=None`;
}

function clearCookie(name) {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None`;
}

function b64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fromB64url(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

async function sign(value, secret) {
  return `${b64url(new TextEncoder().encode(value))}.${b64url(await hmac(value, secret))}`;
}

async function verify(token, secret) {
  if (!token || !token.includes(".")) return null;
  const [encoded, signature] = token.split(".");
  try {
    const value = new TextDecoder().decode(fromB64url(encoded));
    const expected = await hmac(value, secret);
    const actual = fromB64url(signature);
    if (expected.length !== actual.length || !crypto.subtle) return null;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("HMAC", key, actual, new TextEncoder().encode(value));
    return valid ? value : null;
  } catch { return null; }
}

function getCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  const match = header.split(";").map(v => v.trim()).find(v => v.startsWith(name + "="));
  return match ? match.slice(name.length + 1) : "";
}

function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  return origin && origin === env.APP_ORIGIN ? origin : "";
}

function corsHeaders(origin) {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "vary": "Origin"
  };
}

async function discordFetch(path, token) {
  return fetch(DISCORD_API + path, { headers: { Authorization: token } });
}

async function getVantaMember(userId, env) {
  const [memberResponse, rolesResponse] = await Promise.all([
    discordFetch(`/guilds/${env.VANTA_GUILD_ID}/members/${userId}`, `Bot ${env.DISCORD_BOT_TOKEN}`),
    discordFetch(`/guilds/${env.VANTA_GUILD_ID}/roles`, `Bot ${env.DISCORD_BOT_TOKEN}`)
  ]);
  if (memberResponse.status === 404) return null;
  if (!memberResponse.ok || !rolesResponse.ok) throw new Error("Discord membership verification failed");
  const member = await memberResponse.json();
  const roles = await rolesResponse.json();
  const roleNames = roles.filter(role => member.roles.includes(role.id)).map(role => role.name);
  const permissions = new Set();
  for (const name of roleNames) {
    if (BLOCKED_ROLE_NAMES.has(name)) continue;
    for (const permission of (ROLE_PERMISSIONS[name] || [])) permissions.add(permission);
  }
  return { roleNames, permissions: [...permissions] };
}

async function handle(request, env) {
  const url = new URL(request.url);
  const origin = allowedOrigin(request, env);
  if (request.method === "OPTIONS") {
    if (!origin) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (url.pathname === "/health") return json({ ok: true, service: "Vanta Central Auth" });

  if (url.pathname === "/auth/discord" && request.method === "GET") {
    const state = b64url(crypto.getRandomValues(new Uint8Array(32)));
    const redirect = new URL("https://discord.com/oauth2/authorize");
    redirect.searchParams.set("client_id", env.DISCORD_CLIENT_ID);
    redirect.searchParams.set("response_type", "code");
    redirect.searchParams.set("redirect_uri", `${url.origin}/auth/callback`);
    redirect.searchParams.set("scope", "identify");
    redirect.searchParams.set("state", state);
    const headers = new Headers({ location: redirect.toString(), "cache-control": "no-store" });
    headers.append("set-cookie", cookie(STATE_COOKIE, state, 600));
    return new Response(null, { status: 302, headers });
  }

  if (url.pathname === "/auth/callback" && request.method === "GET") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const savedState = getCookie(request, STATE_COOKIE);
    const clearState = clearCookie(STATE_COOKIE);
    if (!code || !state || !savedState || state !== savedState) {
      return new Response("Discord sign-in could not be verified. Return to Vanta Central and try again.", { status: 400, headers: { "set-cookie": clearState } });
    }

    const tokenResponse = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: `${url.origin}/auth/callback`
      })
    });
    if (!tokenResponse.ok) return new Response("Discord token exchange failed. Check the Worker configuration.", { status: 502, headers: { "set-cookie": clearState } });
    const oauth = await tokenResponse.json();
    const userResponse = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${oauth.access_token}` }
    });
    if (!userResponse.ok) return new Response("Could not retrieve your Discord account.", { status: 502, headers: { "set-cookie": clearState } });
    const user = await userResponse.json();

    let member;
    try { member = await getVantaMember(user.id, env); }
    catch { return new Response("Vanta membership could not be checked. Please try again later.", { status: 503, headers: { "set-cookie": clearState } }); }
    if (!member) return new Response("You must be a member of the Vanta Designs Discord server to use Vanta Central.", { status: 403, headers: { "set-cookie": clearState } });

    const session = await sign(JSON.stringify({
      id: user.id,
      username: user.username,
      global_name: user.global_name || user.username,
      avatar: user.avatar,
      exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS
    }), env.SESSION_SECRET);
    const headers = new Headers({
      location: env.APP_URL,
      "cache-control": "no-store"
    });
    headers.append("set-cookie", cookie(SESSION_COOKIE, session, SESSION_SECONDS));
    headers.append("set-cookie", clearState);
    return new Response(null, { status: 302, headers });
  }

  if (url.pathname === "/auth/logout" && request.method === "POST") {
    if (!origin) return json({ error: "Origin not allowed" }, 403);
    return json({ ok: true }, 200, { ...corsHeaders(origin), "set-cookie": clearCookie(SESSION_COOKIE) });
  }

  if (url.pathname === "/api/me" && request.method === "GET") {
    if (!origin) return json({ error: "Origin not allowed" }, 403);
    const token = getCookie(request, SESSION_COOKIE);
    const payload = await verify(token, env.SESSION_SECRET);
    if (!payload) return json({ authenticated: false }, 401, { ...corsHeaders(origin) });
    let session;
    try { session = JSON.parse(payload); } catch { return json({ authenticated: false }, 401, { ...corsHeaders(origin) }); }
    if (!session.exp || session.exp < Math.floor(Date.now() / 1000)) {
      return json({ authenticated: false }, 401, { ...corsHeaders(origin), "set-cookie": clearCookie(SESSION_COOKIE) });
    }
    let member;
    try { member = await getVantaMember(session.id, env); }
    catch { return json({ error: "Could not verify current Vanta membership" }, 503, { ...corsHeaders(origin) }); }
    if (!member) return json({ authenticated: false, reason: "not_a_member" }, 403, { ...corsHeaders(origin), "set-cookie": clearCookie(SESSION_COOKIE) });
    return json({
      authenticated: true,
      user: { id: session.id, username: session.username, displayName: session.global_name, avatar: session.avatar },
      roles: member.roleNames,
      permissions: member.permissions
    }, 200, { ...corsHeaders(origin) });
  }

  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(request, env) {
    try { return await handle(request, env); }
    catch (error) {
      return json({ error: "Internal authentication service error" }, 500);
    }
  }
};
