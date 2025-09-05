#!/bin/bash
# Build Docker images with proper multi-platform support

# Detect the current platform
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ] || [ "$ARCH" = "aarch64" ]; then
    PLATFORM="linux/arm64"
elif [ "$ARCH" = "x86_64" ]; then
    PLATFORM="linux/amd64"
else
    echo "Unsupported architecture: $ARCH"
    exit 1
fi

echo "Building for platform: $PLATFORM"

# Build the images for the current platform
docker compose build --no-cache --progress plain

# Alternative: Build with explicit platform
# docker buildx build --platform=$PLATFORM --load -t esc-server:latest ./server
# docker buildx build --platform=$PLATFORM --load -t esc-ui:latest ./ui

echo "Build complete for $PLATFORM"