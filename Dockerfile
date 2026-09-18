FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG PUBLIC_ORIGIN
RUN PUBLIC_ORIGIN=$PUBLIC_ORIGIN npm run build
RUN npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json server.mjs config.mjs ./
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
