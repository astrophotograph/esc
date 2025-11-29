# Python FastAPI Server Dockerfile
# Multi-architecture build support for ARM64 and AMD64
FROM --platform=$TARGETPLATFORM python:3.12-slim

# Build arguments for platform detection
ARG TARGETPLATFORM
ARG BUILDPLATFORM

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    libopencv-dev \
    python3-opencv \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install uv package manager for faster Python dependency management
RUN pip install uv

# Set working directory
WORKDIR /app

# Copy dependency files
COPY pyproject.toml requirements.txt uv.lock ./

# Install Python dependencies using uv as root
RUN uv sync --frozen

# Copy application code
COPY . .

# Expose port
EXPOSE 8000

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Start the server
CMD ["uv", "run", "main.py", "server", "--server-port", "8000"]
