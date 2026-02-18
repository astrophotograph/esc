#!/usr/bin/env bash
# Build an esc-web .deb package.
#
# Prerequisites:
#   - dist-web/ must already be built (pnpm web:build)
#
# Usage:
#   ./deploy/build-deb.sh [version]
#   Version defaults to the value in package.json.

set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="${1:-$(node -p "require('./package.json').version")}"
PKG_NAME="esc-web"
ARCH="all"
DEB_FILE="${PKG_NAME}_${VERSION}_${ARCH}.deb"

echo "Building ${DEB_FILE}..."

# Verify dist-web exists
if [ ! -f dist-web/index.html ]; then
    echo "Error: dist-web/ not found. Run 'pnpm web:build' first." >&2
    exit 1
fi

# Create staging directory
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

APP="$STAGE/opt/esc"
mkdir -p "$APP"
mkdir -p "$STAGE/lib/systemd/system"
mkdir -p "$STAGE/DEBIAN"

# Copy application files
cp -r python "$APP/python"
cp -r dist-web "$APP/dist-web"
cp pyproject.toml "$APP/pyproject.toml"
cp uv.lock "$APP/uv.lock"

# Remove __pycache__ and .pyc files
find "$APP" -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
find "$APP" -name '*.pyc' -delete 2>/dev/null || true

# Copy systemd service
cp deploy/esc.service "$STAGE/lib/systemd/system/esc.service"

# Copy maintainer scripts
for script in postinst prerm postrm; do
    cp "deploy/$script" "$STAGE/DEBIAN/$script"
    chmod 755 "$STAGE/DEBIAN/$script"
done

# Calculate installed size (in KB)
INSTALLED_SIZE=$(du -sk "$STAGE" | cut -f1)

# Write control file
cat > "$STAGE/DEBIAN/control" <<EOF
Package: ${PKG_NAME}
Version: ${VERSION}
Section: science
Priority: optional
Architecture: ${ARCH}
Installed-Size: ${INSTALLED_SIZE}
Depends: curl, ca-certificates
Maintainer: Astrophotograph <esc@astrophotograph.org>
Homepage: https://github.com/astrophotograph/esc
Description: ESC Telescope Controller (web edition)
 Browser-based controller for Seestar smart telescopes.
 Runs as a single-process web server accessible from any device
 on the local network. Includes catalog search, imaging controls,
 session planning, and live video feed.
EOF

# Build the .deb
dpkg-deb --build --root-owner-group "$STAGE" "$DEB_FILE"
echo "Built: $DEB_FILE ($(du -h "$DEB_FILE" | cut -f1))"
