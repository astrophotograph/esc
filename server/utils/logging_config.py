"""Enhanced logging configuration for the application."""

import sys
from pathlib import Path

from loguru import logger


def setup_logging(
    log_level: str = "INFO",
    log_file: str = None,
    log_rotation: str = "100 MB",
    log_retention: str = "7 days",
    enable_json: bool = False
):
    """
    Configure comprehensive logging for the application.
    
    Args:
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR)
        log_file: Path to log file (None for no file logging)
        log_rotation: When to rotate log files (e.g., "100 MB", "1 day")
        log_retention: How long to keep old log files
        enable_json: Whether to output logs in JSON format
    """
    # Remove default logger
    logger.remove()
    
    # Configure log format
    if enable_json:
        log_format = (
            '{"time": "{time:YYYY-MM-DD HH:mm:ss.SSS}", '
            '"level": "{level}", '
            '"module": "{module}", '
            '"function": "{function}", '
            '"line": {line}, '
            '"message": "{message}", '
            '"request_id": "{extra[request_id]}"}'
        )
    else:
        log_format = (
            "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | "
            "<level>{level: <8}</level> | "
            "<cyan>{module}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> | "
            "<level>{message}</level>"
        )
    
    # Add console handler
    logger.add(
        sys.stderr,
        format=log_format,
        level=log_level,
        colorize=True,
        backtrace=True,
        diagnose=True
    )
    
    # Add file handler if specified
    if log_file:
        # Create log directory if it doesn't exist
        log_path = Path(log_file)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        
        logger.add(
            log_file,
            format=log_format,
            level=log_level,
            rotation=log_rotation,
            retention=log_retention,
            compression="zip",
            backtrace=True,
            diagnose=True,
            enqueue=True  # Thread-safe logging
        )
    
    # Add specific handlers for different components
    setup_component_logging()
    
    # Log startup information
    logger.info(f"Logging configured | Level: {log_level} | File: {log_file or 'None'}")
    logger.info(f"Python {sys.version} | Platform: {sys.platform}")
    

def setup_component_logging():
    """Set up specific logging for different components."""
    # Create separate log files for critical components
    from .app_dirs import get_writable_dir
    log_dir = get_writable_dir("logs", fallback=Path("logs"))
    
    # Telescope communication logs
    logger.add(
        log_dir / "telescope_{time:YYYY-MM-DD}.log",
        filter=lambda record: "telescope" in record["module"].lower() or "seestar" in record["module"].lower(),
        rotation="1 day",
        retention="30 days",
        level="DEBUG",
        format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level: <8} | {module}:{function}:{line} | {message}"
    )
    
    # WebSocket logs
    logger.add(
        log_dir / "websocket_{time:YYYY-MM-DD}.log",
        filter=lambda record: "websocket" in record["module"].lower(),
        rotation="1 day",
        retention="7 days",
        level="DEBUG",
        format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level: <8} | {module}:{function}:{line} | {message}"
    )
    
    # Error logs (all errors in one place)
    logger.add(
        log_dir / "errors_{time:YYYY-MM-DD}.log",
        level="ERROR",
        rotation="1 day",
        retention="30 days",
        backtrace=True,
        diagnose=True,
        format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level: <8} | {module}:{function}:{line} | {message}"
    )
    
    # Performance logs
    logger.add(
        log_dir / "performance_{time:YYYY-MM-DD}.log",
        filter=lambda record: "performance" in record.get("extra", {}) or "duration" in str(record["message"]).lower(),
        rotation="1 day",
        retention="7 days",
        level="INFO",
        format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level: <8} | {message}"
    )


def get_logger(name: str = None):
    """
    Get a logger instance with optional name binding.
    
    Args:
        name: Logger name (usually __name__)
        
    Returns:
        Logger instance
    """
    if name:
        return logger.bind(module=name)
    return logger


# Convenience functions for structured logging
def log_telescope_event(event_type: str, telescope_id: str, data: dict = None):
    """Log telescope-related events."""
    logger.info(
        f"Telescope event | Type: {event_type} | ID: {telescope_id}",
        extra={"telescope_id": telescope_id, "event_data": data}
    )


def log_performance(operation: str, duration: float, details: dict = None):
    """Log performance metrics."""
    logger.info(
        f"Performance | Operation: {operation} | Duration: {duration:.3f}s",
        extra={"performance": True, "operation": operation, "duration": duration, "details": details}
    )


def log_error(error: Exception, context: dict = None):
    """Log errors with context."""
    logger.error(
        f"Error occurred | Type: {type(error).__name__} | Message: {str(error)}",
        extra={"error_type": type(error).__name__, "error_context": context}
    )