#!/usr/bin/env bash
# Import the env vars exported from the old Render services into this server's .env.
#
# On Render: open each service > Environment > Export (downloads a .env file).
# Copy the files to the server, e.g. from your PC:
#   scp -i ~/.ssh/goodhour api.env web.env worker.env ubuntu@143.47.255.104:~/
# Then on the server:
#   bash ~/good-hour/deploy/import-render-env.sh ~/api.env ~/web.env ~/worker.env
#
# Server-specific values are never overwritten (database, redis, URLs, the
# OpenRouter config already set on this server). A timestamped backup of .env
# is kept, values are never printed, and the exported files are shredded after.
set -euo pipefail
cd "$(dirname "$0")/.."
[ $# -ge 1 ] || { echo "usage: $0 <render-export.env> [more.env ...]" >&2; exit 1; }
[ -f .env ] || { echo "missing $(pwd)/.env" >&2; exit 1; }
cp .env ".env.bak.$(date +%Y%m%d%H%M%S)"
python3 - .env "$@" <<'PY'
import re, sys
env, files = sys.argv[1], sys.argv[2:]
KEEP = {"DATABASE_URL","REDIS_URL","WEB_ORIGIN","API_PUBLIC_URL","NEXT_PUBLIC_API_URL",
        "NODE_ENV","PORT","POSTGRES_PASSWORD","POSTGRES_USER","POSTGRES_DB",
        "OPENAI_API_KEY","OPENAI_BASE_URL","OPENAI_MODEL"}
imp = {}
for f in files:
    for line in open(f, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.strip().removeprefix("export ").strip()
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", k) or k in KEEP:
            continue
        v = v.strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
            v = v[1:-1]
        if v:
            imp[k] = v
def fmt(k, v):
    return f"{k}='{v}'" if "'" not in v else f'{k}="' + v.replace("\\", "\\\\").replace('"', '\\"').replace("$", "$$") + '"'
out, seen = [], set()
for line in open(env, encoding="utf-8").read().splitlines():
    m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)=", line)
    if m and m.group(1) in imp:
        out.append(fmt(m.group(1), imp[m.group(1)])); seen.add(m.group(1))
    else:
        out.append(line)
out += [fmt(k, v) for k, v in imp.items() if k not in seen]
open(env, "w", encoding="utf-8").write("\n".join(out) + "\n")
print("Imported (values hidden):", ", ".join(sorted(imp)) or "(nothing)")
print("Kept server values for:", ", ".join(sorted(KEEP)))
PY
chmod 600 .env
shred -u "$@" 2>/dev/null || rm -f "$@"
docker compose -f docker-compose.prod.yml up -d --build api worker web
echo "Done. Old .env backed up as .env.bak.*"
