FROM node:24.17.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY build.mjs client.js crypto.js progress.js config.mjs page.html ./
COPY vendor ./vendor
ARG PUBLIC_ORIGIN=https://mutual-yes-alejo.fly.dev
RUN PUBLIC_ORIGIN=$PUBLIC_ORIGIN npm run build && npm prune --omit=dev

FROM node:24.17.0-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 DATA_DIR=/data
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json server.mjs config.mjs ./
COPY api ./api
EXPOSE 8080
CMD ["node", "server.mjs"]
