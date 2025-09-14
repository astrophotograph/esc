#!/usr/bin/env python3
"""
Apply color fix to scopinator library for RTSP streaming.

This script fixes the color shift issue in MJPEG streaming from Seestar telescopes
by correcting the color space conversion in the protocol_handlers.py file.
"""

import os
import sys
import shutil
from pathlib import Path


def find_scopinator_file():
    """Find the scopinator protocol_handlers.py file in the virtual environment."""
    # Try common locations
    possible_paths = [
        # Local .venv
        Path("server/.venv/lib").glob("python*/site-packages/scopinator/seestar/protocol_handlers.py"),
        # System Python
        Path(sys.prefix) / "lib" / f"python{sys.version_info.major}.{sys.version_info.minor}" / "site-packages" / "scopinator" / "seestar" / "protocol_handlers.py",
    ]

    for path_pattern in possible_paths:
        if isinstance(path_pattern, Path):
            if path_pattern.exists():
                return path_pattern
        else:
            # It's a generator from glob
            for path in path_pattern:
                if path.exists():
                    return path

    # Try to import scopinator and find its location
    try:
        import scopinator
        scopinator_path = Path(scopinator.__file__).parent
        protocol_file = scopinator_path / "seestar" / "protocol_handlers.py"
        if protocol_file.exists():
            return protocol_file
    except ImportError:
        pass

    return None


def apply_fix(file_path):
    """Apply the color fix to the protocol_handlers.py file."""
    print(f"Reading file: {file_path}")

    # Create backup
    backup_path = str(file_path) + ".backup"
    if not Path(backup_path).exists():
        shutil.copy2(file_path, backup_path)
        print(f"Created backup: {backup_path}")

    with open(file_path, 'r') as f:
        content = f.read()

    # Check if fix is already applied
    if "# REMOVED: Causes color shift" in content or "# FIX: No conversion needed" in content:
        print("Fix already applied!")
        return True

    # Find and replace the problematic line
    original_line = "            img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)"

    if original_line not in content:
        print("WARNING: Could not find the line to fix. The file may have been modified.")
        print("Looking for alternative patterns...")

        # Try to find the function and context
        if "_convert_star_image" in content and "cv2.COLOR_RGB2BGR" in content:
            # Find the exact line with COLOR_RGB2BGR
            lines = content.split('\n')
            for i, line in enumerate(lines):
                if "cv2.COLOR_RGB2BGR" in line and "cvtColor" in line:
                    print(f"Found color conversion at line {i+1}: {line.strip()}")
                    # Comment out the line
                    lines[i] = "            # " + line.strip() + "  # REMOVED: Causes color shift - image is already in BGR format"
                    content = '\n'.join(lines)
                    break
        else:
            print("ERROR: Could not locate the color conversion code.")
            return False
    else:
        # Replace the line with a comment
        replacement = """            # The telescope sends images in BGR format already, so no conversion needed
            # img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)  # REMOVED: Causes color shift"""

        content = content.replace(original_line, replacement)

    # Write the fixed content
    with open(file_path, 'w') as f:
        f.write(content)

    print("Fix applied successfully!")
    return True


def main():
    """Main function to apply the scopinator color fix."""
    print("Scopinator Color Fix for RTSP Streaming")
    print("=" * 50)

    # Find the file
    file_path = find_scopinator_file()

    if not file_path:
        print("ERROR: Could not find scopinator/seestar/protocol_handlers.py")
        print("\nPlease ensure scopinator is installed:")
        print("  cd server && uv sync")
        sys.exit(1)

    print(f"Found scopinator file: {file_path}")

    # Apply the fix
    if apply_fix(file_path):
        print("\nColor fix applied successfully!")
        print("The RTSP streaming should now display correct colors.")
        print("\nTo revert the fix, restore from backup:")
        print(f"  cp {file_path}.backup {file_path}")
    else:
        print("\nFailed to apply fix. Please check the error messages above.")
        sys.exit(1)


if __name__ == "__main__":
    main()