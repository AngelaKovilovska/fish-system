# Stage 1: Build client
FROM node:20-alpine AS builder

WORKDIR /app/client
COPY client/package*.json ./
RUN npm install --include=dev
COPY client/ ./
RUN npm run build

# Stage 2: Production server
FROM node:20-alpine

# Create non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app/server
COPY server/package*.json ./
RUN npm install --production

COPY server/ ./
COPY --from=builder /app/client/dist /app/client/dist

# Switch to non-root user
USER appuser

EXPOSE 3000

WORKDIR /app/server
CMD ["node", "index.js"]
