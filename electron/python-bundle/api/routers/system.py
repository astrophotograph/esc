"""System administration endpoints."""

import asyncio
import os
import signal
import sys
import threading
from datetime import datetime
from typing import Dict, Any, List, Optional

import psutil
from fastapi import APIRouter, HTTPException, Header, Request
from loguru import logger
from pydantic import BaseModel

from services.version_check import check_for_updates, get_version_checker
from utils.performance_monitor import get_performance_monitor


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


class MemoryInfo(BaseModel):
    """Memory usage information."""
    total: int
    available: int
    used: int
    percent: float
    process_rss: int  # Resident Set Size of current process
    process_vms: int  # Virtual Memory Size of current process


class CPUInfo(BaseModel):
    """CPU usage information."""
    percent: float
    count: int
    process_percent: float  # CPU usage of current process


class ThreadInfo(BaseModel):
    """Thread and task information."""
    thread_count: int
    active_tasks: int
    pending_tasks: int


class TelescopeStatus(BaseModel):
    """Status of a connected telescope."""
    name: str
    serial_number: Optional[str]
    host: str
    port: int
    connected: bool
    discovery_method: str
    is_test: bool = False


class HealthCheckResponse(BaseModel):
    """Comprehensive health check response."""
    status: str
    timestamp: str
    uptime_seconds: float
    memory: MemoryInfo
    cpu: CPUInfo
    threads: ThreadInfo
    telescopes: List[TelescopeStatus]
    active_connections: int
    python_version: str
    platform: str
    pid: int


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


@router.post("/restart", response_model=RestartResponse)
async def restart_server(request: RestartRequest):
    """
    Restart the server after a specified delay.
    
    Note: Authentication removed for localhost deployment.
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


@router.post("/shutdown")
async def shutdown_server(delay_seconds: int = 2):
    """
    Shutdown the server after a specified delay.
    
    Note: Authentication removed for localhost deployment.
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
async def health_check(request: Request) -> Dict[str, Any]:
    """Basic health check endpoint - returns simple status for monitoring tools."""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "uptime_seconds": (datetime.now() - SERVER_START_TIME).total_seconds()
    }


@router.get("/health/detailed", response_model=HealthCheckResponse)
async def detailed_health_check(request: Request) -> HealthCheckResponse:
    """
    Comprehensive health check endpoint with system metrics.
    
    Returns detailed information about:
    - Memory usage (system and process)
    - CPU usage (system and process)
    - Thread and asyncio task counts
    - Telescope connection status
    - Active WebSocket connections
    """
    import platform
    
    # Get process info
    process = psutil.Process()
    
    # Memory info
    mem = psutil.virtual_memory()
    process_info = process.memory_info()
    memory_info = MemoryInfo(
        total=mem.total,
        available=mem.available,
        used=mem.used,
        percent=mem.percent,
        process_rss=process_info.rss,
        process_vms=process_info.vms
    )
    
    # CPU info
    cpu_info = CPUInfo(
        percent=psutil.cpu_percent(interval=0.1),
        count=psutil.cpu_count(),
        process_percent=process.cpu_percent(interval=0.1)
    )
    
    # Thread info
    thread_count = threading.active_count()
    
    # Count asyncio tasks
    try:
        all_tasks = asyncio.all_tasks()
        active_tasks = sum(1 for task in all_tasks if not task.done())
        pending_tasks = sum(1 for task in all_tasks if task.done())
    except AttributeError:
        # Python 3.9+ uses asyncio.all_tasks()
        all_tasks = asyncio.all_tasks()
        active_tasks = sum(1 for task in all_tasks if not task.done())
        pending_tasks = sum(1 for task in all_tasks if task.done())
    
    thread_info = ThreadInfo(
        thread_count=thread_count,
        active_tasks=active_tasks,
        pending_tasks=pending_tasks
    )
    
    # Get telescope status from the Controller
    telescopes = []
    active_connections = 0
    
    # Access the controller from the app state
    if hasattr(request.app.state, 'controller'):
        controller = request.app.state.controller
        
        # Get local telescopes
        for telescope in controller.telescopes.values():
            # Skip test telescopes unless specifically included
            is_test = hasattr(telescope, 'port') and telescope.port == 9999
            
            # Check if connected by looking for client attribute
            connected = False
            if hasattr(telescope, 'client') and telescope.client:
                connected = hasattr(telescope.client, 'connected') and telescope.client.connected
                if connected:
                    active_connections += 1
            
            telescopes.append(TelescopeStatus(
                name=telescope.name,
                serial_number=getattr(telescope, 'serial_number', None),
                host=telescope.host,
                port=telescope.port,
                connected=connected,
                discovery_method=getattr(telescope, 'discovery_method', 'unknown'),
                is_test=is_test
            ))
        
        # Get remote telescopes
        for name, remote_data in controller.remote_telescopes.items():
            telescopes.append(TelescopeStatus(
                name=name,
                serial_number=remote_data.get('serial_number'),
                host=remote_data.get('host', 'remote'),
                port=remote_data.get('port', 0),
                connected=True,  # Remote telescopes are considered connected if registered
                discovery_method='remote',
                is_test=False
            ))
            active_connections += 1
    
    # Determine overall health status
    status = "healthy"
    if memory_info.percent > 90:
        status = "warning"
    if memory_info.percent > 95 or cpu_info.percent > 90:
        status = "critical"
    
    return HealthCheckResponse(
        status=status,
        timestamp=datetime.now().isoformat(),
        uptime_seconds=(datetime.now() - SERVER_START_TIME).total_seconds(),
        memory=memory_info,
        cpu=cpu_info,
        threads=thread_info,
        telescopes=telescopes,
        active_connections=active_connections,
        python_version=sys.version.split()[0],
        platform=platform.platform(),
        pid=os.getpid()
    )


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


@router.get("/metrics")
async def get_performance_metrics() -> Dict[str, Any]:
    """
    Get current performance metrics.
    
    Returns:
        - Request statistics (count, latency percentiles)
        - Memory usage (system and process)
        - CPU usage (system and process)
        - Active connections
        - Error rates
    """
    monitor = get_performance_monitor()
    return monitor.get_metrics()


@router.get("/metrics/reset")
async def reset_performance_metrics() -> Dict[str, str]:
    """Reset performance metrics counters."""
    monitor = get_performance_monitor()
    
    # Clear metrics
    monitor.request_latencies.clear()
    monitor.error_counts.clear()
    monitor.total_requests = 0
    monitor.total_errors = 0
    
    return {
        "status": "reset",
        "message": "Performance metrics have been reset",
        "timestamp": datetime.now().isoformat()
    }