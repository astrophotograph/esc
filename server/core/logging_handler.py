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


def setup_logging():
    """Configure logging for the application."""
    # Intercept standard logging
    orig_logging.basicConfig(handlers=[InterceptHandler()], level=0, force=True)

    # Configure loguru
    logging.remove()  # Remove default handler
    log_format = (
        "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | "
        "<level>{level: <8}</level> | "
        "<cyan>{module}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> | "
        "<level>{message}</level>"
    )

    # Add console handler
    log_level = "DEBUG"
    logging.add(
        sys.stderr,
        format=log_format,
        level=log_level,
        colorize=True,
        # backtrace=True,
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