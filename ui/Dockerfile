# Next.js UI Dockerfile
FROM node:20-alpine

# Install dependencies for Node.js builds
RUN apk add --no-cache \
    curl \
    git

# Set working directory and ensure ownership
WORKDIR /app

# Copy package files with proper ownership
COPY  package*.json ./

# Install dependencies with legacy peer deps (as specified in CLAUDE.md)
RUN npm install --legacy-peer-deps

# Copy application source with proper ownership
COPY  . .

# Create .next directory with proper permissions for trace files
RUN mkdir -p .next && chmod 755 .next

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Start the development server
CMD ["npm", "run", "dev"]
