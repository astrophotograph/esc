# ESC Application Icons

This directory contains all the icon files for the ESC Electron application.

## Icon Files

- `icon.png` - The main source icon (1024x1024)
- `icon_*.png` - Various size variants generated from the main icon
- `icon.icns` - macOS application icon
- `icon.iconset/` - Directory containing icons for .icns generation
- `icon.svg` - Vector version (if available)

## Regenerating Icons

To regenerate all icon sizes from `icon.png`, you have two options:

### Option 1: Shell Script (macOS/Linux)

```bash
cd electron
./generate-icons.sh
```

This script requires ImageMagick:
```bash
brew install imagemagick  # macOS
sudo apt-get install imagemagick  # Ubuntu/Debian
```

### Option 2: Node.js Script (Cross-platform)

First install the required dependency:
```bash
cd electron
npm install sharp
```

Then run:
```bash
node generate-icons.js
```

## Icon Sizes

The following sizes are generated:
- 16x16 (icon_16.png)
- 32x32 (icon_32.png)
- 64x64 (icon_64.png)
- 128x128 (icon_128.png)
- 256x256 (icon_256.png)
- 512x512 (icon_512.png)
- 1024x1024 (icon_1024.png)

## macOS .icns File

The .icns file is automatically generated on macOS. If you need to regenerate it manually:

```bash
iconutil -c icns icon.iconset -o icon.icns
```

## Updating the Main Icon

To update the ESC branding:
1. Replace `icon.png` with your new 1024x1024 icon
2. Run one of the generation scripts above
3. The .icns file will be automatically updated on macOS