FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY tsconfig.json vite.config.ts vitest.config.ts eslint.config.js tailwind.config.ts ./
COPY postcss.config.cjs components.json index.html ./
COPY src ./src

RUN npm install

EXPOSE 5173

