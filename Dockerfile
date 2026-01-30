# syntax=docker/dockerfile:1

ARG NODE_VERSION=20-bookworm-slim

FROM node:${NODE_VERSION} AS deps
WORKDIR /repo
ENV NODE_ENV=development
ARG BUILD_TARGET=all
RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 make g++ openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY tsconfig.json tsconfig.packages.json ./
COPY apps ./apps
COPY packages ./packages
RUN if [ "$BUILD_TARGET" = "ws-server" ]; then \
      npm install --workspaces --include-workspace-root --workspace apps/ws-server --workspace packages/engine; \
    elif [ "$BUILD_TARGET" = "web" ]; then \
      npm install --workspaces --include-workspace-root --workspace apps/web --workspace packages/engine; \
    else \
      npm install --workspaces --include-workspace-root; \
    fi

FROM node:${NODE_VERSION} AS build
WORKDIR /repo
ENV NODE_ENV=production
ENV NEXT_SKIP_LOCKFILE_CHECK=true
ARG BUILD_TARGET=all
# Runtime envs are injected on Cloud Run; no build-time NEXT_PUBLIC_* required.
COPY --from=deps /repo .
RUN if [ "$BUILD_TARGET" = "ws-server" ]; then \
      npm run build:packages && npm run build -w apps/ws-server; \
    elif [ "$BUILD_TARGET" = "web" ]; then \
      npm run build:packages && npm run build -w apps/web; \
    else \
      npm run build:packages && npm run build -w apps/web && npm run build -w apps/ws-server; \
    fi

FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV SERVICE=web
ENV PORT=8090
RUN apt-get update && apt-get install -y --no-install-recommends \
  openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /repo/apps ./apps
COPY --from=build /repo/packages ./packages
COPY --from=deps /repo/node_modules ./node_modules
COPY package*.json ./
COPY start.sh ./
RUN chmod +x start.sh
CMD ["./start.sh"]

EXPOSE 8090 8099
