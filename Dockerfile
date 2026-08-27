FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY tsconfig.json ./
COPY src ./src
RUN npm install typescript tsx --no-save && npx tsc || true
CMD ["npx", "tsx", "src/index.ts"]
