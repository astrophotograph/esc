"""Logging configuration and handlers."""

import logging as orig_logging
from loguru import logger as logging


class InterceptHandler(orig_logging.Handler):
    """Handler to intercept standard logging and forward to loguru."""

    def emit(self, record: orig_logging.LogRecord) -> None:
        # Get corresponding Loguru level if it exists
        try:
            level = logging.level(record.levelname).name
        except ValueError:
            level = record.levelno

        # Find caller from where originated the logged message
        frame, depth = orig_logging.currentframe(), 2
        while frame.f_code.co_filename == orig_logging.__file__:
            frame = frame.f_back
            depth += 1

        logging.opt(depth=depth, exception=record.exc_info).log(
            level, record.getMessage()
        )


def setup_logging():
    """Configure logging for the application."""
    # Intercept standard logging
    orig_logging.basicConfig(handlers=[InterceptHandler()], level=0)

    # Configure loguru
    logging.remove()  # Remove default handler
    logging.add(
        "server.log",
        rotation="1 day",
        retention="7 days",
        level="INFO",
        format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level} | {name}:{function}:{line} | {message}",
    )
    logging.add(
        lambda msg: print(msg, end=""),
        level="INFO",
        format="{time:HH:mm:ss.SSS} | {level} | {message}",
        colorize=True,
    )