"""
Utilities for getting writable application directories.
"""
import os
import sys
from pathlib import Path


def get_app_data_dir() -> Path:
    """Get the application data directory based on the platform and environment."""
    # Check if we're running in an Electron app bundle
    if '.app/Contents/Resources' in os.path.abspath(__file__):
        # macOS app bundle
        home = Path.home()
        app_dir = home / 'Library' / 'Application Support' / 'ESC'
    elif sys.platform == 'win32' and getattr(sys, 'frozen', False):
        # Windows frozen app
        app_data = os.environ.get('APPDATA', Path.home() / 'AppData' / 'Roaming')
        app_dir = Path(app_data) / 'ESC'
    elif sys.platform == 'linux' and getattr(sys, 'frozen', False):
        # Linux frozen app
        home = Path.home()
        app_dir = home / '.local' / 'share' / 'ESC'
    else:
        # Development environment - use current directory
        app_dir = Path.cwd()
    
    # Create the app directory if it doesn't exist
    try:
        app_dir.mkdir(parents=True, exist_ok=True)
    except (PermissionError, OSError):
        # Fall back to temp directory if we can't create app dir
        import tempfile
        app_dir = Path(tempfile.gettempdir()) / 'ESC'
        app_dir.mkdir(parents=True, exist_ok=True)
    
    return app_dir


def get_writable_dir(dirname: str, fallback: Path = None) -> Path:
    """
    Get a writable directory for the given purpose.
    
    Args:
        dirname: Name of the directory (e.g., 'uploads', 'sky_tiles', 'processed')
        fallback: Fallback path if the default location fails
    
    Returns:
        Path to the writable directory
    """
    # First try the app data directory
    app_dir = get_app_data_dir()
    target_dir = app_dir / dirname
    
    try:
        target_dir.mkdir(parents=True, exist_ok=True)
        # Test if we can actually write to it
        test_file = target_dir / '.write_test'
        test_file.touch()
        test_file.unlink()
        return target_dir
    except (PermissionError, OSError):
        # If we can't write to app dir, try fallback
        if fallback:
            try:
                fallback.mkdir(parents=True, exist_ok=True)
                return fallback
            except (PermissionError, OSError):
                pass
        
        # Last resort: use temp directory
        import tempfile
        temp_dir = Path(tempfile.gettempdir()) / 'ESC' / dirname
        temp_dir.mkdir(parents=True, exist_ok=True)
        return temp_dir