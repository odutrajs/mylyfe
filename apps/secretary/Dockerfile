FROM node:22-bookworm-slim AS deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/secretary/package.json apps/secretary/package.json
COPY packages/domain/package.json packages/domain/package.json

RUN npm ci

FROM deps AS build

COPY tsconfig.base.json ./
COPY apps/secretary apps/secretary

RUN npm run build -w @mylyfe/secretary \
  && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV SECRETARY_PORT=3334

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/secretary/package.json ./apps/secretary/package.json
COPY --from=build /app/apps/secretary/dist ./apps/secretary/dist

EXPOSE 3334

CMD ["node", "apps/secretary/dist/index.js"]
