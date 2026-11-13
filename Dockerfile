# Multi-stage Dockerfile for FastLearn on Koyeb

# Stage 1: Build the React frontend
FROM node:22-alpine AS builder

WORKDIR /app

# Copy root package.json and frontend dependencies
COPY package.json ./
COPY frontend/package*.json ./frontend/

WORKDIR /app/frontend
RUN npm ci

# Copy frontend source and build
COPY frontend/ ./
RUN npm run build

# Stage 2: Production Node.js runner
FROM node:22-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=8000

# Copy root server and package files
COPY package.json server.js ./

# Copy built static assets from builder stage
COPY --from=builder /app/frontend/dist ./frontend/dist

# Expose HTTP port (Koyeb default: 8000)
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8000/health || exit 1

# Start the server
CMD ["node", "server.js"]
