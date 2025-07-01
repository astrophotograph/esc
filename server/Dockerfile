# Python FastAPI Server Dockerfile
FROM python:3.12-slim

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
COPY pyproject.toml requirements.txt ./

# Install Python dependencies using uv as root
RUN uv pip install --system -r requirements.txt

# Copy application code
COPY . .

# Create non-root user and change ownership of /app after all files are copied
RUN useradd --create-home --shell /bin/bash --uid 1000 telescope && \
    chown -R telescope:telescope /app

# Switch to non-root user
USER telescope

# Expose port
EXPOSE 8000

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Start the server
CMD ["python", "main.py", "server", "--server-port", "8000"]