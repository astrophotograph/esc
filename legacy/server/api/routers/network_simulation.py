"""API endpoints for controlling network simulation."""

from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from loguru import logger as logging

from middleware.network_simulation import (
    get_simulation_state,
    get_simulation_status,
    update_simulation_config,
    enable_simulation,
    disable_simulation,
    reset_simulation_stats,
    NetworkSimulationConfig
)

router = APIRouter(prefix="/api/network-simulation", tags=["network-simulation"])


class SimulationConfigRequest(BaseModel):
    """Request model for updating simulation configuration."""
    
    base_delay_ms: Optional[float] = Field(None, ge=0, le=10000, description="Base latency in milliseconds")
    delay_variation_ms: Optional[float] = Field(None, ge=0, le=5000, description="Latency variation in milliseconds")
    packet_loss_rate: Optional[float] = Field(None, ge=0, le=1, description="Packet loss rate (0.0-1.0)")
    bandwidth_limit_kbps: Optional[float] = Field(None, ge=1, le=1000000, description="Bandwidth limit in KB/s")
    connection_drop_rate: Optional[float] = Field(None, ge=0, le=1, description="Connection drop rate (0.0-1.0)")
    timeout_rate: Optional[float] = Field(None, ge=0, le=1, description="Timeout rate (0.0-1.0)")
    timeout_delay_ms: Optional[float] = Field(None, ge=1000, le=60000, description="Timeout delay in milliseconds")
    apply_to_paths: Optional[List[str]] = Field(None, description="Path patterns to apply simulation to")
    enabled: Optional[bool] = Field(None, description="Enable/disable simulation")


class SimulationPresetRequest(BaseModel):
    """Request model for applying simulation presets."""
    
    preset: str = Field(..., description="Preset name")


class SimulationStatusResponse(BaseModel):
    """Response model for simulation status."""
    
    config: Dict[str, Any]
    stats: Dict[str, Any]


# Predefined simulation presets for common scenarios
SIMULATION_PRESETS = {
    "slow_3g": NetworkSimulationConfig(
        base_delay_ms=300,
        delay_variation_ms=100,
        packet_loss_rate=0.02,
        bandwidth_limit_kbps=200,
        enabled=True
    ),
    "slow_4g": NetworkSimulationConfig(
        base_delay_ms=150,
        delay_variation_ms=50,
        packet_loss_rate=0.01,
        bandwidth_limit_kbps=1000,
        enabled=True
    ),
    "unstable_wifi": NetworkSimulationConfig(
        base_delay_ms=50,
        delay_variation_ms=200,
        packet_loss_rate=0.05,
        connection_drop_rate=0.02,
        bandwidth_limit_kbps=5000,
        enabled=True
    ),
    "satellite": NetworkSimulationConfig(
        base_delay_ms=600,
        delay_variation_ms=100,
        packet_loss_rate=0.03,
        bandwidth_limit_kbps=1000,
        timeout_rate=0.01,
        enabled=True
    ),
    "dial_up": NetworkSimulationConfig(
        base_delay_ms=200,
        delay_variation_ms=50,
        packet_loss_rate=0.01,
        bandwidth_limit_kbps=56,
        enabled=True
    ),
    "extreme_poor": NetworkSimulationConfig(
        base_delay_ms=1000,
        delay_variation_ms=500,
        packet_loss_rate=0.1,
        connection_drop_rate=0.05,
        bandwidth_limit_kbps=50,
        timeout_rate=0.03,
        enabled=True
    ),
    "intermittent": NetworkSimulationConfig(
        base_delay_ms=100,
        delay_variation_ms=300,
        packet_loss_rate=0.15,
        connection_drop_rate=0.1,
        bandwidth_limit_kbps=500,
        enabled=True
    )
}


@router.get("/status", response_model=SimulationStatusResponse)
async def get_simulation_status_endpoint():
    """Get current network simulation status and statistics."""
    return SimulationStatusResponse(**get_simulation_status())


@router.post("/enable")
async def enable_simulation_endpoint():
    """Enable network simulation with current configuration."""
    enable_simulation()
    return {"message": "Network simulation enabled", "status": get_simulation_status()}


@router.post("/disable")
async def disable_simulation_endpoint():
    """Disable network simulation."""
    disable_simulation()
    return {"message": "Network simulation disabled", "status": get_simulation_status()}


@router.post("/reset-stats")
async def reset_stats_endpoint():
    """Reset simulation statistics."""
    reset_simulation_stats()
    return {"message": "Simulation statistics reset", "status": get_simulation_status()}


@router.put("/config")
async def update_config_endpoint(config: SimulationConfigRequest):
    """Update network simulation configuration."""
    # Convert to dict and filter None values
    config_dict = {k: v for k, v in config.dict().items() if v is not None}
    
    if not config_dict:
        raise HTTPException(status_code=400, detail="No configuration parameters provided")
    
    update_simulation_config(**config_dict)
    
    return {
        "message": f"Simulation configuration updated with {len(config_dict)} parameters",
        "updated_params": list(config_dict.keys()),
        "status": get_simulation_status()
    }


@router.get("/presets")
async def get_presets():
    """Get available simulation presets."""
    return {
        "presets": {
            name: {
                "base_delay_ms": preset.base_delay_ms,
                "delay_variation_ms": preset.delay_variation_ms,
                "packet_loss_rate": preset.packet_loss_rate,
                "bandwidth_limit_kbps": preset.bandwidth_limit_kbps,
                "connection_drop_rate": preset.connection_drop_rate,
                "timeout_rate": preset.timeout_rate,
                "description": _get_preset_description(name)
            }
            for name, preset in SIMULATION_PRESETS.items()
        }
    }


@router.post("/presets/{preset_name}")
async def apply_preset(preset_name: str):
    """Apply a predefined simulation preset."""
    if preset_name not in SIMULATION_PRESETS:
        available_presets = list(SIMULATION_PRESETS.keys())
        raise HTTPException(
            status_code=404,
            detail=f"Preset '{preset_name}' not found. Available presets: {available_presets}"
        )
    
    preset_config = SIMULATION_PRESETS[preset_name]
    state = get_simulation_state()
    state.config = preset_config
    
    logging.info(f"Applied network simulation preset: {preset_name}")
    
    return {
        "message": f"Applied preset '{preset_name}'",
        "preset": preset_name,
        "description": _get_preset_description(preset_name),
        "status": get_simulation_status()
    }


@router.post("/scenarios/telescope-imaging")
async def simulate_telescope_imaging_scenario():
    """Apply simulation optimized for testing telescope imaging workflows."""
    config = NetworkSimulationConfig(
        base_delay_ms=200,
        delay_variation_ms=100,
        packet_loss_rate=0.03,
        bandwidth_limit_kbps=800,
        apply_to_paths=[
            "/api/processing/",
            "/processed/",
            "/uploads/",
            ".png", ".jpg", ".fit", ".fits"
        ],
        enabled=True
    )
    
    state = get_simulation_state()
    state.config = config
    
    logging.info("Applied telescope imaging scenario simulation")
    
    return {
        "message": "Applied telescope imaging scenario simulation",
        "description": "Simulates conditions that affect telescope image processing and transfer",
        "status": get_simulation_status()
    }


@router.post("/scenarios/fits-processing")
async def simulate_fits_processing_scenario():
    """Apply simulation optimized for testing FITS file processing."""
    config = NetworkSimulationConfig(
        base_delay_ms=500,
        delay_variation_ms=200,
        packet_loss_rate=0.05,
        bandwidth_limit_kbps=300,
        timeout_rate=0.02,
        apply_to_paths=[
            "/api/processing/upload",
            "/api/processing/enhance",
            "/processed/",
            ".fit", ".fits", ".png"
        ],
        enabled=True
    )
    
    state = get_simulation_state()
    state.config = config
    
    logging.info("Applied FITS processing scenario simulation")
    
    return {
        "message": "Applied FITS processing scenario simulation",
        "description": "Simulates slow network conditions for large FITS file uploads and processing",
        "status": get_simulation_status()
    }


def _get_preset_description(preset_name: str) -> str:
    """Get human-readable description for a preset."""
    descriptions = {
        "slow_3g": "Simulates slow 3G mobile connection with moderate latency and packet loss",
        "slow_4g": "Simulates slower 4G connection with reduced bandwidth",
        "unstable_wifi": "Simulates unstable WiFi with variable latency and occasional drops",
        "satellite": "Simulates satellite internet with high latency and occasional timeouts",
        "dial_up": "Simulates dial-up connection with very limited bandwidth",
        "extreme_poor": "Simulates extremely poor network conditions for stress testing",
        "intermittent": "Simulates intermittent connectivity with frequent packet loss"
    }
    return descriptions.get(preset_name, "Custom network simulation preset")


# Additional endpoints for testing and debugging

@router.get("/test-endpoints")
async def get_test_endpoints():
    """Get list of endpoints that will be affected by simulation."""
    state = get_simulation_state()
    return {
        "simulation_enabled": state.config.enabled,
        "apply_to_paths": state.config.apply_to_paths,
        "affected_endpoints": [
            "/api/processing/upload",
            "/api/processing/enhance",
            "/api/processing/persisted-files",
            "/processed/{image_id}.png",
            "/uploads/{file_id}.fit"
        ],
        "note": "Simulation applies to any request path containing the configured path patterns"
    }