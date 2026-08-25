FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/domain/package.json packages/domain/package.json

RUN npm ci

COPY tsconfig.base.json ./
COPY apps/web apps/web
COPY packages/domain packages/domain

ARG VITE_API_URL=/api
ARG VITE_PLAN_PRICE_LABEL=R$ 29,90/mês
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_PLAN_PRICE_LABEL=$VITE_PLAN_PRICE_LABEL

RUN npm run build -w @mylyfe/domain \
  && npm run build -w @mylyfe/web

FROM nginx:1.27-alpine

COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
