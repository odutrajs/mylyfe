FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/domain/package.json packages/domain/package.json

RUN npm ci

FROM deps AS build

COPY tsconfig.base.json ./
COPY apps/api apps/api
COPY packages/domain packages/domain

RUN npm run build -w @mylyfe/domain \
  && npm run build -w @mylyfe/api \
  && npm prune --omit=dev

FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV API_PORT=3333

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/packages/domain/package.json ./packages/domain/package.json
COPY --from=build /app/packages/domain/dist ./packages/domain/dist

EXPOSE 3333

CMD ["node", "apps/api/dist/index.js"]
