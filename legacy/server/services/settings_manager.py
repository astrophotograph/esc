"""
Settings manager for reading application settings from the shared settings file.
"""

import json
import os
from pathlib import Path
from typing import Optional, Dict, Any
from loguru import logger


class SettingsManager:
    """Manager for reading application settings."""
    
    def __init__(self):
        # Use the same path as the UI - data/settings in the UI directory
        # First try the environment variable for the base path
        base_path = os.getenv("ESC_BASE_PATH", "")
        if not base_path:
            # Default to the parent directory (main) from server
            base_path = Path(__file__).parent.parent.parent.resolve()
        else:
            base_path = Path(base_path)
            
        # Settings are stored in ui/data/settings
        self.settings_file = base_path / "ui" / "data" / "settings" / "app-settings.json"
        
        # Also support a user home directory settings file as fallback
        self.user_settings_file = Path.home() / ".esc" / "settings.json"
        
        logger.info(f"Settings file paths: {self.settings_file}, {self.user_settings_file}")
    
    def load_settings(self) -> Dict[str, Any]:
        """Load settings from file."""
        # Try the UI settings file first
        if self.settings_file.exists():
            try:
                with open(self.settings_file, 'r') as f:
                    settings = json.load(f)
                    logger.debug(f"Loaded settings from {self.settings_file}")
                    return settings
            except Exception as e:
                logger.error(f"Error loading settings from {self.settings_file}: {e}")
        
        # Try the user home directory settings
        if self.user_settings_file.exists():
            try:
                with open(self.user_settings_file, 'r') as f:
                    settings = json.load(f)
                    logger.debug(f"Loaded settings from {self.user_settings_file}")
                    return settings
            except Exception as e:
                logger.error(f"Error loading settings from {self.user_settings_file}: {e}")
        
        logger.debug("No settings file found, using defaults")
        return {}
    
    def get_astrometry_api_key(self) -> Optional[str]:
        """Get the Astrometry.net API key from settings."""
        settings = self.load_settings()

        # Navigate through the settings structure
        api_keys = settings.get("apiKeys", {})
        astrometry = api_keys.get("astrometry", {})

        # Only return the key if the service is enabled
        if astrometry.get("enabled", False):
            api_key = astrometry.get("apiKey", "")
            if api_key and not api_key.startswith("•"):  # Don't return masked keys
                logger.debug("Found Astrometry.net API key in settings")
                return api_key

        return None
    
    def get_astrometry_api_url(self) -> Optional[str]:
        """Get the Astrometry.net API URL from settings."""
        settings = self.load_settings()
        
        # Navigate through the settings structure
        api_keys = settings.get("apiKeys", {})
        astrometry = api_keys.get("astrometry", {})
        
        # Return custom URL if set
        api_url = astrometry.get("apiUrl", "")
        if api_url:
            logger.debug(f"Using custom Astrometry.net API URL: {api_url}")
            return api_url
            
        return None


# Global instance
_settings_manager = None


def get_settings_manager() -> SettingsManager:
    """Get the global settings manager instance."""
    global _settings_manager
    if _settings_manager is None:
        _settings_manager = SettingsManager()
    return _settings_manager