"""Network simulation middleware for testing slow and unreliable network conditions."""

import asyncio
import random
import time
from typing import Optional, Dict, Any, Callable
from dataclasses import dataclass
from pathlib import Path

from fastapi import Request, Response
from fastapi.responses import StreamingResponse, FileResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
from loguru import logger as logging


@dataclass
class NetworkSimulationConfig:
    """Configuration for network simulation parameters."""
    
    # Latency simulation
    base_delay_ms: float = 0.0
    delay_variation_ms: float = 0.0
    
    # Packet loss simulation
    packet_loss_rate: float = 0.0  # 0.0 to 1.0
    
    # Bandwidth throttling
    bandwidth_limit_kbps: Optional[float] = None
    
    # Connection drops
    connection_drop_rate: float = 0.0  # 0.0 to 1.0
    
    # Timeouts
    timeout_rate: float = 0.0  # 0.0 to 1.0
    timeout_delay_ms: float = 10000.0
    
    # Path patterns to apply simulation to
    apply_to_paths: list[str] = None
    
    # Enable/disable simulation
    enabled: bool = False

    def __post_init__(self):
        if self.apply_to_paths is None:
            # Default to image-related paths
            self.apply_to_paths = [
                "/api/processing/",
                "/processed/",
                "/uploads/",
                ".png",
                ".jpg",
                ".jpeg",
                ".fit",
                ".fits"
            ]


class NetworkSimulationState:
    """Global state for network simulation."""
    
    def __init__(self):
        self.config = NetworkSimulationConfig()
        self.stats = {
            "requests_processed": 0,
            "requests_delayed": 0,
            "requests_dropped": 0,
            "requests_timed_out": 0,
            "total_delay_ms": 0.0,
            "bytes_throttled": 0,
        }
        self.start_time = time.time()
    
    def reset_stats(self):
        """Reset simulation statistics."""
        self.stats = {
            "requests_processed": 0,
            "requests_delayed": 0,
            "requests_dropped": 0,
            "requests_timed_out": 0,
            "total_delay_ms": 0.0,
            "bytes_throttled": 0,
        }
        self.start_time = time.time()
    
    def get_stats(self) -> Dict[str, Any]:
        """Get current simulation statistics."""
        uptime = time.time() - self.start_time
        processed = self.stats["requests_processed"]
        
        return {
            "config": {
                "enabled": self.config.enabled,
                "base_delay_ms": self.config.base_delay_ms,
                "delay_variation_ms": self.config.delay_variation_ms,
                "packet_loss_rate": self.config.packet_loss_rate,
                "bandwidth_limit_kbps": self.config.bandwidth_limit_kbps,
                "connection_drop_rate": self.config.connection_drop_rate,
                "timeout_rate": self.config.timeout_rate,
                "apply_to_paths": self.config.apply_to_paths,
            },
            "stats": {
                **self.stats,
                "uptime_seconds": round(uptime, 2),
                "requests_per_second": round(processed / uptime, 2) if uptime > 0 else 0,
                "average_delay_ms": round(
                    self.stats["total_delay_ms"] / processed, 2
                ) if processed > 0 else 0,
            }
        }


# Global simulation state
_simulation_state = NetworkSimulationState()


def get_simulation_state() -> NetworkSimulationState:
    """Get the global network simulation state."""
    return _simulation_state


class NetworkSimulationMiddleware(BaseHTTPMiddleware):
    """Middleware to simulate network conditions for testing."""
    
    def __init__(self, app: ASGIApp):
        super().__init__(app)
        self.state = get_simulation_state()
    
    def _should_apply_simulation(self, path: str) -> bool:
        """Check if simulation should be applied to this request path."""
        if not self.state.config.enabled:
            return False
        
        return any(pattern in path for pattern in self.state.config.apply_to_paths)
    
    async def _simulate_packet_loss(self) -> bool:
        """Simulate packet loss. Returns True if packet should be dropped."""
        if self.state.config.packet_loss_rate <= 0:
            return False
        
        should_drop = random.random() < self.state.config.packet_loss_rate
        if should_drop:
            self.state.stats["requests_dropped"] += 1
            logging.debug(f"Simulating packet loss (rate: {self.state.config.packet_loss_rate})")
        
        return should_drop
    
    async def _simulate_connection_drop(self) -> bool:
        """Simulate connection drop. Returns True if connection should be dropped."""
        if self.state.config.connection_drop_rate <= 0:
            return False
        
        should_drop = random.random() < self.state.config.connection_drop_rate
        if should_drop:
            self.state.stats["requests_dropped"] += 1
            logging.debug(f"Simulating connection drop (rate: {self.state.config.connection_drop_rate})")
        
        return should_drop
    
    async def _simulate_timeout(self) -> bool:
        """Simulate request timeout. Returns True if request should time out."""
        if self.state.config.timeout_rate <= 0:
            return False
        
        should_timeout = random.random() < self.state.config.timeout_rate
        if should_timeout:
            await asyncio.sleep(self.state.config.timeout_delay_ms / 1000.0)
            self.state.stats["requests_timed_out"] += 1
            logging.debug(f"Simulating timeout (rate: {self.state.config.timeout_rate})")
        
        return should_timeout
    
    async def _simulate_latency(self):
        """Simulate network latency with jitter."""
        if self.state.config.base_delay_ms <= 0:
            return
        
        # Calculate delay with variation
        base_delay = self.state.config.base_delay_ms / 1000.0
        variation = self.state.config.delay_variation_ms / 1000.0
        
        if variation > 0:
            # Add random jitter
            jitter = random.uniform(-variation/2, variation/2)
            delay = max(0, base_delay + jitter)
        else:
            delay = base_delay
        
        if delay > 0:
            await asyncio.sleep(delay)
            self.state.stats["requests_delayed"] += 1
            self.state.stats["total_delay_ms"] += delay * 1000
            logging.debug(f"Simulating latency: {delay*1000:.1f}ms")
    
    async def _create_throttled_response(self, response: Response) -> Response:
        """Create a bandwidth-throttled version of the response."""
        if not self.state.config.bandwidth_limit_kbps:
            return response
        
        # Only throttle if response has content
        if not hasattr(response, 'body') or not response.body:
            return response
        
        bytes_per_second = self.state.config.bandwidth_limit_kbps * 1024
        chunk_size = 8192  # 8KB chunks
        delay_per_chunk = chunk_size / bytes_per_second
        
        async def throttled_generator():
            """Generator that yields response data with bandwidth throttling."""
            body = response.body
            total_bytes = len(body)
            
            for i in range(0, total_bytes, chunk_size):
                chunk = body[i:i + chunk_size]
                yield chunk
                
                # Throttle by sleeping between chunks
                if i + chunk_size < total_bytes:  # Don't delay after last chunk
                    await asyncio.sleep(delay_per_chunk)
                    self.state.stats["bytes_throttled"] += len(chunk)
        
        # Create streaming response with throttling
        return StreamingResponse(
            throttled_generator(),
            status_code=response.status_code,
            headers=dict(response.headers),
            media_type=response.headers.get("content-type")
        )
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Process request with network simulation."""
        self.state.stats["requests_processed"] += 1
        
        # Check if simulation should be applied
        if not self._should_apply_simulation(request.url.path):
            return await call_next(request)
        
        logging.debug(f"Applying network simulation to: {request.url.path}")
        
        try:
            # Simulate connection drop before processing
            if await self._simulate_connection_drop():
                from fastapi import HTTPException
                raise HTTPException(status_code=503, detail="Simulated connection drop")
            
            # Simulate packet loss
            if await self._simulate_packet_loss():
                from fastapi import HTTPException
                raise HTTPException(status_code=503, detail="Simulated packet loss")
            
            # Simulate latency before processing request
            await self._simulate_latency()
            
            # Process the request
            response = await call_next(request)
            
            # Simulate timeout after processing
            if await self._simulate_timeout():
                from fastapi import HTTPException
                raise HTTPException(status_code=408, detail="Simulated request timeout")
            
            # Apply bandwidth throttling if enabled
            if self.state.config.bandwidth_limit_kbps:
                response = await self._create_throttled_response(response)
            
            return response
            
        except Exception as e:
            # Re-raise HTTP exceptions from simulation
            if hasattr(e, 'status_code'):
                raise e
            
            # Log other errors but don't interfere with normal error handling
            logging.error(f"Error in network simulation middleware: {e}")
            return await call_next(request)


# Convenience functions for external use

def enable_simulation(config: Optional[NetworkSimulationConfig] = None):
    """Enable network simulation with optional configuration."""
    state = get_simulation_state()
    if config:
        state.config = config
    state.config.enabled = True
    logging.info("Network simulation enabled")


def disable_simulation():
    """Disable network simulation."""
    state = get_simulation_state()
    state.config.enabled = False
    logging.info("Network simulation disabled")


def update_simulation_config(**kwargs):
    """Update simulation configuration parameters."""
    state = get_simulation_state()
    
    for key, value in kwargs.items():
        if hasattr(state.config, key):
            setattr(state.config, key, value)
            logging.debug(f"Updated simulation config: {key}={value}")
        else:
            logging.warning(f"Unknown simulation config parameter: {key}")


def get_simulation_status() -> Dict[str, Any]:
    """Get current simulation status and statistics."""
    return get_simulation_state().get_stats()


def reset_simulation_stats():
    """Reset simulation statistics."""
    get_simulation_state().reset_stats()
    logging.info("Network simulation statistics reset")