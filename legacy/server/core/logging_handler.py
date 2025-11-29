"""Logging configuration and handlers."""

import logging as orig_logging
import sys

from loguru import logger as logging


class InterceptHandler(orig_logging.Handler):
    """Handler to intercept standard logging and forward to loguru."""

    def emit(self, record: orig_logging.LogRecord) -> None:
        # Get corresponding Loguru level if it exists
        try:
            level: str | int = logging.level(record.levelname).name
        except ValueError:
            level = record.levelno

        # Find caller from where originated the logged message
        frame, depth = orig_logging.currentframe(), 2
        while frame.f_code.co_filename == orig_logging.__file__:
            frame = frame.f_back
            depth += 1

        if level == "DEBUG":
            # Taking a big hammer to things, remap DEBUG to TRACE logging (outside of loguru)
            level = "TRACE"

        logging.opt(depth=depth, exception=record.exc_info).log(
            level, record.getMessage()
        )


def setup_logging(no_color=False, json_format=False):
    """Configure logging for the application.
    
    Args:
        no_color: If True, disable colored output in logs
        json_format: If True, output logs in JSON format
    """
    import json as json_module
    
    # Intercept standard logging
    orig_logging.basicConfig(handlers=[InterceptHandler()], level=0, force=True)

    # Configure loguru
    logging.remove()  # Remove default handler
    
    if json_format:
        # JSON format for machine parsing
        def json_sink(message):
            record = message.record
            log_entry = {
                "timestamp": record["time"].isoformat(),
                "level": record["level"].name,
                "module": record["module"],
                "function": record["function"],
                "line": record["line"],
                "message": record["message"],
            }
            # Add exception info if present
            if record["exception"]:
                log_entry["exception"] = str(record["exception"])
            print(json_module.dumps(log_entry), flush=True)
        
        logging.add(
            json_sink,
            format="{message}",
            level="DEBUG",
            serialize=False
        )
    elif no_color:
        # Plain format without color tags
        log_format = (
            "{time:YYYY-MM-DD HH:mm:ss.SSS} | "
            "{level: <8} | "
            "{module}:{function}:{line} | "
            "{message}"
        )
        logging.add(
            sys.stderr,
            format=log_format,
            level="DEBUG",
            colorize=False,
            diagnose=True
        )
    else:
        # Colored format
        log_format = (
            "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | "
            "<level>{level: <8}</level> | "
            "<cyan>{module}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> | "
            "<level>{message}</level>"
        )
        logging.add(
            sys.stderr,
            format=log_format,
            level="DEBUG",
            colorize=True,
            diagnose=True
        )

    # log_path = Path(log_file)
    # log_path.parent.mkdir(parents=True, exist_ok=True)
    #
    # logging.add(
    #     log_file,
    #     format=log_format,
    #     level=log_level,
    #     rotation=log_rotation,
    #     retention=log_retention,
    #     compression="zip",
    #     backtrace=True,
    #     diagnose=True,
    #     enqueue=True  # Thread-safe logging
    # )
    # logging.add(
    #     "server.log",
    #     rotation="1 day",
    #     retention="7 days",
    #     level="INFO",
    #     format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level} | {name}:{function}:{line} | {message}",
    # )
    # logging.add(
    #     lambda msg: print(msg, end=""),
    #     level="INFO",
    #     format="{time:HH:mm:ss.SSS} | {level} | {message}",
    #     colorize=True,
    # )