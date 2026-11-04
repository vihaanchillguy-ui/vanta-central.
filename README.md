# Vanta Designs — Vanta Central

A focused account entry page for Vanta Designs. The current public interface intentionally shows only account creation and sign-in. Orders, staff workspaces, notifications and other features are hidden until their backend services actually exist.

## Account access
- New users choose **Create a Vanta account**.
- Returning users choose **Sign in with Discord**.
- Both use Discord OAuth2 Authorization Code flow.
- On first successful verification, the Worker creates a Vanta account record in Cloudflare D1. Returning users have their profile and last-login time updated.
- Vanta server membership is required.
- The Worker verifies current Discord roles server-side and issues a signed HttpOnly session.

The UI and backend code are committed, but account creation is not live until Cloudflare Worker, D1 and Discord OAuth configuration are completed.

## Deploy account storage
1. Install Wrangler: `npm install -g wrangler`.
2. From `worker/`, run `npx wrangler login`.
3. Create the database: `npx wrangler d1 create vanta-central-accounts`.
4. Copy the returned database ID into `worker/wrangler.toml` at `[[d1_databases]]`.
5. Apply the schema: `npx wrangler d1 execute vanta-central-accounts --remote --file=./schema.sql`.
6. Set `APP_ORIGIN` to the exact website origin and `APP_URL` to the full published GitHub Pages URL.
7. Set the Vanta Discord server ID.
8. Set encrypted secrets: `npx wrangler secret put DISCORD_CLIENT_SECRET`, `npx wrangler secret put DISCORD_BOT_TOKEN`, and `npx wrangler secret put SESSION_SECRET`.
9. Deploy from `worker/`: `npx wrangler deploy`.
10. In Discord Developer Portal → OAuth2, add `https://YOUR-WORKER-DOMAIN/auth/callback` as a redirect URI.
11. Set `window.VANTA_AUTH_API` in root `config.js` to the deployed Worker URL, commit and publish the site.

## Security
- Never commit Discord client secrets, bot tokens or session secrets.
- D1 stores Discord account identifiers and profile metadata only. OAuth access tokens are not stored.
- Guild membership and roles are checked by the Worker, not trusted from browser input.
- Account sessions are signed, HttpOnly, Secure and time-limited.
- Use a same-site custom domain for the frontend and Worker where possible. Cross-site cookie restrictions can affect GitHub Pages + Worker deployments.

## Current feature scope
Only account creation/sign-in and session verification are exposed in the UI. The orders database, order APIs, designer uploads, customer notifications and GMRP Central DM delivery are not implemented, so they are deliberately not advertised as available.
