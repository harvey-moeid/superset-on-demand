# Apache Superset On-Demand
Personal Superset sandbox. GitHub Actions runs the container only for manually selected sessions (30–180 minutes); Cloudflare Pages + Worker provide a mobile control panel.

## Architecture
- Cloudflare Pages: static Android-friendly Start/Stop/Status UI.
- Cloudflare Worker: bearer-token protected API; dispatches GitHub Actions workflows.
- GitHub Actions: ephemeral runner hosting Docker Superset + temporary Cloudflare Quick Tunnel.
- GitHub Actions artifact: SQLite metadata and Superset keys, retained 90 days.

## Access model
No email address or email OTP is required. The control panel requires the dashboard bearer token. Superset itself requires the generated admin username and password shown in the private GitHub Actions workflow summary. The temporary Quick Tunnel URL is publicly reachable, so keep both the URL and admin password private.

## Required GitHub Actions repository secrets
- CLOUDFLARE_API_TOKEN: scoped token with Workers Scripts:Edit and Cloudflare Pages:Edit.
- CLOUDFLARE_ACCOUNT_ID: Cloudflare account ID.
- SUPERSET_DASHBOARD_TOKEN: long random token to access the control panel.
- SUPERSET_GITHUB_TOKEN: fine-grained token scoped only to this repository with Actions Read and Write. Never expose in browser code.

## Setup
1. Create a Cloudflare Pages project named superset-on-demand (or update the project name in deploy-pages.yml). Build command blank; output directory control/pages.
2. Add all four secrets under GitHub repository Settings → Secrets and variables → Actions.
3. Replace YOUR-SUBDOMAIN in control/pages/config.js with your workers.dev account subdomain.
4. If Pages URL differs, update ALLOWED_ORIGINS in control/worker/wrangler.toml to exact Pages origin.
5. Run Deploy Superset Control Plane and Deploy Superset Pages from Actions.
6. Open Pages URL and enter SUPERSET_DASHBOARD_TOKEN.

## Security and limitations
Keep this repo private. Actions artifacts contain Superset metadata, SECRET_KEY and admin password. Workflow summaries contain the temporary tunnel URL and admin credentials. SQLite + 90-day artifacts are prototype-grade, not production persistence. GitHub Actions is not 24/7 hosting. Data warehouse, Redis/Celery, alerts and scheduled reports are not configured.
