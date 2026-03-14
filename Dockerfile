# ── Stage 1: Install dependencies ──
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/sdk/package.json packages/sdk/
COPY packages/shared/package.json packages/shared/
COPY packages/cli/package.json packages/cli/
RUN npm ci

# ── Stage 2: Build server + UI ──
FROM deps AS build
COPY . .
RUN npm run build:server && npm run build:ui

# ── Stage 3: Production server ──
FROM node:20-slim AS server
WORKDIR /app
COPY --from=build /app/dist-server ./dist-server
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
USER appuser
ENV PORT=3141
EXPOSE 3141
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3141/health').then(r=>{if(!r.ok)throw r})" || exit 1
CMD ["node", "dist-server/index.js"]

# ── Stage 4: Production UI ──
FROM nginx:alpine AS ui
COPY --from=build /app/dist-ui /usr/share/nginx/html
COPY <<'EOF' /etc/nginx/conf.d/default.conf
server {
    listen 80;
    root /usr/share/nginx/html;
    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF
EXPOSE 80
