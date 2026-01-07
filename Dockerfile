# Use Node.js 18 Alpine for smaller image
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json ./
COPY package-lock.json ./
COPY tsconfig.json ./

# Verify files and install dependencies
RUN ls -la && \
    if [ -f package-lock.json ]; then \
      echo "Found package-lock.json, using npm ci" && \
      npm ci --verbose; \
    else \
      echo "Error: package-lock.json not found!" && \
      exit 1; \
    fi

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Production image
FROM node:18-alpine

WORKDIR /app

# Copy package files and install production dependencies only
COPY package.json ./
COPY package-lock.json ./

# Verify files and install production dependencies
RUN ls -la && \
    if [ -f package-lock.json ]; then \
      echo "Found package-lock.json, using npm ci" && \
      npm ci --omit=dev --verbose; \
    else \
      echo "Error: package-lock.json not found!" && \
      exit 1; \
    fi

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Create logs directory
RUN mkdir -p logs

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
USER nodejs

# Expose port
EXPOSE 3000

# Start application
CMD ["node", "dist/index.js"]

