FROM node:24.19.0-bookworm-slim AS backend
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
COPY agents ./agents
RUN npm run build

FROM node:24.19.0-bookworm-slim AS web-build
WORKDIR /app/apps/web
COPY apps/web/package*.json ./
RUN npm ci --ignore-scripts
COPY apps/web ./
RUN npm run build

FROM node:24.19.0-bookworm-slim AS api
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=backend /app/node_modules ./node_modules
COPY --from=backend /app/dist ./dist
COPY --from=backend /app/package*.json ./
COPY --from=backend /app/agents ./agents
RUN mkdir -p /app/data /app/projects && chown -R node:node /app/data /app/projects
USER node
ENV NODE_ENV=production SENIOR_GATEWAY_HOST=0.0.0.0
EXPOSE 4000
CMD ["node", "dist/cli/index.js", "gateway", "start"]

FROM node:24.19.0-bookworm-slim AS web
WORKDIR /app/apps/web
COPY --from=web-build /app/apps/web/package*.json ./
COPY --from=web-build /app/apps/web/node_modules ./node_modules
COPY --from=web-build /app/apps/web/.next ./.next
COPY --from=web-build /app/apps/web/public ./public
COPY --from=web-build /app/apps/web/next.config.ts ./next.config.ts
USER node
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start", "--", "--hostname", "0.0.0.0"]
