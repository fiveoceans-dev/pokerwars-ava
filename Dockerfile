# syntax=docker/dockerfile:1

ARG NODE_VERSION=20-alpine

FROM node:${NODE_VERSION} AS deps
WORKDIR /repo
ENV NODE_ENV=development
RUN apk add --no-cache python3 make g++
COPY package*.json ./
COPY tsconfig.json tsconfig.packages.json ./
COPY apps ./apps
COPY packages ./packages
RUN npm install --workspaces --include-workspace-root

FROM node:${NODE_VERSION} AS build
WORKDIR /repo
ENV NODE_ENV=production
ENV NEXT_SKIP_LOCKFILE_CHECK=true
# Carry env placeholders so runtime values survive static bundling
RUN mkdir -p /tmp/env-inject && \
  printf 'window.__NEXT_PUBLIC_WS_URL = "%s";\n' "${NEXT_PUBLIC_WS_URL:-}" > /tmp/env-inject/ws.js
COPY --from=deps /repo .
RUN npm run build:packages \
  && npm run build -w apps/web \
  && npm run build -w apps/ws-server

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
