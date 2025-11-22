"""Background task management with proper exception handling."""

import asyncio
import functools
from typing import Optional, Callable, Any, Set, Dict
from loguru import logger
import traceback


class BackgroundTaskManager:
    """Manage background tasks with proper exception handling and cleanup."""
    
    def __init__(self):
        self.tasks: Dict[str, asyncio.Task] = {}
        self.failed_tasks: Dict[str, str] = {}  # Track failed tasks and their errors
        self._shutdown = False
    
    def create_task(
        self, 
        coro, 
        name: str, 
        restart_on_failure: bool = False,
        max_retries: int = 3,
        retry_delay: float = 5.0
    ) -> asyncio.Task:
        """
        Create a managed background task with exception handling.
        
        Args:
            coro: The coroutine to run
            name: Unique name for the task
            restart_on_failure: Whether to restart the task if it fails
            max_retries: Maximum number of restart attempts
            retry_delay: Delay in seconds between restart attempts
        """
        if name in self.tasks and not self.tasks[name].done():
            logger.warning(f"Task '{name}' already exists and is running")
            return self.tasks[name]
        
        wrapped_coro = self._wrap_task(
            coro, name, restart_on_failure, max_retries, retry_delay
        )
        task = asyncio.create_task(wrapped_coro)
        self.tasks[name] = task
        logger.debug(f"Created background task: {name}")
        return task
    
    async def _wrap_task(
        self, 
        coro, 
        name: str,
        restart_on_failure: bool,
        max_retries: int,
        retry_delay: float,
        retry_count: int = 0
    ):
        """Wrap a task with exception handling and optional restart."""
        try:
            logger.debug(f"Starting task: {name}")
            await coro
            logger.debug(f"Task completed successfully: {name}")
            
            # Remove from failed tasks if it was there
            if name in self.failed_tasks:
                del self.failed_tasks[name]
                
        except asyncio.CancelledError:
            logger.info(f"Task cancelled: {name}")
            raise
            
        except Exception as e:
            error_msg = f"Task '{name}' failed: {e}\n{traceback.format_exc()}"
            logger.error(error_msg)
            self.failed_tasks[name] = str(e)
            
            # Attempt restart if configured
            if restart_on_failure and retry_count < max_retries and not self._shutdown:
                logger.info(f"Restarting task '{name}' (attempt {retry_count + 1}/{max_retries})")
                await asyncio.sleep(retry_delay)
                
                # Recreate the coroutine (important: need a fresh coroutine instance)
                # Note: This assumes the original coro is a coroutine function, not a coroutine
                if asyncio.iscoroutinefunction(coro):
                    new_coro = coro()
                else:
                    logger.error(f"Cannot restart task '{name}': not a coroutine function")
                    return
                
                # Create new wrapped task with incremented retry count
                wrapped_coro = self._wrap_task(
                    new_coro, name, restart_on_failure, 
                    max_retries, retry_delay, retry_count + 1
                )
                self.tasks[name] = asyncio.create_task(wrapped_coro)
            else:
                logger.error(f"Task '{name}' failed permanently after {retry_count} retries")
        
        finally:
            # Clean up task reference if it's done
            if name in self.tasks and self.tasks[name].done():
                del self.tasks[name]
    
    async def cancel_task(self, name: str, timeout: float = 5.0) -> bool:
        """
        Cancel a specific task by name.
        
        Args:
            name: Name of the task to cancel
            timeout: Maximum time to wait for cancellation
            
        Returns:
            True if task was cancelled successfully
        """
        if name not in self.tasks:
            logger.debug(f"Task '{name}' not found")
            return False
        
        task = self.tasks[name]
        if task.done():
            logger.debug(f"Task '{name}' already completed")
            del self.tasks[name]
            return True
        
        logger.info(f"Cancelling task: {name}")
        task.cancel()
        
        try:
            await asyncio.wait_for(task, timeout=timeout)
        except asyncio.TimeoutError:
            logger.warning(f"Task '{name}' did not cancel within {timeout}s")
            return False
        except asyncio.CancelledError:
            logger.debug(f"Task '{name}' cancelled successfully")
        except Exception as e:
            logger.error(f"Error while cancelling task '{name}': {e}")
        
        if name in self.tasks:
            del self.tasks[name]
        return True
    
    async def cancel_all(self, timeout: float = 10.0):
        """Cancel all managed tasks."""
        self._shutdown = True
        
        if not self.tasks:
            logger.debug("No tasks to cancel")
            return
        
        logger.info(f"Cancelling {len(self.tasks)} background tasks")
        
        # Cancel all tasks
        for task in self.tasks.values():
            if not task.done():
                task.cancel()
        
        # Wait for all tasks to complete
        try:
            await asyncio.wait_for(
                asyncio.gather(*self.tasks.values(), return_exceptions=True),
                timeout=timeout
            )
            logger.info("All background tasks cancelled successfully")
        except asyncio.TimeoutError:
            logger.warning(f"Some tasks did not cancel within {timeout}s")
        
        self.tasks.clear()
    
    def get_status(self) -> Dict[str, Any]:
        """Get status of all managed tasks."""
        status = {
            "total": len(self.tasks),
            "running": sum(1 for t in self.tasks.values() if not t.done()),
            "completed": sum(1 for t in self.tasks.values() if t.done() and not t.cancelled()),
            "cancelled": sum(1 for t in self.tasks.values() if t.cancelled()),
            "failed": len(self.failed_tasks),
            "tasks": {}
        }
        
        for name, task in self.tasks.items():
            status["tasks"][name] = {
                "done": task.done(),
                "cancelled": task.cancelled(),
                "running": not task.done()
            }
            if name in self.failed_tasks:
                status["tasks"][name]["error"] = self.failed_tasks[name]
        
        return status
    
    def get_prometheus_metrics(self) -> str:
        """Get task stats in Prometheus format."""
        status = self.get_status()
        
        metrics = []
        metrics.append(f'# HELP python_background_tasks Number of background tasks')
        metrics.append(f'# TYPE python_background_tasks gauge')
        metrics.append(f'python_background_tasks{{state="total"}} {status["total"]}')
        metrics.append(f'python_background_tasks{{state="running"}} {status["running"]}')
        metrics.append(f'python_background_tasks{{state="completed"}} {status["completed"]}')
        metrics.append(f'python_background_tasks{{state="cancelled"}} {status["cancelled"]}')
        metrics.append(f'python_background_tasks{{state="failed"}} {status["failed"]}')
        
        return '\n'.join(metrics)


# Global task manager instance
task_manager = BackgroundTaskManager()


def managed_task(
    name: str = None,
    restart_on_failure: bool = False,
    max_retries: int = 3,
    retry_delay: float = 5.0
):
    """
    Decorator to automatically manage a coroutine as a background task.
    
    Usage:
        @managed_task(name="my_periodic_task", restart_on_failure=True)
        async def my_periodic_task():
            while True:
                await do_something()
                await asyncio.sleep(60)
    """
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            task_name = name or func.__name__
            coro = func(*args, **kwargs)
            return task_manager.create_task(
                coro, task_name, restart_on_failure, max_retries, retry_delay
            )
        return wrapper
    return decorator