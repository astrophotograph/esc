# Next.js UI Dockerfile
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies for Node.js builds
RUN apk add --no-cache \
    curl \
    git

# Copy package files
COPY package*.json ./

# Install dependencies with legacy peer deps (as specified in CLAUDE.md)
RUN npm install --legacy-peer-deps

# Copy application source
COPY . .

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 -G nodejs && \
    chown -R nextjs:nodejs /app
USER nextjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Start the development server
CMD ["npm", "run", "dev"]