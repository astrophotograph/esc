#!/bin/bash

# Script to manually increment build number
# Usage: ./scripts/increment-build.sh

cd "$(dirname "$0")/.." || exit 1

echo "Incrementing build number..."
cd ui && node scripts/generate-version.js --increment-build --quiet

BUILD_NUMBER=$(cat ../.build-number)
echo "New build number: $BUILD_NUMBER"

# Also update build info
node scripts/generate-version.js --update-package --quiet
VERSION=$(node scripts/generate-version.js --quiet)
echo "Version: $VERSION (Build #$BUILD_NUMBER)"