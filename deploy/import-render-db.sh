#!/usr/bin/env bash
# Copy the old production database (the one Render's goodhour-api used) into
# this server's Postgres, replacing the empty database created at first deploy.
#
# Run on the server:
#   bash ~/good-hour/deploy/import-render-db.sh
# You'll be asked (hidden input) for the OLD connection string. Get it from
# Render: goodhour-api > Environment > DATABASE_URL (use the reveal/copy icon).
# If Render shows an "Internal" and an "External" URL, use the External one.
#
# Safe to re-run. Before replacing anything it saves:
#   backups/render-<time>.dump        the old database
#   backups/local-before-<time>.dump  this server's database as it was
# Nothing is printed that contains the password.
set -euo pipefail
cd "$(dirname "$0")/.."
C="docker compose -f docker-compose.prod.yml"

read -rsp "Paste the OLD DATABASE_URL (input hidden): " OLD; echo
case "$OLD" in postgres://*|postgresql://*) ;; *) echo "That is not a postgres:// URL." >&2; exit 1;; esac

PG=$($C ps -q postgres); [ -n "$PG" ] || { echo "Local postgres container is not running." >&2; exit 1; }
LUSER=$(docker exec "$PG" printenv POSTGRES_USER)
LDB=$(docker exec "$PG" printenv POSTGRES_DB)
LPASS=$(docker exec "$PG" printenv POSTGRES_PASSWORD)
mkdir -p backups && chmod 700 backups
TS=$(date +%Y%m%d%H%M%S)

echo "1/6 Connecting to the old database..."
VER=$(docker run --rm -e OLD="$OLD" postgres:17-alpine \
      sh -c 'psql "$OLD" -tAc "show server_version_num"' 2>/tmp/oldconn.err) || {
  echo "Could not connect to the old database:" >&2; sed -E 's#//[^@]*@#//***@#g' /tmp/oldconn.err >&2
  echo "If Render deleted it (free databases expire), the data can't be recovered from there." >&2; exit 1; }
MAJOR=$(( VER / 10000 )); [ "$MAJOR" -lt 16 ] && MAJOR=16
IMG="postgres:${MAJOR}-alpine"
echo "    old server is PostgreSQL $MAJOR (using $IMG tools)"

echo "2/6 Dumping the old database..."
docker run --rm -e OLD="$OLD" "$IMG" sh -c 'pg_dump --no-owner --no-acl -Fc "$OLD"' > "backups/render-$TS.dump"
[ -s "backups/render-$TS.dump" ] || { echo "Dump is empty - stopping, nothing changed." >&2; exit 1; }
echo "    saved backups/render-$TS.dump ($(du -h "backups/render-$TS.dump" | cut -f1))"

echo "3/6 Backing up this server's current database..."
docker exec "$PG" pg_dump -U "$LUSER" -Fc "$LDB" > "backups/local-before-$TS.dump"
chmod 600 backups/*.dump

echo "4/6 Stopping api and worker..."
$C stop api worker

echo "5/6 Restoring into the local database..."
LOCALRUN="docker run --rm -i --network container:$PG -e PGPASSWORD=$LPASS $IMG"
$LOCALRUN psql -q -h 127.0.0.1 -U "$LUSER" -d "$LDB" -v ON_ERROR_STOP=1 \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
set +e
$LOCALRUN pg_restore --no-owner --no-acl -h 127.0.0.1 -U "$LUSER" -d "$LDB" < "backups/render-$TS.dump" 2>/tmp/restore.err
RC=$?; set -e
if [ $RC -ne 0 ]; then
  echo "    pg_restore reported warnings (often harmless, e.g. version-specific SET lines):"
  grep -iE "error" /tmp/restore.err | head -10
fi

echo "6/6 Applying any newer migrations and starting the app..."
$C run --rm migrate
$C up -d api worker

echo
echo "Row counts in the restored database:"
docker exec "$PG" psql -q -U "$LUSER" -d "$LDB" -c "ANALYZE;"
docker exec "$PG" psql -U "$LUSER" -d "$LDB" -c \
  "SELECT relname AS table, n_live_tup AS rows FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 15;"
echo "Done. To undo: restore backups/local-before-$TS.dump the same way."
