# Runs via tsx -- see packages/api/Dockerfile for why. The worker imports
# api's module source directly by relative path (same codebase, second
# entrypoint), so the api package sources must be present in the image too.
#
# Build from the repo root:
#   docker build -f packages/worker/Dockerfile -t goodhours-worker .
FROM node:22-alpine
WORKDIR /repo

RUN apk add --no-cache openssl libc6-compat

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/api/package.json packages/api/package.json
COPY packages/web/package.json packages/web/package.json
COPY packages/worker/package.json packages/worker/package.json
RUN npm ci

COPY packages/shared packages/shared
COPY packages/db packages/db
COPY packages/api packages/api
COPY packages/worker packages/worker

RUN npm run generate --workspace=packages/db

ENV NODE_ENV=production
USER node
CMD ["npm", "run", "start", "--workspace=packages/worker"]
