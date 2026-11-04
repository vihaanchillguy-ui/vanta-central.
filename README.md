# Vanta Central

Customer and staff portal for Vanta Designs. The frontend is hosted on GitHub Pages; Discord OAuth runs in a separate Cloudflare Worker so secrets never reach the browser.

## Discord OAuth implementation

The repository now includes a Cloudflare Worker backend in `worker/`:
- Discord OAuth2 Authorization Code flow with a random state value.
- Discord identity lookup and Vanta guild membership verification.
- Current Vanta role lookup on each authenticated profile request.
- Signed, eight-hour HttpOnly session cookie.
- Role-derived permission scopes. Department designer roles remain separated.
- Logout and a minimal `/api/me` endpoint.

**The code is committed, but OAuth is not live until the Worker is deployed and configured.** Do not claim sign-in works before completing the setup below.

## Deploy the authentication Worker

1. Install Node.js, then install Wrangler: `npm install -g wrangler`.
2. In a terminal, from the repository's `worker` folder, run `npx wrangler login`.
3. Edit `wrangler.toml`: set `APP_ORIGIN` to the exact website origin (origin only, no path), `APP_URL` to the full GitHub Pages URL, `DISCORD_CLIENT_ID` to the Discord application's client ID, and `VANTA_GUILD_ID` to the Vanta Discord server ID.
4. Set encrypted secrets. Never commit these values:
   - `npx wrangler secret put DISCORD_CLIENT_SECRET`
   - `npx wrangler secret put DISCORD_BOT_TOKEN`
   - `npx wrangler secret put SESSION_SECRET` (use a long random value)
5. From the `worker` folder, run `npx wrangler deploy`.
6. In Discord Developer Portal → your application → OAuth2, add this exact redirect URI: `https://YOUR-WORKER-DOMAIN/auth/callback`.
7. Put the deployed Worker base URL into `config.js` as `window.VANTA_AUTH_API`.
8. Commit the config change and reload the Pages site.

For production, use a custom domain so the frontend and Worker are same-site. The Worker currently sets Secure, HttpOnly, SameSite=None cookies to support separate origins, but browser privacy controls can block cross-site cookies on some configurations. A same-site custom domain is the more reliable deployment.

## Required Discord bot access

The GMRP Central bot must be in the Vanta server and have permission to view members/roles. The Worker uses the bot token only server-side to check membership and retrieve role names. Do not put the bot token in `config.js`, `app.js`, GitHub Pages, or any public repository file.

## Role policy

The Worker maps roles by their current Discord role names:
- Executives: full permission scope (`*`).
- Co-Executives: management.
- Operations roles: operations scope.
- Sales roles: sales and order creation.
- Support roles: support.
- Clothing Designer: clothing orders only.
- Livery Designer: livery orders only.
- Graphics Designer: graphics orders only.
- Creative Team: creative scope.
- Customer-facing roles: customer scope only.

Wick, Server Automation, Quarantine, notification roles, Verified, Bloxlink, Melonly, Unverified and GMRP Central do not grant staff permissions. Role names must match exactly. For a hardened production release, replace name-based mappings with verified Discord role IDs.

## Current limitations

OAuth verifies identity, Vanta membership and role names. It does **not** yet provide the order database, customer order isolation, staff order APIs, file uploads/storage, or GMRP Central delivery DMs. Those need their own server-side implementation and authorization checks. The frontend must never be treated as the security boundary.

## GitHub Pages

Enable Settings → Pages → Deploy from a branch → `main` → `/(root)`. GitHub Pages only serves the static frontend; it does not run the Worker.
