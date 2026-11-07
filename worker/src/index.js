const DISCORD_API = "https://discord.com/api/v10";
const SESSION_COOKIE = "vanta_session";
const STATE_COOKIE = "vanta_oauth_state";
const SESSION_SECONDS = 60 * 60 * 8;
const ROLE_PERMISSIONS = {
  "Executives": ["*"], "Co-Executives": ["management"],
  "Operations Team": ["operations"], "Operations Lead": ["operations"], "Operations": ["operations"],
  "Trial Operations": ["operations_limited"], "Sales Team": ["sales","orders:create"],
  "Senior Sales Associate": ["sales","orders:create"], "Sales Associate": ["sales","orders:create"],
  "Support Team": ["support"], "Senior Support Agent": ["support"], "Support Agent": ["support"],
  "Trial Agent": ["support_limited"], "Creative Team": ["creative"],
  "Clothing Designer": ["orders:clothing"], "Livery Designer": ["orders:livery"],
  "Graphics Designer": ["orders:graphics"], "Official Partner": ["customer"], "Pixel+": ["customer"],
  "Customer": ["customer"], "Pixel Member": ["customer"], "Subscribed User": ["customer"]
};
const BLOCKED_ROLE_NAMES = new Set(["Wick","Server Automation","Quarantine","News","Order Status","Careers","Releases","Verified","Bloxlink","Melonly","Unverified","GMRP Central"]);
const ORDER_STATUSES = ["Awaiting Payment","Paid","In Progress","Awaiting Customer Review","Revision Requested","Completed","Cancelled"];
const ALL_PERMISSIONS = ["orders:view","orders:create","orders:update","orders:assign","customers:view","customers:manage","roles:view","roles:manage","support:manage","sales","creative","operations","management"];
const DEFAULT_ROLES = [
  ["role-owner","Owner","#e7b85c",["*"]],
  ["role-executive","Executive","#b88cff",["management","orders:view","orders:create","orders:update","orders:assign","customers:view","customers:manage","roles:view","roles:manage","support:manage","sales","creative","operations"]],
  ["role-management","Management","#8b9cff",["management","orders:view","orders:create","orders:update","orders:assign","customers:view","customers:manage","roles:view","support:manage","sales","creative","operations"]],
  ["role-operations","Operations","#56b6d9",["operations","orders:view","orders:update","orders:assign","customers:view"]],
  ["role-sales","Sales","#5dc99b",["sales","orders:view","orders:create","customers:view"]],
  ["role-support","Support","#e3a45e",["support:manage","orders:view","customers:view"]],
  ["role-designer","Designer","#bd8ee8",["creative","orders:view","orders:update"]],
  ["role-customer","Customer","#8794a8",["customer"]]
];
function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...headers}})}
function cookie(name,value,maxAge){return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=None`}
function clearCookie(name){return `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None`}
function b64url(bytes){let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")}
function fromB64url(value){const base64=value.replace(/-/g,"+").replace(/_/g,"/")+"===".slice((value.length+3)%4);return Uint8Array.from(atob(base64),c=>c.charCodeAt(0))}
async function hmac(value,secret){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value)))}
async function sign(value,secret){return `${b64url(new TextEncoder().encode(value))}.${b64url(await hmac(value,secret))}`}
async function verify(token,secret){if(!token||!token.includes("."))return null;const [encoded,signature]=token.split(".");try{const value=new TextDecoder().decode(fromB64url(encoded));const actual=fromB64url(signature);const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);return await crypto.subtle.verify("HMAC",key,actual,new TextEncoder().encode(value))?value:null}catch{return null}}
function getCookie(request,name){const header=request.headers.get("cookie")||"";const match=header.split(";").map(v=>v.trim()).find(v=>v.startsWith(name+"="));return match?match.slice(name.length+1):""}
function allowedOrigin(request,env){const origin=request.headers.get("Origin")||new URL(request.url).origin;return origin===env.APP_ORIGIN?origin:""}
function corsHeaders(origin){return {"access-control-allow-origin":origin,"access-control-allow-credentials":"true","access-control-allow-methods":"GET,POST,PATCH,DELETE,OPTIONS","access-control-allow-headers":"Content-Type","vary":"Origin"}}
async function discordFetch(path,token){return fetch(DISCORD_API+path,{headers:{Authorization:token}})}
async function getVantaMember(userId,env){
 const [mr,rr]=await Promise.all([discordFetch(`/guilds/${env.VANTA_GUILD_ID}/members/${userId}`,`Bot ${env.DISCORD_BOT_TOKEN}`),discordFetch(`/guilds/${env.VANTA_GUILD_ID}/roles`,`Bot ${env.DISCORD_BOT_TOKEN}`)]);
 if(mr.status===404)return null;if(!mr.ok||!rr.ok)throw new Error("Discord membership verification failed");
 const member=await mr.json(),roles=await rr.json(),roleNames=roles.filter(r=>member.roles.includes(r.id)).map(r=>r.name),permissions=new Set();
 for(const name of roleNames){if(!BLOCKED_ROLE_NAMES.has(name))for(const p of ROLE_PERMISSIONS[name]||[])permissions.add(p)}
 return {roleNames,permissions:[...permissions]};
}
function has(perms,p){return perms.includes("*")||perms.includes(p)}
function canManageRoles(perms){return has(perms,"roles:manage")||has(perms,"management")}
function canSeeCustomers(perms){return has(perms,"customers:view")||has(perms,"customers:manage")||canManageRoles(perms)}
async function getSession(request,env){
 const raw=await verify(getCookie(request,SESSION_COOKIE),env.SESSION_SECRET);if(!raw)return null;
 try{const s=JSON.parse(raw);return s.exp>Date.now()/1000?s:null}catch{return null}
}
async function getAccess(userId,env){
 const member=await getVantaMember(userId,env);if(!member)return null;
 const rows=await env.DB.prepare("SELECT r.id,r.name,r.color,r.permissions_json FROM vanta_roles r JOIN account_vanta_roles a ON a.role_id=r.id WHERE a.discord_id=?").bind(userId).all();
 const vantaRoles=(rows.results||[]).map(r=>({id:r.id,name:r.name,color:r.color,permissions:JSON.parse(r.permissions_json||"[]")}));
 const permissions=new Set(member.permissions);for(const role of vantaRoles)for(const p of role.permissions)permissions.add(p);
 return {discordRoles:member.roleNames,vantaRoles,permissions:[...permissions]};
}
function requirePermission(perms,p){return has(perms,p)}
async function recordEvent(env,orderId,actor,type,details){await env.DB.prepare("INSERT INTO order_events(id,order_id,actor_discord_id,event_type,details,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),orderId,actor,type,details||"",new Date().toISOString()).run()}
async function handleApi(request,env,url,origin,session){
 const headers=corsHeaders(origin),path=url.pathname,method=request.method;
 if(!session)return json({error:"Sign in required"},401,headers);
 const access=await getAccess(session.id,env);if(!access)return json({error:"VANTA membership required"},403,headers);
 const perms=access.permissions;
 if(path==="/api/me"&&method==="GET")return json({authenticated:true,user:{id:session.id,username:session.username,displayName:session.global_name,avatar:session.avatar},roles:access.discordRoles,discordRoles:access.discordRoles,vantaRoles:access.vantaRoles,permissions:perms},200,headers);
 if(path==="/api/orders"&&method==="GET"){
  if(!has(perms,"orders:view")&&!has(perms,"customer"))return json({error:"You cannot view orders"},403,headers);
  const own=!canSeeCustomers(perms)&&!has(perms,"orders:view");
  const rows=own?await env.DB.prepare("SELECT o.*,a.username customer_username,a.display_name customer_name FROM orders o LEFT JOIN accounts a ON a.discord_id=o.customer_discord_id WHERE o.customer_discord_id=? ORDER BY o.created_at DESC").bind(session.id).all():await env.DB.prepare("SELECT o.*,a.username customer_username,a.display_name customer_name FROM orders o LEFT JOIN accounts a ON a.discord_id=o.customer_discord_id ORDER BY o.created_at DESC").all();
  return json({orders:rows.results||[],statuses:ORDER_STATUSES},200,headers);
 }
 if(path==="/api/orders"&&method==="POST"){
  if(!has(perms,"orders:create"))return json({error:"You do not have permission to create orders"},403,headers);
  const b=await request.json(),customer=String(b.customerDiscordId||"").trim(),title=String(b.title||"").trim();
  if(!customer||!title)return json({error:"Customer and order title are required"},400,headers);
  const exists=await env.DB.prepare("SELECT discord_id FROM accounts WHERE discord_id=?").bind(customer).first();if(!exists)return json({error:"Customer must sign in to VANTA Central first"},404,headers);
  const id="VNT-"+crypto.randomUUID().slice(0,8).toUpperCase(),now=new Date().toISOString();
  await env.DB.prepare("INSERT INTO orders(id,customer_discord_id,title,service,package,quantity,price_robux,status,assigned_to,requirements,internal_notes,payment_status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,customer,title,String(b.service||"Other"),String(b.package||"Custom"),Math.max(1,Number(b.quantity)||1),Math.max(0,Number(b.priceRobux)||0),String(b.status||"Awaiting Payment"),String(b.assignedTo||""),String(b.requirements||""),String(b.internalNotes||""),String(b.paymentStatus||"Unpaid"),session.id,now,now).run();
  await recordEvent(env,id,session.id,"Order created",title);
  return json({ok:true,id},201,headers);
 }
 const orderMatch=path.match(/^\/api\/orders\/([^/]+)$/);
 if(orderMatch&&method==="PATCH"){
  const id=decodeURIComponent(orderMatch[1]),old=await env.DB.prepare("SELECT * FROM orders WHERE id=?").bind(id).first();if(!old)return json({error:"Order not found"},404,headers);
  if(!has(perms,"orders:update")&&!has(perms,"orders:assign"))return json({error:"You cannot update orders"},403,headers);
  const b=await request.json(),allowed=["title","service","package","quantity","price_robux","status","assigned_to","requirements","internal_notes","payment_status"];
  if(b.status&&!ORDER_STATUSES.includes(b.status))return json({error:"Invalid order status"},400,headers);
  const changes=[];const values=[];for(const key of allowed){if(Object.prototype.hasOwnProperty.call(b,key)){if(key==="assigned_to"&&!has(perms,"orders:assign"))return json({error:"You cannot assign orders"},403,headers);changes.push(key+"=?");values.push(b[key]===null?"":b[key]);}}
  if(!changes.length)return json({error:"No changes supplied"},400,headers);
  changes.push("updated_at=?");values.push(new Date().toISOString(),id);
  await env.DB.prepare("UPDATE orders SET "+changes.join(",")+" WHERE id=?").bind(...values).run();
  await recordEvent(env,id,session.id,"Order updated",JSON.stringify(b));
  return json({ok:true},200,headers);
 }
 if(path==="/api/customers"&&method==="GET"){
  if(!canSeeCustomers(perms))return json({error:"You cannot view customers"},403,headers);
  const q="%"+String(url.searchParams.get("q")||"").slice(0,80)+"%";
  const rows=await env.DB.prepare("SELECT discord_id,username,display_name,avatar_hash,created_at,last_login_at FROM accounts WHERE username LIKE ? OR display_name LIKE ? OR discord_id LIKE ? ORDER BY last_login_at DESC LIMIT 100").bind(q,q,q).all();
  return json({customers:rows.results||[]},200,headers);
 }
 const customerMatch=path.match(/^\/api\/customers\/([^/]+)$/);
 if(customerMatch&&method==="GET"){
  if(!canSeeCustomers(perms))return json({error:"You cannot view customer profiles"},403,headers);
  const id=decodeURIComponent(customerMatch[1]),customer=await env.DB.prepare("SELECT discord_id,username,display_name,avatar_hash,created_at,last_login_at FROM accounts WHERE discord_id=?").bind(id).first();
  if(!customer)return json({error:"Customer not found"},404,headers);
  let discordRoles=[];try{const m=await getVantaMember(id,env);discordRoles=m?.roleNames||[]}catch{}
  const vrows=await env.DB.prepare("SELECT r.id,r.name,r.color,r.permissions_json FROM vanta_roles r JOIN account_vanta_roles a ON a.role_id=r.id WHERE a.discord_id=?").bind(id).all();
  const orders=await env.DB.prepare("SELECT * FROM orders WHERE customer_discord_id=? ORDER BY created_at DESC").bind(id).all();
  return json({customer,discordRoles,vantaRoles:(vrows.results||[]).map(r=>({id:r.id,name:r.name,color:r.color,permissions:JSON.parse(r.permissions_json||"[]")})),orders:orders.results||[]},200,headers);
 }
 if(path==="/api/vanta-roles"&&method==="GET"){
  if(!has(perms,"roles:view")&&!canManageRoles(perms)&&!canSeeCustomers(perms))return json({error:"You cannot view VANTA roles"},403,headers);
  const rows=await env.DB.prepare("SELECT id,name,color,permissions_json,is_system FROM vanta_roles ORDER BY is_system DESC,name").all();
  return json({roles:(rows.results||[]).map(r=>({...r,permissions:JSON.parse(r.permissions_json||"[]")})),availablePermissions:ALL_PERMISSIONS},200,headers);
 }
 if(path==="/api/vanta-roles"&&method==="POST"){
  if(!canManageRoles(perms))return json({error:"Management access required"},403,headers);
  const b=await request.json(),name=String(b.name||"").trim(),color=String(b.color||"#8794a8"),ps=Array.isArray(b.permissions)?b.permissions.filter(p=>ALL_PERMISSIONS.includes(p)||p==="*"):[];
  if(!name||name.length>32)return json({error:"Role name must be 1–32 characters"},400,headers);
  if(!has(perms,"*")&&ps.some(p=>["*","management","roles:manage"].includes(p)))return json({error:"Only an Owner can grant management-level permissions"},403,headers);
  const id="custom-"+crypto.randomUUID().slice(0,12);
  try{await env.DB.prepare("INSERT INTO vanta_roles(id,name,color,permissions_json,is_system,created_at,updated_at) VALUES(?,?,?,?,0,?,?)").bind(id,name,color,JSON.stringify(ps),new Date().toISOString(),new Date().toISOString()).run()}catch{return json({error:"That role name may already exist"},409,headers)}
  return json({ok:true,id},201,headers);
 }
 const roleMatch=path.match(/^\/api\/vanta-roles\/([^/]+)$/);
 if(roleMatch&&method==="PATCH"){
  if(!canManageRoles(perms))return json({error:"Management access required"},403,headers);
  const id=decodeURIComponent(roleMatch[1]),old=await env.DB.prepare("SELECT * FROM vanta_roles WHERE id=?").bind(id).first();if(!old)return json({error:"Role not found"},404,headers);
  if(old.is_system)return json({error:"Default system roles cannot be edited"},400,headers);
  const b=await request.json(),name=String(b.name??old.name).trim(),color=String(b.color??old.color),ps=Array.isArray(b.permissions)?b.permissions.filter(p=>ALL_PERMISSIONS.includes(p)||p==="*"):JSON.parse(old.permissions_json);
  if(!has(perms,"*")&&ps.some(p=>["*","management","roles:manage"].includes(p)))return json({error:"Only an Owner can grant management-level permissions"},403,headers);
  try{await env.DB.prepare("UPDATE vanta_roles SET name=?,color=?,permissions_json=?,updated_at=? WHERE id=?").bind(name,color,JSON.stringify(ps),new Date().toISOString(),id).run()}catch{return json({error:"Role name already exists"},409,headers)}
  return json({ok:true},200,headers);
 }
 const assignMatch=path.match(/^\/api\/customers\/([^/]+)\/roles$/);
 if(assignMatch&&method==="POST"){
  if(!canManageRoles(perms))return json({error:"Management access required"},403,headers);
  const customer=decodeURIComponent(assignMatch[1]),b=await request.json(),roleId=String(b.roleId||"");
  const [exists,role]=await Promise.all([env.DB.prepare("SELECT discord_id FROM accounts WHERE discord_id=?").bind(customer).first(),env.DB.prepare("SELECT id,permissions_json FROM vanta_roles WHERE id=?").bind(roleId).first()]);
  if(!exists||!role)return json({error:"Customer or role not found"},404,headers);
  const granted=JSON.parse(role.permissions_json||"[]");if(!has(perms,"*")&&granted.some(p=>["*","management","roles:manage"].includes(p)))return json({error:"Only an Owner can assign management-level roles"},403,headers);
  await env.DB.prepare("INSERT OR IGNORE INTO account_vanta_roles(discord_id,role_id,assigned_by,assigned_at) VALUES(?,?,?,?)").bind(customer,roleId,session.id,new Date().toISOString()).run();
  return json({ok:true},200,headers);
 }
 const removeMatch=path.match(/^\/api\/customers\/([^/]+)\/roles\/([^/]+)$/);
 if(removeMatch&&method==="DELETE"){
  if(!canManageRoles(perms))return json({error:"Management access required"},403,headers);
  await env.DB.prepare("DELETE FROM account_vanta_roles WHERE discord_id=? AND role_id=?").bind(decodeURIComponent(removeMatch[1]),decodeURIComponent(removeMatch[2])).run();
  return json({ok:true},200,headers);
 }
 if(path==="/api/order-events"&&method==="GET"){
  if(!has(perms,"orders:view"))return json({error:"Staff access required"},403,headers);
  const id=String(url.searchParams.get("orderId")||"");
  const rows=await env.DB.prepare("SELECT * FROM order_events WHERE order_id=? ORDER BY created_at DESC").bind(id).all();
  return json({events:rows.results||[]},200,headers);
 }
 return json({error:"Not found"},404,headers);
}
async function handle(request,env){
 const url=new URL(request.url),origin=allowedOrigin(request,env);
 if(request.method==="OPTIONS"){if(!origin)return new Response(null,{status:403});return new Response(null,{status:204,headers:corsHeaders(origin)})}
 if(url.pathname==="/health"){
  let tables=false;try{const r=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='orders'").first();tables=Boolean(r)}catch{}
  const checks={discordClientId:!!env.DISCORD_CLIENT_ID,discordClientSecret:!!env.DISCORD_CLIENT_SECRET,discordBotToken:!!env.DISCORD_BOT_TOKEN,sessionSecret:!!env.SESSION_SECRET,databaseBinding:!!env.DB,ordersTable:tables};
  const ready=Object.values(checks).every(Boolean);return json({ok:ready,service:"Vanta Central",checks},ready?200:503);
 }
 if(url.pathname==="/auth/discord"&&request.method==="GET"){
  const state=b64url(crypto.getRandomValues(new Uint8Array(32))),mode=url.searchParams.get("mode")==="signup"?"signup":"login",redirect=new URL("https://discord.com/oauth2/authorize");
  redirect.searchParams.set("client_id",env.DISCORD_CLIENT_ID);redirect.searchParams.set("response_type","code");redirect.searchParams.set("redirect_uri",`${url.origin}/auth/callback`);redirect.searchParams.set("scope","identify");redirect.searchParams.set("state",state);
  const headers=new Headers({location:redirect.toString(),"cache-control":"no-store"});headers.append("set-cookie",cookie(STATE_COOKIE,state+"."+mode,600));return new Response(null,{status:302,headers});
 }
 if(url.pathname==="/auth/callback"&&request.method==="GET"){
  const code=url.searchParams.get("code"),state=url.searchParams.get("state"),saved=getCookie(request,STATE_COOKIE),[expected,mode]=saved.split(".");
  if(!code||!state||!expected||state!==expected)return new Response("Discord sign-in could not be verified.",{status:400,headers:{"set-cookie":clearCookie(STATE_COOKIE)}});
  const tr=await fetch(`${DISCORD_API}/oauth2/token`,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:env.DISCORD_CLIENT_ID,client_secret:env.DISCORD_CLIENT_SECRET,grant_type:"authorization_code",code,redirect_uri:`${url.origin}/auth/callback`})});
  if(!tr.ok)return new Response("Discord token exchange failed.",{status:502,headers:{"set-cookie":clearCookie(STATE_COOKIE)}});
  const oauth=await tr.json(),ur=await fetch(`${DISCORD_API}/users/@me`,{headers:{Authorization:`Bearer ${oauth.access_token}`}});if(!ur.ok)return new Response("Could not retrieve your Discord account.",{status:502});
  const user=await ur.json();let member;try{member=await getVantaMember(user.id,env)}catch{return new Response("VANTA membership could not be checked. Try again.",{status:503})}
  if(!member)return new Response("Join the VANTA Designs Discord server before using VANTA Central.",{status:403});
  const now=new Date().toISOString();await env.DB.prepare("INSERT INTO accounts(discord_id,username,display_name,avatar_hash,created_at,last_login_at) VALUES(?,?,?,?,?,?) ON CONFLICT(discord_id) DO UPDATE SET username=excluded.username,display_name=excluded.display_name,avatar_hash=excluded.avatar_hash,last_login_at=excluded.last_login_at").bind(user.id,user.username,user.global_name||user.username,user.avatar||null,now,now).run();
  await env.DB.prepare("INSERT OR IGNORE INTO account_vanta_roles(discord_id,role_id,assigned_by,assigned_at) VALUES(?,?,?,?)").bind(user.id,"role-customer","system",now).run();
  const session=await sign(JSON.stringify({id:user.id,username:user.username,global_name:user.global_name||user.username,avatar:user.avatar,exp:Math.floor(Date.now()/1000)+SESSION_SECONDS}),env.SESSION_SECRET);
  const h=new Headers({location:env.APP_URL+"?discord=connected&mode="+(mode==="signup"?"signup":"login"),"cache-control":"no-store"});h.append("set-cookie",cookie(SESSION_COOKIE,session,SESSION_SECONDS));h.append("set-cookie",clearCookie(STATE_COOKIE));return new Response(null,{status:302,headers:h});
 }
 if(url.pathname==="/auth/logout"&&request.method==="POST"){if(!origin)return json({error:"Origin not allowed"},403);return json({ok:true},200,{...corsHeaders(origin),"set-cookie":clearCookie(SESSION_COOKIE)})}
 if(url.pathname.startsWith("/api/")){
  if(!origin)return json({error:"Origin not allowed"},403);
  const session=await getSession(request,env);
  return handleApi(request,env,url,origin,session);
 }
 if(env.ASSETS)return env.ASSETS.fetch(request);
 return json({error:"Not found"},404);
}
export default {async fetch(request,env){try{return await handle(request,env)}catch(error){return json({error:"Internal VANTA Central error"},500)}}};
