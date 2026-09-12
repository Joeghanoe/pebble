# Pebble web — Vite build, then nginx serving the static bundle only. All data comes
# from the API through oauth2-proxy; nginx never proxies anything itself.
FROM oven/bun:1.3-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/bun.lock ./
RUN bun install --frozen-lockfile
COPY frontend ./
# `bun run build` typechecks first (tsc -p tsconfig.build.json), so a type error fails
# the image rather than shipping.
RUN bun run build

FROM nginx:1.27-alpine
# nginx's image renders /etc/nginx/templates/*.template with envsubst at start, which is
# how $PORT (injected by Railway) reaches the listen directive.
COPY infra/web.nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
ENV PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- "http://127.0.0.1:${PORT}/" >/dev/null || exit 1
