#!/bin/bash
# Build Docker images locally for ARM64 (Apple Silicon)

echo "Building Docker images for ARM64 (Apple Silicon)..."

# Ensure Docker buildx is available
docker buildx version >/dev/null 2>&1 || {
    echo "Docker buildx not found. Please update Docker Desktop."
    exit 1
}

# Build server with ARM64 optimizations
echo "Building server image..."
docker build \
    --platform linux/arm64 \
    -f server/Dockerfile.arm64 \
    -t esc-server:arm64 \
    ./server

if [ $? -ne 0 ]; then
    echo "Server build failed, trying standard Dockerfile..."
    docker build \
        --platform linux/arm64 \
        -f server/Dockerfile \
        -t esc-server:arm64 \
        ./server
fi

# Build UI
echo "Building UI image..."
docker build \
    --platform linux/arm64 \
    -f ui/Dockerfile \
    -t esc-ui:arm64 \
    ./ui

echo "Build complete. You can run with:"
echo "docker run --rm -it --network host esc-server:arm64"
echo "docker run --rm -it --network host esc-ui:arm64"