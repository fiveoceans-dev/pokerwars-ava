FROM node:20-slim AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/package.json

RUN npm install

COPY apps/web apps/web
COPY tsconfig.base.json tsconfig.base.json

RUN npm --workspace apps/web run build

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web ./apps/web
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 8080
CMD ["npm", "--workspace", "apps/web", "run", "start", "--", "-p", "8080"]
