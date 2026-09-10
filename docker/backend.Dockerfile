# ---------- build stage ----------
FROM node:20-alpine AS builder
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@10.22.0 --activate

COPY pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/backend/widget-server/package.json ./apps/backend/widget-server/

RUN pnpm install --frozen-lockfile=false \
    --filter @dt/widget-server... \
    --filter @dt/shared-types...

COPY packages/shared-types ./packages/shared-types
COPY apps/backend/widget-server ./apps/backend/widget-server

RUN pnpm --filter @dt/shared-types build \
 && pnpm --filter @dt/widget-server build \
 && pnpm deploy --filter @dt/widget-server --prod /output

# ---------- runtime stage ----------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production TZ=Asia/Shanghai

RUN apk add --no-cache curl tzdata \
 && addgroup -S app && adduser -S app -G app

COPY --from=builder --chown=app:app /output ./
RUN mkdir -p /app/uploads /app/logs && chown -R app:app /app/uploads /app/logs

USER app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/v1/health || exit 1

CMD ["node", "dist/main.js"]
