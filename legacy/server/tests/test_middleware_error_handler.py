"""
Comprehensive tests for error handling middleware.
Part of Phase 4: UI and Utilities testing
"""

import pytest
import sys
import time
from unittest.mock import MagicMock, patch, AsyncMock
from fastapi import Request, Response, HTTPException, FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.datastructures import Headers

from middleware.error_handler import (
    ErrorHandlingMiddleware,
    RequestLoggingMiddleware,
    setup_error_handling
)


class TestErrorHandlingMiddleware:
    """Test the ErrorHandlingMiddleware class"""
    
    @pytest.fixture
    def mock_request(self):
        """Create a mock request"""
        request = MagicMock(spec=Request)
        request.method = "GET"
        request.url.path = "/test"
        request.client.host = "127.0.0.1"
        request.state = MagicMock()
        return request
    
    @pytest.fixture
    def middleware(self):
        """Create middleware instance"""
        app = MagicMock()
        return ErrorHandlingMiddleware(app)
    
    @pytest.mark.asyncio
    async def test_successful_request(self, middleware, mock_request):
        """Test middleware with successful request"""
        # Mock response with MutableHeaders
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.headers = {}
        
        # Mock call_next
        async def call_next(request):
            return mock_response
        
        with patch('middleware.error_handler.logger') as mock_logger:
            with patch('time.time', side_effect=[1000.0, 1000.0, 1000.5]):
                response = await middleware.dispatch(mock_request, call_next)
        
        # Verify request ID was set
        assert mock_request.state.request_id == "1000000-127.0.0.1"
        
        # Verify response headers
        assert response.headers["X-Request-ID"] == "1000000-127.0.0.1"
        assert response.headers["X-Response-Time"] == "0.500s"
        
        # Verify logging
        assert mock_logger.info.call_count == 2
        start_log = mock_logger.info.call_args_list[0][0][0]
        assert "Request started" in start_log
        assert "GET" in start_log
        assert "/test" in start_log
        
        complete_log = mock_logger.info.call_args_list[1][0][0]
        assert "Request completed" in complete_log
        assert "200" in complete_log
        assert "0.500s" in complete_log
    
    @pytest.mark.asyncio
    async def test_exception_handling(self, middleware, mock_request):
        """Test middleware with exception"""
        # Mock call_next that raises exception
        async def call_next(request):
            raise ValueError("Test error")
        
        with patch('middleware.error_handler.logger') as mock_logger:
            with patch('time.time', side_effect=[1000.0, 1000.0, 1000.5]):
                response = await middleware.dispatch(mock_request, call_next)
        
        # Verify response is JSON error
        assert isinstance(response, JSONResponse)
        assert response.status_code == 500
        
        # Verify response content
        content = response.body.decode()
        assert "ValueError" in content
        assert "Test error" in content
        assert "1000000-127.0.0.1" in content
        
        # Verify error logging
        error_calls = [call for call in mock_logger.error.call_args_list]
        assert len(error_calls) >= 1
        error_log = error_calls[0][0][0]
        assert "Request failed" in error_log
        assert "ValueError" in error_log
        assert "Test error" in error_log
    
    @pytest.mark.asyncio
    async def test_http_exception_handling(self, middleware, mock_request):
        """Test middleware with HTTPException"""
        # Create HTTPException with status_code
        http_exc = HTTPException(status_code=404, detail="Not found")
        
        async def call_next(request):
            raise http_exc
        
        response = await middleware.dispatch(mock_request, call_next)
        
        # Should use exception's status code
        assert response.status_code == 404
        
        # Verify error content
        content = response.body.decode()
        assert "HTTPException" in content
        assert "Not found" in content
    
    @pytest.mark.asyncio
    async def test_request_without_client(self, middleware):
        """Test handling request without client info"""
        # Create request without client
        request = MagicMock(spec=Request)
        request.method = "GET"
        request.url.path = "/test"
        request.client = None
        request.state = MagicMock()
        
        mock_response = Response(content="OK")
        mock_response.headers = {}
        
        async def call_next(req):
            return mock_response
        
        with patch('time.time', return_value=1000.0):
            response = await middleware.dispatch(request, call_next)
        
        # Should handle missing client gracefully
        assert request.state.request_id == "1000000-unknown"
    
    @pytest.mark.asyncio
    async def test_debug_mode_traceback(self, middleware, mock_request):
        """Test that traceback is included in debug mode"""
        async def call_next(request):
            raise Exception("Debug test")
        
        with patch('middleware.error_handler.logger') as mock_logger:
            # Mock logger to simulate debug mode
            mock_logger.level.return_value.no = 10
            mock_logger._core.min_level = 20
            
            response = await middleware.dispatch(mock_request, call_next)
        
        # Verify traceback is in response
        content = response.body.decode()
        assert "traceback" in content


class TestRequestLoggingMiddleware:
    """Test the RequestLoggingMiddleware class"""
    
    @pytest.fixture
    def middleware(self):
        """Create middleware instance"""
        app = MagicMock()
        return RequestLoggingMiddleware(app)
    
    @pytest.mark.asyncio
    async def test_request_logging(self, middleware):
        """Test request details logging"""
        # Create request with query params and headers
        request = MagicMock(spec=Request)
        request.state.request_id = "test-123"
        request.client.host = "192.168.1.1"
        request.query_params = {"param1": "value1", "param2": "value2"}
        request.headers = {
            "user-agent": "test-agent",
            "authorization": "Bearer secret",
            "content-type": "application/json"
        }
        
        mock_response = Response(content="OK")
        
        async def call_next(req):
            return mock_response
        
        with patch('middleware.error_handler.logger') as mock_logger:
            response = await middleware.dispatch(request, call_next)
        
        # Verify debug logging
        debug_call = mock_logger.debug.call_args[0][0]
        assert "test-123" in debug_call
        assert "192.168.1.1" in debug_call
        assert str({"param1": "value1", "param2": "value2"}) in debug_call
        
        # Verify trace logging with sanitized headers
        trace_call = mock_logger.trace.call_args[0][0]
        assert "user-agent" in trace_call
        assert "content-type" in trace_call
        assert "authorization" not in trace_call  # Should be filtered
        assert "secret" not in trace_call
    
    @pytest.mark.asyncio
    async def test_request_without_id(self, middleware):
        """Test logging request without request ID"""
        request = MagicMock(spec=Request)
        request.state = MagicMock()
        request.client = None
        request.query_params = {}
        request.headers = {}
        
        # Remove request_id attribute
        del request.state.request_id
        
        mock_response = Response(content="OK")
        
        async def call_next(req):
            return mock_response
        
        with patch('middleware.error_handler.logger') as mock_logger:
            response = await middleware.dispatch(request, call_next)
        
        # Should use 'no-id' as fallback
        debug_call = mock_logger.debug.call_args[0][0]
        assert "no-id" in debug_call


class TestSetupErrorHandling:
    """Test the setup_error_handling function"""
    
    @pytest.fixture
    def app(self):
        """Create a FastAPI app"""
        return FastAPI()
    
    def test_setup_adds_middleware(self, app):
        """Test that setup adds middleware"""
        with patch('middleware.error_handler.logger'):
            setup_error_handling(app)
        
        # Check middleware was added
        middleware_classes = [m.cls for m in app.user_middleware]
        assert ErrorHandlingMiddleware in middleware_classes
        assert RequestLoggingMiddleware in middleware_classes
    
    def test_setup_adds_exception_handlers(self, app):
        """Test that setup adds exception handlers"""
        with patch('middleware.error_handler.logger'):
            setup_error_handling(app)
        
        # Check exception handlers were added
        assert HTTPException in app.exception_handlers
        assert RequestValidationError in app.exception_handlers
    
    @pytest.mark.asyncio
    async def test_http_exception_handler(self, app):
        """Test HTTP exception handler"""
        with patch('middleware.error_handler.logger') as mock_logger:
            setup_error_handling(app)
        
        # Get the handler
        handler = app.exception_handlers[HTTPException]
        
        # Create mock request and exception
        request = MagicMock()
        request.state.request_id = "test-123"
        exc = HTTPException(status_code=403, detail="Forbidden")
        
        # Call handler
        response = await handler(request, exc)
        
        # Verify response
        assert isinstance(response, JSONResponse)
        assert response.status_code == 403
        assert response.headers["X-Request-ID"] == "test-123"
        
        # Verify logging
        mock_logger.warning.assert_called_once()
        warning_log = mock_logger.warning.call_args[0][0]
        assert "HTTP exception" in warning_log
        assert "403" in warning_log
        assert "Forbidden" in warning_log
    
    @pytest.mark.asyncio
    async def test_validation_exception_handler(self, app):
        """Test validation exception handler"""
        with patch('middleware.error_handler.logger') as mock_logger:
            setup_error_handling(app)
        
        # Get the handler
        handler = app.exception_handlers[RequestValidationError]
        
        # Create mock request and exception
        request = MagicMock()
        request.state.request_id = "test-456"
        
        # Mock validation error
        mock_error = MagicMock()
        mock_error.errors.return_value = [
            {"loc": ["body", "field"], "msg": "field required", "type": "missing"}
        ]
        exc = RequestValidationError(mock_error.errors())
        
        # Call handler
        response = await handler(request, exc)
        
        # Verify response
        assert isinstance(response, JSONResponse)
        assert response.status_code == 422
        
        content = response.body.decode()
        assert "ValidationError" in content
        assert "field required" in content


class TestErrorHandlingIntegration:
    """Integration tests for error handling"""
    
    @pytest.mark.asyncio
    async def test_full_error_handling_flow(self):
        """Test complete error handling flow"""
        app = FastAPI()
        
        # Add a test route that raises an error
        @app.get("/error")
        async def error_route():
            raise ValueError("Integration test error")
        
        # Add a successful route
        @app.get("/success")
        async def success_route():
            return {"status": "ok"}
        
        # Setup error handling
        setup_error_handling(app)
        
        # Test with test client
        from fastapi.testclient import TestClient
        client = TestClient(app)
        
        # Test successful request
        response = client.get("/success")
        assert response.status_code == 200
        assert "X-Request-ID" in response.headers
        assert "X-Response-Time" in response.headers
        
        # Test error request
        response = client.get("/error")
        assert response.status_code == 500
        assert "X-Request-ID" in response.headers
        
        error_data = response.json()
        assert error_data["error"]["type"] == "ValueError"
        assert error_data["error"]["message"] == "Integration test error"
    
    @pytest.mark.asyncio
    async def test_concurrent_requests(self):
        """Test middleware handles concurrent requests correctly"""
        app = FastAPI()
        
        request_ids = []
        
        @app.get("/track/{id}")
        async def track_route(id: int, request: Request):
            request_ids.append(request.state.request_id)
            return {"id": id}
        
        setup_error_handling(app)
        
        from fastapi.testclient import TestClient
        client = TestClient(app)
        
        # Make multiple requests
        for i in range(5):
            response = client.get(f"/track/{i}")
            assert response.status_code == 200
        
        # All request IDs should be unique
        assert len(set(request_ids)) == 5