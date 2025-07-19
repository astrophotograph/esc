"""System administration endpoints."""

import asyncio
import os
import signal
import sys
from datetime import datetime
from typing import Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Header
from loguru import logger
from pydantic import BaseModel

from services.version_check import check_for_updates, get_version_checker


router = APIRouter(prefix="/api/system", tags=["system"])


class SystemStatus(BaseModel):
    """System status information."""
    status: str = "running"
    uptime_seconds: float
    start_time: str
    python_version: str
    platform: str
    pid: int


class RestartRequest(BaseModel):
    """Request to restart the server."""
    delay_seconds: int = 2
    reason: str = "Manual restart requested"


class RestartResponse(BaseModel):
    """Response to restart request."""
    message: str
    restart_in_seconds: int
    reason: str


class VersionCheckResponse(BaseModel):
    """Response to version check request."""
    update_available: bool
    current_version: str
    latest_version: str = None
    release_name: str = None
    release_date: str = None
    release_url: str = None
    release_notes: str = None
    download_url: str = None
    last_checked: str
    error: str = None


# Store server start time
SERVER_START_TIME = datetime.now()


def verify_admin_token(x_admin_token: str = Header(None)) -> bool:
    """Simple token verification for admin endpoints."""
    # In production, use proper authentication
    # For now, check for a simple token from environment
    expected_token = os.environ.get("ADMIN_TOKEN", "admin-secret-token")
    if not x_admin_token or x_admin_token != expected_token:
        raise HTTPException(
            status_code=401, 
            detail="Invalid or missing admin token"
        )
    return True


@router.get("/status", response_model=SystemStatus)
async def get_system_status():
    """Get current system status."""
    import platform
    
    uptime = (datetime.now() - SERVER_START_TIME).total_seconds()
    
    return SystemStatus(
        status="running",
        uptime_seconds=uptime,
        start_time=SERVER_START_TIME.isoformat(),
        python_version=sys.version.split()[0],
        platform=platform.platform(),
        pid=os.getpid()
    )


@router.post("/restart", response_model=RestartResponse, dependencies=[Depends(verify_admin_token)])
async def restart_server(request: RestartRequest):
    """
    Restart the server after a specified delay.
    
    Requires admin authentication token in X-Admin-Token header.
    """
    logger.warning(f"Server restart requested: {request.reason}")
    
    async def delayed_restart():
        """Perform the actual restart after delay."""
        await asyncio.sleep(request.delay_seconds)
        logger.info("Executing server restart...")
        
        # Try graceful shutdown first
        try:
            # Send SIGTERM to self for graceful shutdown
            os.kill(os.getpid(), signal.SIGTERM)
        except Exception as e:
            logger.error(f"Graceful shutdown failed: {e}")
            # Force exit if graceful shutdown fails
            sys.exit(1)
    
    # Schedule the restart
    asyncio.create_task(delayed_restart())
    
    return RestartResponse(
        message=f"Server will restart in {request.delay_seconds} seconds",
        restart_in_seconds=request.delay_seconds,
        reason=request.reason
    )


@router.post("/shutdown", dependencies=[Depends(verify_admin_token)])
async def shutdown_server(delay_seconds: int = 2):
    """
    Shutdown the server after a specified delay.
    
    Requires admin authentication token in X-Admin-Token header.
    """
    logger.warning(f"Server shutdown requested, will shutdown in {delay_seconds} seconds")
    
    async def delayed_shutdown():
        """Perform the actual shutdown after delay."""
        await asyncio.sleep(delay_seconds)
        logger.info("Executing server shutdown...")
        sys.exit(0)
    
    # Schedule the shutdown
    asyncio.create_task(delayed_shutdown())
    
    return {
        "message": f"Server will shutdown in {delay_seconds} seconds",
        "shutdown_in_seconds": delay_seconds
    }


@router.get("/health")
async def health_check() -> Dict[str, Any]:
    """Basic health check endpoint."""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "uptime_seconds": (datetime.now() - SERVER_START_TIME).total_seconds()
    }


@router.get("/version/check", response_model=VersionCheckResponse)
async def check_version_updates(force: bool = False) -> VersionCheckResponse:
    """
    Check for available version updates from GitHub.
    
    Args:
        force: If True, bypass cache and force a fresh check
    """
    try:
        result = await check_for_updates(force=force)
        return VersionCheckResponse(**result)
    except Exception as e:
        logger.error(f"Error checking for version updates: {e}")
        return VersionCheckResponse(
            update_available=False,
            current_version=get_version_checker().current_version,
            last_checked=datetime.now().isoformat(),
            error=str(e)
        )


@router.get("/version/current")
async def get_current_version() -> Dict[str, str]:
    """Get the current application version."""
    checker = get_version_checker()
    return {
        "version": checker.current_version,
        "repository": checker.github_repo
    }