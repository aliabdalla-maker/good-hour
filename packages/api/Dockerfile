# Runs via tsx (not a tsc build) so internal workspace packages
# (@gihtcx/db, @gihtcx/shared) can be consumed as plain TS source without a
# separate compile step -- see docs/ARCHITECTURE.md for the tradeoff.
#
# Build from the repo root:
#   docker build -f packages/api/Dockerfile -t goodhours-api .
FROM node:22-alpine
WORKDIR /repo

# Prisma's query engine needs OpenSSL at runtime; libc6-compat covers native
# addons on musl. Without these, Prisma fails to load libquery_engine on Alpine.
RUN apk add --no-cache openssl libc6-compat

# Copy EVERY workspace manifest first so `npm ci` resolves the whole graph
# reproducibly from the lockfile (npm ci refuses to run on a partial workspace
# set). Manifests change rarely, so this layer stays cached across code edits.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/api/package.json packages/api/package.json
COPY packages/web/package.json packages/web/package.json
COPY packages/worker/package.json packages/worker/package.json
RUN npm ci

# Only the source this service actually needs.
COPY packages/shared packages/shared
COPY packages/db packages/db
COPY packages/api packages/api

RUN npm run generate --workspace=packages/db

ENV NODE_ENV=production
# Drop root for runtime.
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/health || exit 1
CMD ["npm", "run", "start", "--workspace=packages/api"]
