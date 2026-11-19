import os

# This key is generated once and restored with the private Actions state artifact.
SECRET_KEY = os.environ["SUPERSET_SECRET_KEY"]

# Single-user sandbox metadata store. Do not use SQLite for production.
SQLALCHEMY_DATABASE_URI = "sqlite:////app/superset_home/superset.db"

ROW_LIMIT = 50000
ENABLE_PROXY_FIX = True
PREFERRED_URL_SCHEME = "https"
SESSION_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"

# Keep the sandbox minimal; async query/report features are not configured.
