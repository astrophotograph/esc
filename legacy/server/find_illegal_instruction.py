#!/usr/bin/env python3
"""
Find which Python package is causing illegal instruction on ARMv8.0
Run this inside the Docker container on Pi4
"""

import sys
import subprocess
import os
from pathlib import Path

def check_so_file(so_path):
    """Check a .so file for ARMv8.1+ instructions"""
    problematic_instructions = [
        'ldaddal', 'staddl', 'swpal', 'casal',
        'ldclral', 'stclrl', 'ldeoral', 'steoral',
        'ldsmaxal', 'ldsminal', 'ldumaxal', 'lduminal'
    ]
    
    try:
        # Run objdump on the file
        result = subprocess.run(
            ['objdump', '-d', so_path],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        found_instructions = []
        for instruction in problematic_instructions:
            if instruction in result.stdout:
                # Count occurrences
                count = result.stdout.count(instruction)
                found_instructions.append(f"{instruction}({count})")
        
        return found_instructions
    except Exception as e:
        return None

def test_import(module_name):
    """Try to import a module and report success/failure"""
    print(f"\nTesting import: {module_name}")
    print("-" * 40)
    
    try:
        if module_name == 'PIL':
            import PIL
            module = PIL
        elif module_name == 'cv2':
            import cv2
            module = cv2
        elif module_name == 'numpy':
            import numpy
            module = numpy
            # Test basic operation
            a = numpy.ones(10)
            b = numpy.sum(a)
            print(f"  ✓ Basic numpy operation successful: sum={b}")
        elif module_name == 'scipy':
            import scipy
            module = scipy
        elif module_name == 'skimage':
            import skimage
            module = skimage
        else:
            module = __import__(module_name)
        
        print(f"  ✓ {module_name} imported successfully")
        
        # Find module location
        if hasattr(module, '__file__'):
            module_dir = Path(module.__file__).parent
            print(f"  Location: {module_dir}")
            
            # Check .so files in this module
            so_files = list(module_dir.rglob("*.so"))
            if so_files:
                print(f"  Found {len(so_files)} .so files, checking for ARMv8.1+ instructions...")
                
                problematic_files = []
                for so_file in so_files[:10]:  # Check first 10 to avoid taking too long
                    instructions = check_so_file(str(so_file))
                    if instructions:
                        problematic_files.append((so_file.name, instructions))
                
                if problematic_files:
                    print("  ⚠️  Found ARMv8.1+ instructions in:")
                    for filename, instructions in problematic_files:
                        print(f"      {filename}: {', '.join(instructions)}")
                else:
                    print("  ✓ No ARMv8.1+ instructions found")
        
        return True
        
    except Exception as e:
        print(f"  ✗ Failed to import {module_name}: {e}")
        return False

def main():
    print("=" * 50)
    print("ARMv8.1+ Instruction Checker for Python Packages")
    print("=" * 50)
    
    # Check system info
    print("\nSystem Information:")
    print("-" * 40)
    
    # Architecture
    arch = subprocess.run(['uname', '-m'], capture_output=True, text=True).stdout.strip()
    print(f"Architecture: {arch}")
    
    # Python version
    print(f"Python: {sys.version}")
    
    # CPU info
    try:
        with open('/proc/cpuinfo', 'r') as f:
            for line in f:
                if 'Model' in line or 'CPU architecture' in line:
                    print(line.strip())
                    break
    except:
        pass
    
    # Test critical packages
    packages_to_test = [
        'numpy',
        'scipy', 
        'cv2',
        'PIL',
        'skimage'
    ]
    
    print("\n" + "=" * 50)
    print("Testing Package Imports")
    print("=" * 50)
    
    failed_packages = []
    for package in packages_to_test:
        if not test_import(package):
            failed_packages.append(package)
    
    # Summary
    print("\n" + "=" * 50)
    print("Summary")
    print("=" * 50)
    
    if failed_packages:
        print(f"✗ Failed packages: {', '.join(failed_packages)}")
        print("\nThese packages likely contain ARMv8.1+ instructions")
        print("and need to be recompiled with ARMv8.0-compatible flags.")
    else:
        print("✓ All packages imported successfully!")
        print("\nHowever, if you're still getting illegal instructions,")
        print("the issue may occur during specific operations.")
        print("Check the packages marked with ⚠️ above.")
    
    # Try to trigger the illegal instruction
    print("\n" + "=" * 50)
    print("Attempting to trigger illegal instruction...")
    print("=" * 50)
    
    try:
        print("Running main.py imports...")
        exec(open('/app/main.py').read(), {'__name__': '__main__'})
    except Exception as e:
        print(f"Error during main.py execution: {e}")

if __name__ == '__main__':
    main()