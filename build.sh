#!/bin/bash

# ALP Experimental Build Script
# Generates a timestamp tag and pushes it to trigger automated build

set -e

# Generate timestamp in format YYYYMMDD-HHmmss
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
TAG_NAME="build-${TIMESTAMP}"

echo "🚀 Starting automated build process..."
echo "📅 Generated timestamp: ${TIMESTAMP}"
echo "🏷️  Tag name: ${TAG_NAME}"

# Ensure we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "❌ Error: Not in a git repository"
    exit 1
fi

# Check if there are uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo "⚠️  Warning: You have uncommitted changes"
    read -p "Do you want to continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Build cancelled"
        exit 1
    fi
fi

# Get current branch
CURRENT_BRANCH=$(git branch --show-current)
echo "📋 Current branch: ${CURRENT_BRANCH}"

# Create and push the tag
echo "🏷️  Creating tag..."
git tag "${TAG_NAME}" -m "Automated build trigger - ${TIMESTAMP}"

echo "📤 Pushing tag to origin..."
git push origin "${TAG_NAME}"

echo "✅ Build triggered successfully!"
echo "🔗 You can monitor the build at: https://github.com/$(git config --get remote.origin.url | sed 's/.*github.com[:/]\([^.]*\).*/\1/')/actions"
echo "🏷️  Tag: ${TAG_NAME}"
echo ""
echo "💡 To delete this tag later (if needed):"
echo "   git tag -d ${TAG_NAME}"
echo "   git push origin --delete ${TAG_NAME}"