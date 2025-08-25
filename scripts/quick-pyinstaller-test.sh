#!/bin/bash

# Quick PyInstaller test - just checks if all modules can be imported
# This is faster than a full build

echo "🔍 Quick PyInstaller dependency check..."
echo ""

cd "$(dirname "$0")/../server"

# Create a test script that imports everything
cat > test_imports.py << 'EOF'
#!/usr/bin/env python
"""Test if all required modules can be imported"""

import sys
print("Python:", sys.version)
print("")

modules_to_test = [
    # Core
    ("pydash", None),
    ("tzlocal", None),
    ("smarttel", None),
    
    # Web framework
    ("fastapi", None),
    ("pydantic", None),
    ("starlette", None),
    ("uvicorn", None),
    ("uvicorn.logging", None),
    ("uvicorn.loops", None),
    ("uvicorn.loops.auto", None),
    ("uvicorn.protocols", None),
    ("uvicorn.protocols.http", None),
    ("uvicorn.protocols.http.auto", None),
    ("uvicorn.protocols.websockets", None),
    ("uvicorn.protocols.websockets.auto", None),
    ("uvicorn.lifespan", None),
    ("uvicorn.lifespan.on", None),
    ("httpx", None),
    ("multipart", None),
    
    # Async/networking
    ("websockets", None),
    ("websockets.legacy", None),
    ("websockets.legacy.server", None),
    ("websockets.exceptions", None),
    ("aiortc", None),
    ("aiosqlite", None),
    ("netifaces", None),
    
    # Scientific
    ("numpy", None),
    ("numpy.typing", None),
    ("cv2", None),
    ("PIL", None),
    ("PIL.Image", None),
    ("PIL._imaging", None),
    ("skimage", None),
    ("skimage.filters", None),
    ("skimage.restoration", None),
    ("skimage.exposure", None),
    ("skimage.util", None),
    
    # Utils
    ("beartype", None),
    ("loguru", None),
    ("click", None),
    ("appdirs", None),
    ("psutil", None),
]

failed = []
for module_name, attr in modules_to_test:
    try:
        if '.' in module_name:
            # For submodules, import the parent first
            parts = module_name.split('.')
            parent = '.'.join(parts[:-1])
            __import__(parent)
        
        module = __import__(module_name)
        
        if attr:
            getattr(module, attr)
            print(f"✓ {module_name}.{attr}")
        else:
            print(f"✓ {module_name}")
    except ImportError as e:
        failed.append((module_name, str(e)))
        print(f"✗ {module_name}: {e}")
    except AttributeError as e:
        failed.append((module_name, str(e)))
        print(f"✗ {module_name}: {e}")

print("")
if failed:
    print(f"❌ {len(failed)} modules failed to import:")
    for name, error in failed:
        print(f"  - {name}: {error}")
    sys.exit(1)
else:
    print("✅ All modules imported successfully!")
EOF

echo "Testing module imports in current environment..."
echo ""
uv run python test_imports.py

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ All modules are available in the environment"
    echo ""
    echo "Now you can run a full PyInstaller build test with:"
    echo "  scripts/test-pyinstaller-locally.sh"
else
    echo ""
    echo "❌ Some modules are missing. Fix these before building with PyInstaller."
fi

# Clean up
rm -f test_imports.py