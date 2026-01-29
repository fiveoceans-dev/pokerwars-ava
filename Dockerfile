# syntax=docker/dockerfile:1

ARG NODE_VERSION=20-alpine

FROM node:${NODE_VERSION} AS deps
WORKDIR /repo
ENV NODE_ENV=development
ARG BUILD_TARGET=all
RUN apk add --no-cache python3 make g++
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
# Build-time envs for Next.js (required during static generation)
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
ARG WALLETCONNECT_PROJECT_ID
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=${NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID}
ENV WALLETCONNECT_PROJECT_ID=${WALLETCONNECT_PROJECT_ID}
# Carry env placeholders so runtime values survive static bundling
RUN mkdir -p /tmp/env-inject && \
  printf 'window.__NEXT_PUBLIC_WS_URL = "%s";\n' "${NEXT_PUBLIC_WS_URL:-}" > /tmp/env-inject/ws.js
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
COPY --from=build /repo/apps ./apps
COPY --from=build /repo/packages ./packages
COPY --from=deps /repo/node_modules ./node_modules
COPY package*.json ./
COPY start.sh ./
RUN chmod +x start.sh
CMD ["./start.sh"]

EXPOSE 8090 8099
