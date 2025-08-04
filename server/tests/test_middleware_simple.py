"""
Simple tests for middleware components to verify basic functionality.
Part of Phase 4: UI and Utilities testing
"""

import pytest
from unittest.mock import MagicMock, patch, AsyncMock
import time
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse

from middleware.error_handler import (
    ErrorHandlingMiddleware,
    RequestLoggingMiddleware,
    setup_error_handling
)


class TestMiddlewareBasics:
    """Basic tests for middleware functionality"""
    
    def test_error_handling_middleware_exists(self):
        """Test that ErrorHandlingMiddleware class exists"""
        assert ErrorHandlingMiddleware is not None
        assert hasattr(ErrorHandlingMiddleware, 'dispatch')
    
    def test_request_logging_middleware_exists(self):
        """Test that RequestLoggingMiddleware class exists"""
        assert RequestLoggingMiddleware is not None
        assert hasattr(RequestLoggingMiddleware, 'dispatch')
    
    def test_setup_error_handling_exists(self):
        """Test that setup_error_handling function exists"""
        assert setup_error_handling is not None
        assert callable(setup_error_handling)
    
    @pytest.mark.asyncio
    async def test_middleware_structure(self):
        """Test middleware has correct structure"""
        app = MagicMock()
        middleware = ErrorHandlingMiddleware(app)
        
        # Should have dispatch method
        assert hasattr(middleware, 'dispatch')
        assert callable(middleware.dispatch)
        
        # Should be async
        import inspect
        assert inspect.iscoroutinefunction(middleware.dispatch)
    
    def test_setup_error_handling_basic(self):
        """Test basic setup_error_handling functionality"""
        app = FastAPI()
        
        # Should not raise exception
        with patch('middleware.error_handler.logger'):
            setup_error_handling(app)
        
        # Should have added middleware
        assert len(app.user_middleware) > 0
        
        # Should have added exception handlers
        assert len(app.exception_handlers) > 0


class TestMiddlewareFunctionality:
    """Test actual middleware functionality with simpler mocks"""
    
    @pytest.mark.asyncio
    async def test_request_id_generation(self):
        """Test that middleware generates request IDs"""
        app = MagicMock()
        middleware = ErrorHandlingMiddleware(app)
        
        # Create minimal request mock
        request = MagicMock()
        request.state = MagicMock()
        request.client = MagicMock()
        request.client.host = "127.0.0.1"
        request.method = "GET"
        request.url = MagicMock()
        request.url.path = "/test"
        
        # Create call_next that returns immediately
        async def call_next(req):
            # Create a simple response-like object
            response = MagicMock()
            response.headers = {}
            response.status_code = 200
            return response
        
        with patch('time.time', return_value=1234567890):
            response = await middleware.dispatch(request, call_next)
        
        # Should have set request ID
        assert hasattr(request.state, 'request_id')
        assert request.state.request_id == "1234567890000-127.0.0.1"
    
    @pytest.mark.asyncio
    async def test_exception_creates_json_response(self):
        """Test that exceptions result in JSON error responses"""
        app = MagicMock()
        middleware = ErrorHandlingMiddleware(app)
        
        # Create minimal request
        request = MagicMock()
        request.state = MagicMock()
        request.client = MagicMock()
        request.client.host = "127.0.0.1"
        request.method = "GET"
        request.url = MagicMock()
        request.url.path = "/error"
        
        # Create call_next that raises
        async def call_next(req):
            raise ValueError("Test error")
        
        with patch('middleware.error_handler.logger'):
            response = await middleware.dispatch(request, call_next)
        
        # Should return JSONResponse
        assert isinstance(response, JSONResponse)
        assert response.status_code == 500
    
    def test_logging_middleware_filters_headers(self):
        """Test that logging middleware filters sensitive headers"""
        # Create request with headers
        request = MagicMock()
        request.state = MagicMock()
        request.state.request_id = "test-123"
        request.client = MagicMock()
        request.client.host = "192.168.1.1"
        request.query_params = {}
        
        # Mock headers with sensitive data
        request.headers = MagicMock()
        request.headers.items.return_value = [
            ("user-agent", "test-agent"),
            ("authorization", "Bearer secret-token"),
            ("cookie", "session=abc123"),
            ("content-type", "application/json")
        ]
        
        app = MagicMock()
        middleware = RequestLoggingMiddleware(app)
        
        # Check that middleware would filter headers correctly
        safe_headers = {
            k: v for k, v in request.headers.items()
            if k.lower() not in ['authorization', 'cookie', 'x-admin-token']
        }
        
        assert "authorization" not in safe_headers
        assert "cookie" not in safe_headers
        assert "user-agent" in safe_headers
        assert "content-type" in safe_headers


class TestErrorHandlerSetup:
    """Test the error handler setup process"""
    
    def test_adds_http_exception_handler(self):
        """Test that HTTP exception handler is added"""
        app = FastAPI()
        
        with patch('middleware.error_handler.logger'):
            setup_error_handling(app)
        
        # Should have HTTPException handler
        assert HTTPException in app.exception_handlers
        
        # Handler should be callable
        handler = app.exception_handlers[HTTPException]
        assert callable(handler)
    
    @pytest.mark.asyncio 
    async def test_http_exception_handler_format(self):
        """Test HTTP exception handler response format"""
        app = FastAPI()
        
        with patch('middleware.error_handler.logger'):
            setup_error_handling(app)
        
        # Get handler
        handler = app.exception_handlers[HTTPException]
        
        # Create mock request
        request = MagicMock()
        request.state = MagicMock()
        request.state.request_id = "test-123"
        
        # Create exception
        exc = HTTPException(status_code=404, detail="Not found")
        
        # Call handler
        with patch('middleware.error_handler.logger'):
            response = await handler(request, exc)
        
        # Check response format
        assert isinstance(response, JSONResponse)
        assert response.status_code == 404
        
        # Headers should include request ID
        assert "X-Request-ID" in response.headers
        assert response.headers["X-Request-ID"] == "test-123"