FROM node:22-alpine AS build

WORKDIR /app/frontend

ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund || npm ci --no-audit --no-fund
COPY frontend/tsconfig.json frontend/vite.config.ts frontend/vitest.config.ts frontend/eslint.config.js frontend/tailwind.config.ts ./
COPY frontend/postcss.config.cjs frontend/components.json frontend/index.html ./
COPY frontend/public ./public
COPY frontend/src ./src

RUN npm run build

FROM nginx:1.27-alpine

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html

EXPOSE 80
