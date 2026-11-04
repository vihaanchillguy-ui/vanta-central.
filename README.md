# Vanta Central

Customer and staff portal for Vanta Designs. The current GitHub Pages build is the responsive frontend interface.

## Current status

- Responsive Vanta-themed portal UI: included.
- Discord OAuth login: **not connected**.
- Live Discord guild membership and role checks: **not connected**.
- Private customer order database: **not connected**.
- Private image storage and designer delivery uploads: **not connected**.
- GMRP Central bot DMs: **not connected**.

The interface deliberately does not fake a successful login or display invented customer orders.

## GitHub Pages

1. Open the repository's **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select the `main` branch and `/(root)`, then save.
4. GitHub will show the published URL in the Pages section.

## Important security boundary

GitHub Pages only hosts static files. It cannot safely store a Discord client secret, bot token, private database credentials, or enforce private order access. Do not add any of those values to `index.html`, `app.js`, repository files, or frontend environment variables.

A production deployment needs a trusted server-side backend. That backend must:
- Complete Discord OAuth2 Authorization Code flow and validate the OAuth state.
- Store secrets in server-side environment variables.
- Verify the signed-in user is a member of the Vanta Discord guild.
- Fetch current guild roles server-side and enforce permissions on every API request.
- Restrict customers to their own orders and designers to their department.
- Store order records in a private database and uploaded design files in private object storage.
- Send authenticated, idempotent delivery events to GMRP Central. The bot token must remain with the bot service.

## Discord role policy

Use explicit role-ID configuration from the Vanta server. Suggested permissions:
- Executives: full access.
- Co-Executives: management access.
- Operations roles: operations scope.
- Sales roles: sales and order creation scope.
- Support roles: support scope.
- Clothing Designer: clothing orders only.
- Livery Designer: livery orders only.
- Graphics Designer: graphics orders only.
- Customer, Pixel+, Pixel Member, Subscribed User and Official Partner: customer-facing features only.

Never grant staff permissions from Wick, Server Automation, Quarantine, Verified, Bloxlink, Melonly, Unverified, notification roles, or the GMRP Central bot role. Department restrictions remain in force unless an explicitly configured executive permission applies.

## Order workflow requirements

Supported status labels:
- Order Accepted
- Livery In Progress / Clothing In Progress / Graphics In Progress
- Awaiting Customer Information
- Revision Required
- Completed
- Cancelled

A designer cannot mark an order completed until a valid final design file has been uploaded and saved. Record status history, actor, timestamp, customer-facing notes and separate internal notes. Never expose internal notes to customers.

## Required backend configuration

The backend deployment will need:
- Discord application client ID and client secret
- Discord bot token (server-side only, never in this frontend)
- Vanta guild ID
- Explicit role ID mapping
- Session signing secret
- Database connection
- Private file storage configuration
- Authenticated GMRP Central delivery endpoint and shared server-to-server signing secret

Configure the Discord OAuth redirect URI to the exact callback URL provided by the backend host. Do not put credentials in GitHub Pages settings or commit them to this repository.

## Development principle

Treat missing backend configuration as unavailable, never as permission granted. Do not enable demo authentication or expose sample orders in production.