#!/usr/bin/env python3
"""
Nuitka build script for the ESC server
This creates a standalone executable using Nuitka compiler
"""

import os
import sys
import subprocess
import shutil
from pathlib import Path

def build_with_nuitka():
    """Build the server using Nuitka"""
    
    print("Building ESC server with Nuitka...")
    print("-" * 50)
    
    # Ensure we're in the server directory
    server_dir = Path(__file__).parent
    os.chdir(server_dir)
    
    # Clean previous builds
    dist_dir = server_dir / "dist-nuitka"
    if dist_dir.exists():
        print(f"Cleaning previous build at {dist_dir}")
        shutil.rmtree(dist_dir)
    dist_dir.mkdir(exist_ok=True)
    
    # Base Nuitka arguments
    nuitka_args = [
        sys.executable, "-m", "nuitka",
        
        # Output options
        "--standalone",  # Create standalone distribution
        "--onefile",     # Single file output (optional, remove for folder output)
        "--output-dir=dist-nuitka",
        "--output-filename=esc-server",
        
        # Performance options
        "--assume-yes-for-downloads",  # Auto-download requirements
        "--enable-plugin=anti-bloat",  # Remove unnecessary modules
        "--enable-plugin=data-hiding",  # Hide data files in binary
        
        # Python options
        "--python-flag=-O",  # Optimize Python code
        "--python-flag=no_site",  # Don't include site-packages
        
        # Include necessary modules and packages
        "--include-package=api",
        "--include-package=models", 
        "--include-package=services",
        "--include-package=smarttel",
        "--include-package=cli",
        
        # Include problematic imports explicitly
        "--include-module=tzlocal",
        "--include-module=pydash",
        "--include-module=uvicorn",
        "--include-module=uvicorn.workers",
        "--include-module=uvicorn.protocols.http",
        "--include-module=uvicorn.protocols.http.h11_impl",
        "--include-module=uvicorn.protocols.http.httptools_impl",
        "--include-module=uvicorn.protocols.websockets",
        "--include-module=uvicorn.protocols.websockets.websockets_impl",
        "--include-module=uvicorn.lifespan",
        "--include-module=uvicorn.lifespan.on",
        "--include-module=uvicorn.loops",
        "--include-module=uvicorn.loops.auto",
        "--include-module=uvicorn.loops.asyncio",
        "--include-module=uvicorn.logging",
        
        # FastAPI and related
        "--include-module=fastapi",
        "--include-module=starlette",
        "--include-module=pydantic",
        "--include-module=anyio",
        
        # Scientific packages
        "--include-module=numpy",
        "--include-module=cv2",
        "--include-module=torch",
        "--include-module=torchvision",
        "--include-module=PIL",
        "--include-module=skimage",
        "--include-module=astropy",
        
        # Database
        "--include-module=aiosqlite",
        "--include-module=sqlalchemy",
        
        # Include data files
        "--include-data-dir=data=data",
        
        # Compilation options
        "--show-progress",
        "--show-memory",
        
        # macOS specific
        "--macos-create-app-bundle",
        "--macos-app-name=ESC-Server",
        
        # Main script
        "main.py"
    ]
    
    # For faster builds during development, you can use these options instead:
    if "--fast" in sys.argv:
        print("Using fast build mode (no onefile, less optimization)")
        # Remove onefile for faster builds
        nuitka_args.remove("--onefile")
        # Remove optimization
        nuitka_args.remove("--python-flag=-O")
        # Add follow imports for better compatibility
        nuitka_args.append("--follow-imports")
    
    if "--debug" in sys.argv:
        print("Using debug build mode")
        nuitka_args.append("--debug")
        nuitka_args.append("--trace-execution")
    
    print(f"Running Nuitka with {len(nuitka_args)} arguments")
    print("This may take 10-30 minutes for a full build...")
    print()
    
    try:
        # Run Nuitka
        result = subprocess.run(nuitka_args, check=True)
        
        print()
        print("=" * 50)
        print("Build completed successfully!")
        print(f"Output location: {dist_dir}")
        
        # Check output
        if "--onefile" in nuitka_args:
            output_file = dist_dir / "esc-server"
            if not output_file.exists():
                output_file = dist_dir / "esc-server.bin"
            if not output_file.exists():
                output_file = dist_dir / "esc-server.exe"
                
            if output_file.exists():
                size_mb = output_file.stat().st_size / (1024 * 1024)
                print(f"Executable: {output_file} ({size_mb:.1f} MB)")
                print()
                print("To test the build, run:")
                print(f"  {output_file} --help")
            else:
                print("Warning: Could not find output executable")
        else:
            output_dir = dist_dir / "esc-server.dist"
            if output_dir.exists():
                print(f"Distribution folder: {output_dir}")
                print()
                print("To test the build, run:")
                print(f"  {output_dir}/esc-server --help")
        
        return 0
        
    except subprocess.CalledProcessError as e:
        print()
        print("=" * 50)
        print(f"Build failed with error code {e.returncode}")
        print("Check the output above for error details")
        return 1
    except Exception as e:
        print()
        print("=" * 50)
        print(f"Build failed with error: {e}")
        return 1

if __name__ == "__main__":
    # Check if Nuitka is installed
    try:
        import nuitka
        print(f"Using Nuitka version: {nuitka.__version__}")
    except ImportError:
        print("Error: Nuitka is not installed")
        print("Install it with: uv add --dev nuitka")
        sys.exit(1)
    
    sys.exit(build_with_nuitka())