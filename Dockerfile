FROM node:22-alpine AS dashboard-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY web ./web
COPY vite.config.js ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY --from=dashboard-build /app/node_modules ./node_modules
RUN npm prune --omit=dev --ignore-scripts --offline && npm cache clean --force
COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node migrations ./migrations
COPY --chown=node:node test ./test
COPY --chown=node:node web/data.js ./web/data.js
COPY --from=dashboard-build --chown=node:node /app/dist ./dist
USER node
ENV NODE_ENV=development
EXPOSE 3000
CMD ["node", "src/server.js"]
