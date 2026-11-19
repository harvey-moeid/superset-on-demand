# Apache Superset On-Demand

Private, single-user Superset sandbox launched manually from GitHub Actions. No VPS and no always-on server.

## What this does
- Starts the official Apache Superset container on an ephemeral GitHub-hosted Ubuntu runner.
- Opens a temporary HTTPS URL using a Cloudflare Quick Tunnel.
- Uses Superset's login screen; the admin password is generated on the first run and retained with the state backup.
- Restores the latest successful run's state artifact when available, then saves the SQLite metadata database and local credentials as a private GitHub Actions artifact (90-day retention).
- Stops Superset and the tunnel when the selected session duration ends.

## Start from Android
1. Open **Actions → Superset On-Demand → Run workflow**.
2. Choose 30, 60, 120, or 180 minutes.
3. Run the workflow and wait for the **Access details** step / run summary.
4. Open the temporary URL and sign in with username `admin` and the password shown in the private workflow summary.
5. When the session ends, run the workflow again to resume from the latest successful state artifact.

## Important limitations
- This is a personal sandbox, **not a production deployment**.
- GitHub-hosted jobs have a hard execution limit; this workflow caps sessions at 180 minutes.
- The tunnel URL is temporary and publicly routable. Superset authentication protects the app; do not share the URL or credentials.
- State is backed up as a GitHub Actions artifact for 90 days. If artifacts expire or are deleted, the saved dashboards/users/metadata cannot be restored from this workflow.
- SQLite is used only to keep this low-friction prototype self-contained. Apache recommends PostgreSQL or MySQL for production metadata storage; SQLite is not recommended for production.
- Redis, Celery, scheduled reports, alerts, and async query features are not configured.
- Data-source connectivity depends on the database drivers and credentials you configure inside Superset. The workflow does not magically turn arbitrary Excel/CSV files into a persistent warehouse.

## Security
Keep this repository **private**. The state artifact contains the Superset metadata DB, the generated SECRET_KEY, and the admin password. Anyone with access to this private repository's Actions artifacts or run summaries may be able to access the instance.

## Architecture
Android browser → temporary Cloudflare Quick Tunnel → Superset container on GitHub Actions runner → SQLite metadata file → private Actions artifact backup.
