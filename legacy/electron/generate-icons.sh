#!/bin/bash

# Generate all icon sizes from icon.png
# Requires ImageMagick to be installed (brew install imagemagick)

set -e

# Change to the icons directory
cd "$(dirname "$0")/icons"

# Check if icon.png exists
if [ ! -f "icon.png" ]; then
    echo "Error: icon.png not found in icons directory"
    exit 1
fi

# Check if ImageMagick is installed and determine which command to use
if command -v magick &> /dev/null; then
    CONVERT_CMD="magick"
elif command -v convert &> /dev/null; then
    CONVERT_CMD="convert"
else
    echo "Error: ImageMagick is not installed. Install it with: brew install imagemagick"
    exit 1
fi

echo "Generating icon sizes from icon.png..."

# Generate various PNG sizes
for size in 16 32 64 128 256 512 1024; do
    echo "Creating icon_${size}.png (${size}x${size})..."
    $CONVERT_CMD icon.png -resize ${size}x${size} icon_${size}.png
    
    # Also create the simple numbered versions
    if [ $size -ne 1024 ]; then
        cp icon_${size}.png icon_${size}x${size}.png 2>/dev/null || true
    fi
done

# Create icon.iconset directory for macOS .icns generation
echo "Creating icon.iconset directory..."
rm -rf icon.iconset
mkdir -p icon.iconset

# Copy files with correct names for iconutil
cp icon_16.png icon.iconset/icon_16x16.png
cp icon_32.png icon.iconset/icon_16x16@2x.png
cp icon_32.png icon.iconset/icon_32x32.png
cp icon_64.png icon.iconset/icon_32x32@2x.png
cp icon_128.png icon.iconset/icon_128x128.png
cp icon_256.png icon.iconset/icon_128x128@2x.png
cp icon_256.png icon.iconset/icon_256x256.png
cp icon_512.png icon.iconset/icon_256x256@2x.png
cp icon_512.png icon.iconset/icon_512x512.png
cp icon_1024.png icon.iconset/icon_512x512@2x.png

# Generate .icns file for macOS
if command -v iconutil &> /dev/null; then
    echo "Generating icon.icns for macOS..."
    iconutil -c icns icon.iconset -o icon.icns
    echo "Successfully created icon.icns"
else
    echo "Warning: iconutil not found (only available on macOS). Skipping .icns generation."
    echo "To generate .icns on macOS, run: iconutil -c icns icon.iconset -o icon.icns"
fi

# Clean up the numbered versions in iconset (keep the directory for manual .icns generation if needed)
echo "Cleaning up icon.iconset..."
# Keep only the properly named files
find icon.iconset -name "*.png" | while read f; do
    basename=$(basename "$f")
    if [[ ! "$basename" =~ ^icon_(16x16|32x32|128x128|256x256|512x512)(@2x)?\.png$ ]]; then
        rm -f "$f" 2>/dev/null || true
    fi
done

echo "Icon generation complete!"
echo ""
echo "Generated files:"
ls -la icon*.png icon.icns 2>/dev/null | grep -v icon.iconset
echo ""
echo "icon.iconset directory preserved for manual .icns generation if needed"