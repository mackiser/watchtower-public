# Watchtower — single-service image: the API serves both the JSON API and the built
# React frontend (see apps/api/src/app.ts), so this is the only container you need to deploy
# alongside a Postgres database. Debian-based (not alpine) to avoid Prisma's musl/openssl
# engine-binary headaches on alpine.

# Base image digest-pinned for supply-chain integrity (reproducible builds, no silent tag drift).
# To update: `docker buildx imagetools inspect node:20-bookworm-slim` and replace the digest below.
FROM node:20-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0 AS build
WORKDIR /app

# Prisma's `generate` step probes the local OpenSSL version to pick the matching query-engine
# binary. Without this, the build stage has no OpenSSL at all, detection silently fails, and
# Prisma defaults to an openssl-1.1.x engine that doesn't match the runtime stage's actual
# OpenSSL 3.0.x — which breaks the query engine at container startup. Installing it here first
# means generate detects the real version instead of guessing.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install workspace deps first (better layer caching). Uses the committed package-lock.json
# for reproducible builds.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
# --ignore-scripts: the root postinstall builds packages/shared, but its source/tsconfig aren't
# copied in yet at this point (package.json-only layer, for caching) — the explicit
# `npm run build` below rebuilds packages/shared anyway once the full source is present.
RUN npm ci --ignore-scripts

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY apps/web apps/web
COPY scripts scripts

# `prisma generate` (part of the api build) only reads schema.prisma to emit client code — it
# never connects to a database — but it still insists DATABASE_URL be defined, so a placeholder
# is enough at build time. The real value is supplied at container runtime.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
# Public-demo sign-in hint, inlined by Vite at build time. Empty (the default) shows nothing on
# the login page; the demo build sets both (see docker-compose.demo.yml and README).
ARG VITE_DEMO_EMAIL=
ARG VITE_DEMO_PASSWORD=
ENV VITE_DEMO_EMAIL=$VITE_DEMO_EMAIL
ENV VITE_DEMO_PASSWORD=$VITE_DEMO_PASSWORD
RUN npm run build

FROM node:20-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0 AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
# Workspace-local deps that npm didn't hoist to the root node_modules (e.g. otplib, whose nested
# @otplib/* packages force it under apps/api). Node's ESM resolver looks here too, so the runtime
# stage needs it — the root node_modules copy alone leaves these unresolved.
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/scripts ./scripts
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Don't run the app as root — the node base image ships an unprivileged "node" user.
USER node

EXPOSE 4000
CMD ["./docker-entrypoint.sh"]
