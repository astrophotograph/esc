"""Global error handling middleware for the application."""

import sys
import time
import traceback
from typing import Callable

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from loguru import logger
from starlette.middleware.base import BaseHTTPMiddleware


class ErrorHandlingMiddleware(BaseHTTPMiddleware):
    """
    Middleware to handle exceptions globally and provide consistent error responses.
    
    Features:
    - Catches all unhandled exceptions
    - Logs errors with full context
    - Returns user-friendly error messages
    - Tracks request duration
    - Adds request ID for tracing
    """
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Process the request and handle any exceptions."""
        # Generate request ID for tracing
        request_id = f"{int(time.time() * 1000)}-{request.client.host if request.client else 'unknown'}"
        request.state.request_id = request_id
        
        # Track request start time
        start_time = time.time()
        
        # Log incoming request
        logger.info(
            f"Request started | ID: {request_id} | "
            f"Method: {request.method} | Path: {request.url.path}"
        )
        
        try:
            # Process the request
            response = await call_next(request)
            
            # Calculate request duration
            duration = time.time() - start_time
            
            # Add request ID to response headers
            response.headers["X-Request-ID"] = request_id
            response.headers["X-Response-Time"] = f"{duration:.3f}s"
            
            # Log successful request
            logger.info(
                f"Request completed | ID: {request_id} | "
                f"Status: {response.status_code} | Duration: {duration:.3f}s"
            )
            
            return response
            
        except Exception as exc:
            # Calculate request duration
            duration = time.time() - start_time
            
            # Get detailed error information
            exc_type, exc_value, exc_traceback = sys.exc_info()
            error_details = {
                "type": exc_type.__name__ if exc_type else "Unknown",
                "message": str(exc_value),
                "traceback": traceback.format_tb(exc_traceback)
            }
            
            # Log the error with full context
            logger.error(
                f"Request failed | ID: {request_id} | "
                f"Method: {request.method} | Path: {request.url.path} | "
                f"Duration: {duration:.3f}s | Error: {error_details['type']}: {error_details['message']}"
            )
            logger.error(f"Traceback:\n{''.join(error_details['traceback'])}")
            
            # Determine appropriate status code
            status_code = 500
            if hasattr(exc, 'status_code'):
                status_code = exc.status_code
            
            # Create error response
            error_response = {
                "error": {
                    "type": error_details["type"],
                    "message": error_details["message"],
                    "request_id": request_id,
                    "path": str(request.url.path),
                    "method": request.method,
                    "timestamp": time.time()
                }
            }
            
            # In development, include traceback
            if logger.level("DEBUG").no <= logger._core.min_level:
                error_response["error"]["traceback"] = error_details["traceback"]
            
            return JSONResponse(
                status_code=status_code,
                content=error_response,
                headers={
                    "X-Request-ID": request_id,
                    "X-Response-Time": f"{duration:.3f}s"
                }
            )


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware to log all requests with detailed information.
    
    Logs:
    - Request method, path, query parameters
    - Request headers (sanitized)
    - Response status and timing
    """
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Log request details."""
        # Get request ID if set by error handling middleware
        request_id = getattr(request.state, 'request_id', 'no-id')
        
        # Log request details
        logger.debug(
            f"Request details | ID: {request_id} | "
            f"Client: {request.client.host if request.client else 'unknown'} | "
            f"Query: {dict(request.query_params)}"
        )
        
        # Log headers (excluding sensitive ones)
        safe_headers = {
            k: v for k, v in request.headers.items()
            if k.lower() not in ['authorization', 'cookie', 'x-admin-token']
        }
        logger.trace(f"Request headers | ID: {request_id} | Headers: {safe_headers}")
        
        # Process request
        response = await call_next(request)
        
        return response


def setup_error_handling(app):
    """
    Set up error handling for the FastAPI application.
    
    Args:
        app: FastAPI application instance
    """
    # Add error handling middleware
    app.add_middleware(ErrorHandlingMiddleware)
    
    # Add request logging middleware (should be after error handling)
    app.add_middleware(RequestLoggingMiddleware)
    
    # Add exception handlers for specific exceptions
    from fastapi import HTTPException
    from fastapi.exceptions import RequestValidationError
    
    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        """Handle FastAPI HTTP exceptions."""
        request_id = getattr(request.state, 'request_id', 'no-id')
        logger.warning(
            f"HTTP exception | ID: {request_id} | "
            f"Status: {exc.status_code} | Detail: {exc.detail}"
        )
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "type": "HTTPException",
                    "message": exc.detail,
                    "request_id": request_id,
                    "status_code": exc.status_code
                }
            },
            headers={"X-Request-ID": request_id}
        )
    
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        """Handle request validation errors."""
        request_id = getattr(request.state, 'request_id', 'no-id')
        logger.warning(
            f"Validation error | ID: {request_id} | "
            f"Errors: {exc.errors()}"
        )
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "type": "ValidationError",
                    "message": "Request validation failed",
                    "request_id": request_id,
                    "details": exc.errors()
                }
            },
            headers={"X-Request-ID": request_id}
        )
    
    logger.info("Error handling middleware configured")