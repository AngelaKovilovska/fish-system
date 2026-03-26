# Stage 1: Build client
FROM node:20-alpine AS builder

WORKDIR /app/client
COPY client/package*.json ./
RUN npm install --include=dev
COPY client/ ./
RUN npm run build

# Stage 2: Production server
FROM node:20-alpine

WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm install --production

COPY server/ ./server/
COPY --from=builder /app/client/dist ./client/dist

EXPOSE 3000

CMD ["node", "server/index.js"]
