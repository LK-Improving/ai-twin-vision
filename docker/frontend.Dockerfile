# ---------- build stage ----------
FROM node:20-alpine AS builder
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@10.22.0 --activate

COPY pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY packages ./packages
COPY apps/frontend/builder ./apps/frontend/builder

RUN pnpm install --frozen-lockfile=false \
    --filter @dt/builder... \
 && pnpm --filter @dt/shared-types build \
 && pnpm --filter @dt/rendering-engine build \
 && pnpm --filter @dt/widgets build \
 && pnpm --filter @dt/builder build

# ---------- runtime stage ----------
FROM nginx:1.27-alpine AS runtime
ENV TZ=Asia/Shanghai

COPY --from=builder /workspace/apps/frontend/builder/dist /usr/share/nginx/html
COPY docker/nginx/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80 443
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
