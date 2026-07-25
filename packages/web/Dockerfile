# Next.js web app. Build from the repo root:
#   docker build -f packages/web/Dockerfile -t goodhours-web .
FROM node:22-alpine
WORKDIR /repo

RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/api/package.json packages/api/package.json
COPY packages/web/package.json packages/web/package.json
COPY packages/worker/package.json packages/worker/package.json
RUN npm ci

COPY packages/shared packages/shared
COPY packages/web packages/web

# NEXT_PUBLIC_* must be present at build time to be inlined into the bundle.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=""
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
# Build, then hand the build output to the unprivileged runtime user so Next's
# on-disk cache is writable at runtime.
RUN npm run build --workspace=packages/web \
  && chown -R node:node /repo/packages/web/.next

ENV NODE_ENV=production
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=25s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000 || exit 1
CMD ["npm", "run", "start", "--workspace=packages/web"]
