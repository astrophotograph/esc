#!/bin/bash

echo "🚀 Starting MediaMTX WebRTC test..."

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

echo "📋 Starting MediaMTX streaming server..."
docker-compose -f docker-compose.webrtc.yml up -d mediamtx

echo "⏳ Waiting for MediaMTX to start..."
sleep 5

echo "🎬 Starting FFmpeg stream pusher..."
# Push the test telescope stream to MediaMTX
docker run --rm -d --name alp-ffmpeg-test \
    --network host \
    linuxserver/ffmpeg:latest \
    -re -f mjpeg -i http://localhost:8000/api/webrtc/test/video-stream \
    -c:v libx264 -preset ultrafast -tune zerolatency -s 640x480 -r 30 \
    -f rtsp rtsp://localhost:8554/telescope-test

echo "✅ MediaMTX WebRTC test setup complete!"
echo ""
echo "🌐 Access URLs:"
echo "  - MediaMTX Web UI:  http://localhost:9997"
echo "  - WebRTC Stream:    http://localhost:8889/telescope-test"
echo "  - HLS Stream:       http://localhost:8888/telescope-test/index.m3u8"
echo ""
echo "🔧 To stop the test:"
echo "  docker stop alp-ffmpeg-test"
echo "  docker-compose -f docker-compose.webrtc.yml down"
echo ""
echo "📊 Check status:"
echo "  curl http://localhost:9997/v3/paths/list"