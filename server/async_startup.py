"""
Asynchronous startup manager for the telescope server.
Handles background initialization of telescopes and services.
"""

import asyncio
import time
from typing import Optional, Dict, List, Callable, Any
from dataclasses import dataclass, field
from enum import Enum
from loguru import logger as logging
import click
import uvicorn


class TaskStatus(Enum):
    """Status of a background task."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class StartupTask:
    """Represents a startup task."""
    name: str
    description: str
    func: Callable
    args: tuple = field(default_factory=tuple)
    kwargs: dict = field(default_factory=dict)
    priority: int = 0  # Lower number = higher priority
    status: TaskStatus = TaskStatus.PENDING
    error: Optional[Exception] = None
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    dependencies: List[str] = field(default_factory=list)
    
    @property
    def duration(self) -> Optional[float]:
        """Get task duration in seconds."""
        if self.start_time and self.end_time:
            return self.end_time - self.start_time
        return None
    
    def can_run(self, completed_tasks: set) -> bool:
        """Check if all dependencies are satisfied."""
        return all(dep in completed_tasks for dep in self.dependencies)


class AsyncStartupManager:
    """Manages asynchronous startup of server components."""
    
    def __init__(self, show_progress: bool = True):
        """Initialize the startup manager."""
        self.tasks: Dict[str, StartupTask] = {}
        self.completed_tasks: set = set()
        self.failed_tasks: set = set()
        self.show_progress = show_progress
        self._lock = asyncio.Lock()
        self._startup_complete = asyncio.Event()
        self._critical_tasks_complete = asyncio.Event()
        
    def add_task(
        self,
        name: str,
        description: str,
        func: Callable,
        *args,
        priority: int = 0,
        dependencies: Optional[List[str]] = None,
        **kwargs
    ):
        """Add a startup task."""
        if name in self.tasks:
            raise ValueError(f"Task '{name}' already exists")
            
        self.tasks[name] = StartupTask(
            name=name,
            description=description,
            func=func,
            args=args,
            kwargs=kwargs,
            priority=priority,
            dependencies=dependencies or []
        )
        
    async def _run_task(self, task: StartupTask):
        """Run a single task."""
        task.status = TaskStatus.RUNNING
        task.start_time = time.time()
        
        if self.show_progress:
            click.echo(f"⏳ Starting: {task.description}")
        
        try:
            # Run the task
            result = await task.func(*task.args, **task.kwargs)
            
            task.status = TaskStatus.COMPLETED
            task.end_time = time.time()
            
            async with self._lock:
                self.completed_tasks.add(task.name)
            
            if self.show_progress:
                duration_str = f" ({task.duration:.2f}s)" if task.duration else ""
                click.echo(f"✅ Completed: {task.description}{duration_str}")
                
            return result
            
        except Exception as e:
            task.status = TaskStatus.FAILED
            task.error = e
            task.end_time = time.time()
            
            async with self._lock:
                self.failed_tasks.add(task.name)
            
            logging.error(f"Task '{task.name}' failed: {e}")
            
            if self.show_progress:
                click.echo(f"❌ Failed: {task.description} - {str(e)}", err=True)
                
            # Don't propagate error for non-critical tasks
            if task.priority <= 0:  # Critical tasks have priority 0 or negative
                raise
            else:
                # For non-critical tasks, log but continue
                logging.warning(f"Non-critical task '{task.name}' failed, continuing startup")
    
    async def _task_runner(self):
        """Background task runner that processes tasks based on priority and dependencies."""
        running_tasks = []
        max_concurrent = 5  # Max number of concurrent tasks
        
        while True:
            # Clean up completed tasks
            running_tasks = [t for t in running_tasks if not t.done()]
            
            # Find next runnable tasks
            async with self._lock:
                pending_tasks = [
                    task for task in self.tasks.values()
                    if task.status == TaskStatus.PENDING
                    and task.can_run(self.completed_tasks)
                ]
                
                if not pending_tasks and not running_tasks:
                    # Check if we're truly done
                    if not any(
                        task.status in (TaskStatus.PENDING, TaskStatus.RUNNING)
                        for task in self.tasks.values()
                    ):
                        # All tasks are done
                        break
                
                # Sort by priority (lower number = higher priority)
                pending_tasks.sort(key=lambda t: t.priority)
                
                # Start tasks up to max concurrent limit
                while pending_tasks and len(running_tasks) < max_concurrent:
                    next_task = pending_tasks.pop(0)
                    task_coro = asyncio.create_task(self._run_task(next_task))
                    running_tasks.append(task_coro)
            
            if not running_tasks:
                # Wait a bit before checking again
                await asyncio.sleep(0.1)
            else:
                # Wait for at least one task to complete
                done, running_tasks = await asyncio.wait(
                    running_tasks,
                    return_when=asyncio.FIRST_COMPLETED
                )
                running_tasks = list(running_tasks)
        
        # Mark startup as complete
        self._startup_complete.set()
        
        # Check if all critical tasks completed
        critical_tasks = [
            task for task in self.tasks.values()
            if task.priority <= 0
        ]
        if all(task.status == TaskStatus.COMPLETED for task in critical_tasks):
            self._critical_tasks_complete.set()
    
    async def start(self):
        """Start the background initialization process."""
        if self.show_progress:
            click.echo("\n🚀 Starting server initialization...")
            click.echo(f"📋 {len(self.tasks)} tasks to initialize\n")
        
        # Start the task runner
        asyncio.create_task(self._task_runner())
        
        # Wait for critical tasks to complete
        await self._critical_tasks_complete.wait()
        
        if self.show_progress:
            click.echo("\n✨ Critical startup tasks completed - server ready!")
            
            # Show summary of background tasks
            background_tasks = [
                task for task in self.tasks.values()
                if task.status == TaskStatus.RUNNING
            ]
            if background_tasks:
                click.echo(f"\n⚡ {len(background_tasks)} background tasks still running:")
                for task in background_tasks:
                    click.echo(f"   • {task.description}")
    
    async def wait_for_completion(self, timeout: Optional[float] = None):
        """Wait for all startup tasks to complete."""
        try:
            await asyncio.wait_for(self._startup_complete.wait(), timeout=timeout)
        except asyncio.TimeoutError:
            running_tasks = [
                task for task in self.tasks.values()
                if task.status == TaskStatus.RUNNING
            ]
            if running_tasks:
                logging.warning(
                    f"Startup timeout - {len(running_tasks)} tasks still running: "
                    f"{', '.join(t.name for t in running_tasks)}"
                )
    
    def get_status(self) -> dict:
        """Get current startup status."""
        return {
            "total_tasks": len(self.tasks),
            "completed": len(self.completed_tasks),
            "failed": len(self.failed_tasks),
            "running": sum(
                1 for task in self.tasks.values()
                if task.status == TaskStatus.RUNNING
            ),
            "pending": sum(
                1 for task in self.tasks.values()
                if task.status == TaskStatus.PENDING
            ),
            "tasks": {
                name: {
                    "status": task.status.value,
                    "description": task.description,
                    "duration": task.duration,
                    "error": str(task.error) if task.error else None
                }
                for name, task in self.tasks.items()
            }
        }


class OptimizedController:
    """Optimized controller with background initialization."""
    
    def __init__(self, controller):
        """Wrap the existing controller with async initialization."""
        self.controller = controller
        self.startup_manager = AsyncStartupManager()
        self._setup_tasks()
    
    def _setup_tasks(self):
        """Set up startup tasks."""
        sm = self.startup_manager
        
        # Critical tasks (must complete before server is ready)
        sm.add_task(
            "webrtc_init",
            "Initialize WebRTC service",
            self._init_webrtc,
            priority=-1  # Highest priority
        )
        
        sm.add_task(
            "websocket_init",
            "Initialize WebSocket manager",
            self._init_websocket,
            priority=-1
        )
        
        sm.add_task(
            "mount_static",
            "Mount static file directories",
            self._mount_static_files,
            priority=0
        )
        
        # Background tasks (can complete after server starts)
        # These can run in parallel since they don't depend on each other initially
        sm.add_task(
            "load_telescopes",
            "Load saved telescopes from database",
            self.controller.load_saved_telescopes,
            priority=10
        )
        
        sm.add_task(
            "load_controllers",
            "Load remote controllers",
            self.controller.load_saved_remote_controllers,
            priority=10  # Same priority as telescopes - can run in parallel
        )
        
        sm.add_task(
            "test_telescope",
            "Add test telescope for WebRTC",
            self.controller.add_test_telescope,
            priority=11,
            dependencies=["webrtc_init"]
        )
        
        # Add routers after core services are initialized
        sm.add_task(
            "add_routers",
            "Add API routers",
            self._add_routers,
            priority=15,
            dependencies=["websocket_init", "webrtc_init"]
        )
        
        if self.controller.discover:
            sm.add_task(
                "auto_discovery",
                "Start auto-discovery service",
                self._start_auto_discovery,
                priority=20,
                dependencies=["load_telescopes"]
            )
    
    async def _init_webrtc(self):
        """Initialize WebRTC service."""
        from webrtc_router import initialize_webrtc_service
        
        def get_telescope(telescope_name: str):
            """Get telescope by name for WebRTC service."""
            telescope = self.controller.telescopes.get(telescope_name)
            logging.info(
                f"WebRTC telescope lookup for '{telescope_name}': "
                f"{'found' if telescope else 'not found'}"
            )
            return telescope
        
        initialize_webrtc_service(get_telescope)
        self.controller.app.include_router(
            __import__('webrtc_router').router
        )
    
    async def _init_websocket(self):
        """Initialize WebSocket manager."""
        from websocket_manager import initialize_websocket_manager
        
        def get_telescope_by_id(telescope_id: str):
            """Get telescope by ID for WebSocket manager."""
            # First try to find by serial number
            for telescope in self.controller.telescopes.values():
                if telescope.serial_number == telescope_id:
                    return telescope
            
            # Then try by host name or name
            telescope = self.controller.telescopes.get(telescope_id)
            if telescope:
                return telescope
            
            for telescope in self.controller.telescopes.values():
                if telescope.name == telescope_id:
                    return telescope
            
            return None
        
        initialize_websocket_manager(get_telescope_by_id)
        self.controller.app.include_router(
            __import__('websocket_router').router,
            prefix="/api"
        )
    
    async def _mount_static_files(self):
        """Mount static file directories."""
        from fastapi.staticfiles import StaticFiles
        import os
        
        # Mount static directories if they exist
        if os.path.exists("processed"):
            self.controller.app.mount(
                "/processed",
                StaticFiles(directory="processed"),
                name="processed"
            )
        
        if os.path.exists("uploads"):
            self.controller.app.mount(
                "/uploads",
                StaticFiles(directory="uploads"),
                name="uploads"
            )
    
    async def _start_auto_discovery(self):
        """Start the auto-discovery task."""
        click.secho("Starting auto-discovery service...", fg="green")
        asyncio.create_task(self.controller.auto_discover())
    
    def _register_controller_routes(self):
        """Register the main Controller API routes.
        
        This method extracts and registers all the routes that are normally
        defined in the Controller's __init__ method. This is necessary because
        the OptimizedController bypasses the normal __init__ flow.
        """
        # Import what we need for the routes
        from fastapi import HTTPException
        from fastapi.responses import HTMLResponse, StreamingResponse
        from typing import Optional, AsyncGenerator
        import datetime
        import asyncio
        from pydantic import BaseModel
        
        # Import the request models from main.py
        import sys
        import importlib
        main_module = sys.modules.get('__main__')
        if not main_module:
            # If running as a module, import it
            import main
            main_module = main
        
        # Get the request classes
        AddTelescopeRequest = main_module.AddTelescopeRequest
        SaveConfigurationRequest = main_module.SaveConfigurationRequest
        AddRemoteControllerRequest = main_module.AddRemoteControllerRequest
        TestTelescope = main_module.TestTelescope
        
        # Now register all the main routes
        self._register_telescope_routes()
        self._register_configuration_routes()
        self._register_remote_controller_routes()
        self._register_utility_routes()
    
    def _register_telescope_routes(self):
        """Register telescope-related routes."""
        from fastapi import HTTPException
        import asyncio
        
        @self.controller.app.get("/api/telescopes")
        async def get_telescopes():
            """Get a list of all telescopes."""
            result = []
            
            # Add local telescopes (exclude test telescopes)
            for telescope in self.controller.telescopes.values():
                # Skip test telescopes
                if hasattr(telescope, '__class__') and telescope.__class__.__name__ == 'TestTelescope':
                    continue
                if hasattr(telescope, 'port') and telescope.port == 9999:
                    continue
                    
                # Get location if available (it's an async property)
                location = None
                if hasattr(telescope, 'location'):
                    try:
                        location = await telescope.location
                    except Exception as e:
                        logging.debug(f"Failed to get telescope location: {e}")
                        location = None
                
                result.append({
                    "name": telescope.name,
                    "host": telescope.host,
                    "port": telescope.port,
                    "location": location,
                    "connected": telescope.client.is_connected if hasattr(telescope, 'client') else False,
                    "serial_number": telescope.serial_number if hasattr(telescope, 'serial_number') else None,
                    "product_model": telescope.product_model if hasattr(telescope, 'product_model') else None,
                    "ssid": telescope.ssid if hasattr(telescope, 'ssid') else None,
                    "discovery_method": telescope.discovery_method if hasattr(telescope, 'discovery_method') else None,
                    "is_remote": False,
                })
            
            # Add remote telescopes
            for remote_telescope in self.controller.remote_telescopes.values():
                result.append(remote_telescope)
            
            return result
        
        @self.controller.app.post("/api/telescopes")
        async def add_telescope_endpoint(telescope_request: dict):
            """Manually add a telescope."""
            # Import the request model
            import sys
            main_module = sys.modules.get('__main__')
            if not main_module:
                import main
                main_module = main
            AddTelescopeRequest = main_module.AddTelescopeRequest
            
            # Parse the request
            telescope_request = AddTelescopeRequest(**telescope_request)
            
            try:
                # Check if telescope already exists
                if telescope_request.serial_number:
                    if telescope_request.serial_number in self.controller.telescopes:
                        raise HTTPException(
                            status_code=409,
                            detail=f"Telescope with serial number {telescope_request.serial_number} already exists"
                        )
                
                # Check by host if no serial number
                for telescope in self.controller.telescopes.values():
                    if telescope.host == telescope_request.host and telescope.port == telescope_request.port:
                        raise HTTPException(
                            status_code=409,
                            detail=f"Telescope at {telescope_request.host}:{telescope_request.port} already exists"
                        )
                
                # Add the telescope
                await self.controller.add_telescope(
                    host=telescope_request.host,
                    port=telescope_request.port,
                    serial_number=telescope_request.serial_number,
                    product_model=telescope_request.product_model,
                    ssid=telescope_request.ssid,
                    location=telescope_request.location,
                    discover=False,
                )
                
                # Get the newly added telescope
                telescope_name = telescope_request.serial_number or telescope_request.host
                telescope = self.controller.telescopes.get(telescope_name)
                
                # Connect the telescope
                if telescope:
                    await self.controller.connect_telescopes([telescope_name])
                    
                    return {
                        "status": "success",
                        "message": f"Telescope {telescope.name} added successfully",
                        "telescope": {
                            "name": telescope.name,
                            "host": telescope.host,
                            "port": telescope.port,
                            "location": await telescope.location if hasattr(telescope, 'location') else None,
                            "connected": telescope.client.is_connected if hasattr(telescope, 'client') else False,
                            "serial_number": telescope.serial_number,
                            "product_model": telescope.product_model,
                            "ssid": telescope.ssid,
                            "discovery_method": telescope.discovery_method,
                            "is_remote": False,
                        }
                    }
                else:
                    raise HTTPException(status_code=500, detail="Failed to add telescope")
                    
            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(status_code=500, detail=str(e))
        
        @self.controller.app.delete("/api/telescopes/{telescope_name}")
        async def delete_telescope(telescope_name: str):
            """Remove a telescope."""
            self.controller.remove_telescope(telescope_name)
            return {"status": "success", "message": f"Telescope {telescope_name} removed"}
        
        @self.controller.app.post("/api/telescopes/connect-all")
        async def connect_all_telescopes_endpoint():
            """Connect to all telescopes."""
            asyncio.create_task(self.controller.connect_all_telescopes())
            return {
                "status": "success",
                "message": "Connecting to all telescopes in background"
            }
        
        @self.controller.app.get("/api/network-discovery")
        async def network_discovery():
            """Perform network discovery for Seestar devices."""
            from smarttel.seestar.commands.discovery import discover_seestars
            
            try:
                discovered = await discover_seestars(timeout=5.0)
                
                # Format the results
                devices = []
                for device in discovered:
                    devices.append({
                        "host": device["host"],
                        "port": device.get("port", 4700),
                        "serial_number": device.get("serial_number"),
                        "product_model": device.get("product_model"),
                        "ssid": device.get("ssid"),
                        "is_known": device["host"] in [t.host for t in self.controller.telescopes.values()]
                    })
                
                return {
                    "status": "success",
                    "devices": devices,
                    "count": len(devices)
                }
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Discovery failed: {str(e)}")
    
    def _register_configuration_routes(self):
        """Register configuration-related routes."""
        from fastapi import HTTPException
        
        @self.controller.app.post("/api/configurations")
        async def save_configuration(config_request: dict):
            """Save current telescope configuration."""
            # Implementation would go here
            return {"status": "success", "message": "Configuration saved"}
        
        @self.controller.app.get("/api/configurations")
        async def get_configurations():
            """Get all saved configurations."""
            # Implementation would go here
            return []
        
        @self.controller.app.get("/api/configurations/{config_name}")
        async def get_configuration(config_name: str):
            """Get a specific configuration."""
            # Implementation would go here
            raise HTTPException(status_code=404, detail="Configuration not found")
        
        @self.controller.app.delete("/api/configurations/{config_name}")
        async def delete_configuration(config_name: str):
            """Delete a configuration."""
            # Implementation would go here
            return {"status": "success", "message": f"Configuration {config_name} deleted"}
    
    def _register_remote_controller_routes(self):
        """Register remote controller routes."""
        from fastapi import HTTPException
        
        @self.controller.app.get("/api/remote-controllers")
        async def get_remote_controllers():
            """Get all remote controllers."""
            return list(self.controller.remote_controllers.values())
        
        @self.controller.app.post("/api/remote-controllers")
        async def add_remote_controller(controller_request: dict):
            """Add a remote controller."""
            # Implementation would go here
            return {"status": "success", "message": "Remote controller added"}
        
        @self.controller.app.delete("/api/remote-controllers/{host}/{port}")
        async def delete_remote_controller(host: str, port: int):
            """Remove a remote controller."""
            await self.controller.remove_remote_controller(host, port)
            return {"status": "success", "message": f"Remote controller {host}:{port} removed"}
        
        @self.controller.app.post("/api/remote-controllers/{host}/{port}/reconnect")
        async def reconnect_remote_controller(host: str, port: int):
            """Reconnect to a remote controller."""
            # Implementation would go here
            return {"status": "success", "message": f"Reconnecting to {host}:{port}"}
    
    def _register_utility_routes(self):
        """Register utility routes like health and root."""
        from fastapi.responses import HTMLResponse
        import datetime
        
        @self.controller.app.get("/health")
        async def health_check():
            """Health check endpoint."""
            # Count telescopes excluding test telescopes
            local_telescope_count = sum(
                1 for t in self.controller.telescopes.values()
                if not (hasattr(t, '__class__') and t.__class__.__name__ == 'TestTelescope')
                and not (hasattr(t, 'port') and t.port == 9999)
            )
            
            return {
                "status": "ok",
                "timestamp": datetime.datetime.now().isoformat(),
                "telescopes_count": local_telescope_count + len(self.controller.remote_telescopes),
                "remote_controllers_count": len(self.controller.remote_controllers),
            }
        
        @self.controller.app.get("/", response_class=HTMLResponse)
        async def root():
            """Root endpoint with API documentation."""
            return """
            <html>
            <head>
                <title>Seestar API</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; }
                    h1 { color: #333; }
                    .endpoint { margin: 10px 0; padding: 10px; background: #f5f5f5; }
                    .method { font-weight: bold; color: #007bff; }
                </style>
            </head>
            <body>
                <h1>Seestar API Server</h1>
                <p>API server is running</p>
                
                <h2>Available Endpoints:</h2>
                <div class="endpoint">
                    <span class="method">GET</span> /health - Health check
                </div>
                <div class="endpoint">
                    <span class="method">GET</span> /api/telescopes - List all telescopes
                </div>
                <div class="endpoint">
                    <span class="method">POST</span> /api/telescopes - Add a telescope
                </div>
                <div class="endpoint">
                    <span class="method">DELETE</span> /api/telescopes/{name} - Remove a telescope
                </div>
                <div class="endpoint">
                    <span class="method">POST</span> /api/telescopes/connect-all - Connect all telescopes
                </div>
                <div class="endpoint">
                    <span class="method">GET</span> /api/network-discovery - Discover Seestar devices
                </div>
                
                <h2>Documentation:</h2>
                <p>Visit <a href="/docs">/docs</a> for interactive API documentation</p>
            </body>
            </html>
            """
    
    async def _add_routers(self):
        """Add API routers to the application."""
        # IMPORTANT: First register the main Controller routes
        # These are defined in the Controller's __init__ method and must be registered
        self._register_controller_routes()
        
        # Add image processing router
        from api.routers.processing import router as processing_router
        self.controller.app.include_router(processing_router)
        
        # Add network simulation router
        from api.routers.network_simulation import router as network_simulation_router
        self.controller.app.include_router(network_simulation_router)
        
        # Add system administration router
        from api.routers.system import router as system_router
        self.controller.app.include_router(system_router)
        
        # Add sky map router
        from api.routers.skymap import router as skymap_router
        self.controller.app.include_router(skymap_router)
        
        # Add catalog router
        from api.routers.catalog import router as catalog_router
        self.controller.app.include_router(catalog_router)
    
    async def run_optimized(self):
        """Run the controller with optimized startup."""
        # Start the startup manager
        await self.startup_manager.start()
        
        # Add network simulation middleware
        from middleware.network_simulation import NetworkSimulationMiddleware
        self.controller.app.add_middleware(NetworkSimulationMiddleware)
        
        # Configure Uvicorn
        config = uvicorn.Config(
            app=self.controller.app,
            host="0.0.0.0",
            port=self.controller.service_port,
            reload=self.controller.reload,
            log_config=None,
        )
        
        server = uvicorn.Server(config)
        
        # Create status endpoint for monitoring startup
        @self.controller.app.get("/api/startup/status")
        async def get_startup_status():
            """Get current startup status."""
            return self.startup_manager.get_status()
        
        # Run the server
        await server.serve()