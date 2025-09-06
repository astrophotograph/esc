# Raspberry Pi 4 Setup Guide

## The Problem

The Raspberry Pi 4 uses ARMv8.0 architecture (Cortex-A72), while many pre-compiled Python wheels from PyPI are optimized for ARMv8.1+ and include instructions like `ldaddal` (Large System Extensions atomic operations) that don't exist on ARMv8.0. This causes "Illegal instruction" errors when running the ESC telescope server.

The Raspberry Pi 5 uses ARMv8.2+ architecture and doesn't have this issue.

## Understanding Your System

Check your architecture:
```bash
uname -m  # Shows OS architecture (aarch64 for 64-bit, armv7l for 32-bit)
lscpu     # Shows hardware details including CPU model
```

## Solution Options

### Option 1: Fast Setup (5-10 minutes) - Try This First
```bash
./setup-rpi4-fast.sh
```
- Uses older package versions less likely to have ARMv8.1+ optimizations
- Only compiles packages if pre-built wheels fail
- May still have issues with some packages

### Option 2: Full Compilation (1-2 hours) - Most Reliable
```bash
./setup-rpi4-armv8.sh
```
- Compiles numpy, scipy, scikit-image, and pillow from source
- Uses ARMv8.0-specific compiler flags
- Guarantees no ARMv8.1+ instructions
- Takes significant time but ensures compatibility

### Option 3: Unified Script (Automatic Detection)
```bash
./setup-rpi-unified.sh
```
- Automatically detects your system configuration
- Chooses appropriate setup method
- Good for mixed Pi4/Pi5 deployments

## Technical Details

### ARMv8.0 vs ARMv8.1+ Differences

| Feature | ARMv8.0 (Pi4) | ARMv8.1+ (Pi5) |
|---------|---------------|----------------|
| Atomic Operations | LDXR/STXR loops | LSE instructions (ldaddal, etc.) |
| Performance | Slower atomics | Faster single-instruction atomics |
| Compatibility | Universal ARM64 | Requires newer processors |

### Problematic Instructions
The following ARMv8.1+ LSE instructions cause crashes on Pi4:
- `ldaddal` - Atomic load-add with acquire-release semantics
- `staddl` - Atomic store-add with release semantics  
- `swpal` - Atomic swap with acquire-release semantics
- `casal` - Atomic compare-and-swap with acquire-release semantics

### Compiler Flags for ARMv8.0
```bash
CFLAGS="-march=armv8-a -mtune=cortex-a72 -mno-outline-atomics"
```
- `-march=armv8-a`: Target ARMv8.0 architecture
- `-mtune=cortex-a72`: Optimize for Pi4's CPU
- `-mno-outline-atomics`: Disable runtime-selected atomics

## Verification

After installation, check for problematic instructions:
```bash
# Check a specific library
objdump -d .venv/lib/python3.*/site-packages/numpy/core/*.so | grep ldaddal

# Test basic operations
uv run python -c "import numpy as np; print(np.sum(np.ones(100)))"
```

## Troubleshooting

### Still Getting "Illegal Instruction" Errors?

1. Identify the problematic package:
   ```bash
   uv run python -c "import <package>"
   ```

2. Recompile that specific package:
   ```bash
   CFLAGS="-march=armv8-a -mtune=cortex-a72 -mno-outline-atomics" \
   uv pip install --no-binary <package> --force-reinstall <package>
   ```

3. Common problematic packages:
   - numpy (especially 2.x versions)
   - scipy (1.14+ has more optimizations)
   - opencv-python (4.11+ requires numpy 2.x)
   - scikit-image (depends on scipy)

### Package Version Compatibility

Working versions for Pi4:
- numpy==1.26.4 (last 1.x, fewer optimizations)
- opencv-python==4.10.0.84 (works with numpy 1.x)
- scipy<1.14.0 (avoids newer LSE optimizations)

## Alternative: 32-bit OS

If issues persist, consider using Raspberry Pi OS 32-bit (armv7l):
- No ARM64 instruction issues
- Uses different wheels (armv6l/armv7l)
- Performance penalty from 32-bit operations
- Memory limited to 4GB per process

## Performance Considerations

Compiling from source with ARMv8.0 flags means:
- No LSE atomic optimizations
- Slightly slower multi-threaded operations
- Still much faster than 32-bit OS
- Full 64-bit addressing and registers

## Docker Deployment

### Building Docker Images

The project includes `Dockerfile.armv8` which builds images compatible with both Pi4 and Pi5:

```bash
# Build locally using docker-compose
docker-compose -f docker-compose.armv8.yml build

# Or build directly
docker build -f server/Dockerfile.armv8 -t esc-server:armv8 ./server
```

The Dockerfile:
- Uses multi-stage build to reduce final image size
- Compiles numpy, scipy, scikit-image, and pillow from source with ARMv8.0 flags
- Sets `-march=armv8-a -mtune=cortex-a72 -mno-outline-atomics` to avoid ARMv8.1+ instructions
- Takes longer to build but ensures compatibility with Pi4

### GitHub Actions

The GitHub Actions workflow automatically uses `Dockerfile.armv8` for ARM64 builds, ensuring all published Docker images work on both Pi4 and Pi5.

## Summary

For Raspberry Pi 4 running 64-bit OS:
1. Try `setup-rpi4-fast.sh` first (5-10 minutes)
2. If that fails, use `setup-rpi4-armv8.sh` (1-2 hours, guaranteed to work)
3. For Docker deployments, use `Dockerfile.armv8` or `docker-compose.armv8.yml`
4. The issue is ARMv8.1+ instructions in PyPI wheels
5. Compiling from source with proper flags solves the problem