#!/bin/sh
# Start the Business AI Manager API.
# - DATABASE_URL: built from PGHOST/PGUSER/PGPASSWORD/PGDATABASE when not set
#   (the password is URL-encoded, so any characters are safe).
# - JWT_SECRET: generated once and kept in the /data volume when not set.
# - No ANTHROPIC_API_KEY yet: runs with the mock model and logs a warning, so the
#   rest of the app (sign-in, CRM, billing) still works.
set -e

if [ -z "$DATABASE_URL" ]; then
  DATABASE_URL=$(python -c 'import os, urllib.parse as u
print("postgresql+psycopg://%s:%s@%s:%s/%s" % (u.quote(os.environ["PGUSER"], safe=""),
      u.quote(os.environ["PGPASSWORD"], safe=""), os.environ.get("PGHOST", "postgres"),
      os.environ.get("PGPORT", "5432"), os.environ.get("PGDATABASE", "bam")))')
  export DATABASE_URL
fi

if [ -z "$JWT_SECRET" ]; then
  if [ ! -s /data/jwt_secret ]; then
    python -c 'import secrets; print(secrets.token_hex(32))' > /data/jwt_secret
    chmod 600 /data/jwt_secret
  fi
  JWT_SECRET=$(cat /data/jwt_secret)
  export JWT_SECRET
fi

if [ "${LLM_PROVIDER:-anthropic}" = "anthropic" ] && [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "WARNING: ANTHROPIC_API_KEY is not set - the assistant uses the mock model." >&2
  export LLM_PROVIDER=mock
fi

exec uvicorn app.main:app --host 0.0.0.0 --port 8080 --proxy-headers
