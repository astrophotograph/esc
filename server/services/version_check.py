"""Version checking service for GitHub releases."""

import asyncio
import json
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from packaging import version
import httpx
from loguru import logger


class VersionChecker:
    """Service to check for new versions on GitHub."""
    
    def __init__(self, 
                 github_repo: str = "astrophotograph/esc",
                 current_version: str = "1.0.0",
                 cache_duration_hours: int = 6):
        self.github_repo = github_repo
        self.current_version = current_version
        self.cache_duration = timedelta(hours=cache_duration_hours)
        self.last_check: Optional[datetime] = None
        self.cached_result: Optional[Dict[str, Any]] = None
        
    async def check_for_updates(self, force_check: bool = False) -> Dict[str, Any]:
        """
        Check for updates from GitHub releases.
        
        Args:
            force_check: If True, bypass cache and force a fresh check
            
        Returns:
            Dict containing update information
        """
        # Check if we have a cached result that's still valid
        if not force_check and self._is_cache_valid():
            logger.debug("Using cached version check result")
            return self.cached_result
        
        try:
            # Fetch latest release from GitHub API
            github_data = await self._fetch_github_release()
            
            if not github_data:
                return {
                    "update_available": False,
                    "error": "Could not fetch release information",
                    "current_version": self.current_version
                }
            
            latest_version = github_data.get("tag_name", "").lstrip("v")
            
            # Compare versions
            update_available = self._is_newer_version(latest_version, self.current_version)
            
            result = {
                "update_available": update_available,
                "current_version": self.current_version,
                "latest_version": latest_version,
                "release_name": github_data.get("name"),
                "release_date": github_data.get("published_at"),
                "release_url": github_data.get("html_url"),
                "release_notes": github_data.get("body", "")[:500],  # Truncate release notes
                "download_url": self._extract_download_url(github_data),
                "last_checked": datetime.now().isoformat()
            }
            
            # Cache the result
            self.cached_result = result
            self.last_check = datetime.now()
            
            if update_available:
                logger.info(f"New version available: {latest_version} (current: {self.current_version})")
            else:
                logger.debug(f"No update available. Current version {self.current_version} is up to date")
            
            return result
            
        except Exception as e:
            logger.error(f"Error checking for updates: {e}")
            return {
                "update_available": False,
                "error": str(e),
                "current_version": self.current_version,
                "last_checked": datetime.now().isoformat()
            }
    
    async def _fetch_github_release(self) -> Optional[Dict[str, Any]]:
        """Fetch the latest release from GitHub API."""
        url = f"https://api.github.com/repos/{self.github_repo}/releases/latest"
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                response = await client.get(url)
                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 404:
                    logger.warning(f"Repository {self.github_repo} not found or has no releases")
                else:
                    logger.error(f"HTTP error {e.response.status_code} when checking for updates")
                return None
            except Exception as e:
                logger.error(f"Error fetching GitHub release: {e}")
                return None
    
    def _is_newer_version(self, latest: str, current: str) -> bool:
        """Compare version strings to determine if latest is newer."""
        try:
            return version.parse(latest) > version.parse(current)
        except Exception as e:
            logger.warning(f"Error comparing versions '{latest}' vs '{current}': {e}")
            # Fallback to string comparison if version parsing fails
            return latest != current
    
    def _extract_download_url(self, github_data: Dict[str, Any]) -> Optional[str]:
        """Extract download URL from GitHub release data."""
        assets = github_data.get("assets", [])
        if assets:
            # Look for common archive formats
            for asset in assets:
                name = asset.get("name", "").lower()
                if any(ext in name for ext in [".tar.gz", ".zip", ".deb", ".rpm"]):
                    return asset.get("browser_download_url")
        
        # Fallback to tarball URL
        return github_data.get("tarball_url")
    
    def _is_cache_valid(self) -> bool:
        """Check if cached result is still valid."""
        if not self.last_check or not self.cached_result:
            return False
        
        return datetime.now() - self.last_check < self.cache_duration
    
    def get_cached_result(self) -> Optional[Dict[str, Any]]:
        """Get the last cached result without performing a new check."""
        return self.cached_result if self._is_cache_valid() else None


# Global instance
_version_checker: Optional[VersionChecker] = None


def _get_current_version() -> str:
    """Get the current version from package.json."""
    try:
        import os
        import json
        
        # Look for package.json in the ui directory
        package_json_path = os.path.join(os.path.dirname(__file__), "../../ui/package.json")
        if os.path.exists(package_json_path):
            with open(package_json_path, 'r') as f:
                package_data = json.load(f)
                return package_data.get("version", "1.0.0")
    except Exception as e:
        logger.warning(f"Could not read version from package.json: {e}")
    
    return "1.0.0"


def get_version_checker() -> VersionChecker:
    """Get the global version checker instance."""
    global _version_checker
    if _version_checker is None:
        current_version = _get_current_version()
        _version_checker = VersionChecker(current_version=current_version)
    return _version_checker


async def check_for_updates(force: bool = False) -> Dict[str, Any]:
    """Convenience function to check for updates."""
    checker = get_version_checker()
    return await checker.check_for_updates(force_check=force)