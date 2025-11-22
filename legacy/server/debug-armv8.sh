#!/bin/bash
# Debug script to find ARMv8.1+ instructions in Docker container

echo "=== Debugging ARMv8.1+ Instructions in Docker Container ==="
echo

# Function to check a Python package for problematic instructions
check_package() {
    local pkg=$1
    echo "Checking $pkg..."
    
    # Find the package location
    PKG_DIR=$(docker exec esc-server python -c "import $pkg; import os; print(os.path.dirname($pkg.__file__))" 2>/dev/null || echo "")
    
    if [ -n "$PKG_DIR" ]; then
        echo "  Location: $PKG_DIR"
        
        # Check for .so files with ARMv8.1+ instructions
        docker exec esc-server bash -c "
            for lib in \$(find '$PKG_DIR' -name '*.so' 2>/dev/null); do
                if objdump -d \"\$lib\" 2>/dev/null | grep -E 'ldaddal|staddl|swpal|casal|ldclral|stclrl' | head -1; then
                    echo \"  WARNING: \$lib contains ARMv8.1+ instructions!\"
                    objdump -d \"\$lib\" 2>/dev/null | grep -E 'ldaddal|staddl|swpal|casal' | head -5
                fi
            done
        " 2>/dev/null
    else
        echo "  Package not found or can't be imported"
    fi
    echo
}

# Install debugging tools in container
echo "Installing debugging tools in container..."
docker exec esc-server apt-get update
docker exec esc-server apt-get install -y gdb binutils file

# Check Python version and architecture
echo "Container architecture info:"
docker exec esc-server uname -m
docker exec esc-server python --version
echo

# Check critical packages
echo "Checking packages for ARMv8.1+ instructions..."
echo "============================================"
check_package numpy
check_package scipy
check_package cv2
check_package PIL
check_package skimage

# Try to run Python and catch the illegal instruction
echo "Attempting to import packages and catch illegal instruction..."
echo "============================================"

# Create a test script
docker exec esc-server bash -c 'cat > /tmp/test_imports.py << EOF
import signal
import sys

def handler(signum, frame):
    print(f"Caught signal {signum}")
    import traceback
    traceback.print_stack(frame)
    sys.exit(1)

signal.signal(signal.SIGILL, handler)

print("Testing imports...")
try:
    import numpy
    print("✓ numpy imported")
    # Test a numpy operation
    a = numpy.ones(10)
    b = numpy.sum(a)
    print(f"✓ numpy operations work: sum={b}")
except Exception as e:
    print(f"✗ numpy failed: {e}")

try:
    import scipy
    print("✓ scipy imported")
except Exception as e:
    print(f"✗ scipy failed: {e}")

try:
    import cv2
    print("✓ cv2 imported")
except Exception as e:
    print(f"✗ cv2 failed: {e}")

try:
    import PIL
    print("✓ PIL imported")
except Exception as e:
    print(f"✗ PIL failed: {e}")

print("All imports completed")
EOF'

# Run with gdb to catch the illegal instruction
echo
echo "Running with GDB to catch illegal instruction..."
docker exec esc-server bash -c 'gdb -batch -ex "run" -ex "where" -ex "disassemble \$pc-32,\$pc+32" -ex "info registers" --args python /tmp/test_imports.py' 2>&1 | tail -50

# Alternative: use catchsegv
echo
echo "Running with catchsegv..."
docker exec esc-server bash -c 'catchsegv python /tmp/test_imports.py' 2>&1

# Check if specific files are causing issues
echo
echo "Checking for common problematic files..."
docker exec esc-server bash -c '
    echo "Checking numpy core multiarray..."
    if [ -f /app/.venv/lib/python3.12/site-packages/numpy/core/_multiarray_umath.cpython-312-aarch64-linux-gnu.so ]; then
        objdump -d /app/.venv/lib/python3.12/site-packages/numpy/core/_multiarray_umath.cpython-312-aarch64-linux-gnu.so 2>/dev/null | grep -c ldaddal || echo "No ldaddal found"
    fi
'

echo
echo "=== Debug Complete ==="
echo "If you see ARMv8.1+ instructions above, those packages need to be recompiled."