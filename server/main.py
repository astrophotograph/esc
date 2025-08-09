#!/usr/bin/env python3
"""
Seestar API Server - Main entry point.

This module provides the main CLI interface and server initialization
for the Seestar telescope control system.
"""

import asyncio
import os
import signal
import logging as orig_logging
from typing import Optional

import click
import uvicorn
from fastapi import FastAPI
from loguru import logger as logging

# Import refactored modules
from models import (
    AddTelescopeRequest,
    SaveConfigurationRequest,
    AddRemoteControllerRequest,
    ConfigurationResponse,
    ConfigurationListItem,
    RemoteControllerResponse,
    ImageEnhancementSettingsRequest,
    UpscalingSettingsRequest,
    ImageEnhancementSettingsResponse,
    UpscalingSettingsResponse,
    Telescope,
    TestTelescope,
)
from controllers.main_controller import Controller
from core.logging_handler import InterceptHandler, setup_logging
from api.routers import skymap


# Setup logging
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


@click.group()
def main():
    """Seestar commands."""
    pass


@main.command("panorama")
@click.option(
    "--host",
    default="localhost",
    help="IP address of the Seestar device",
)
@click.option(
    "--port",
    default=4700,
    help="Port of the Seestar device",
)
@click.option(
    "--prefix",
    default="panorama",
    help="Prefix for output files",
)
@click.option(
    "--output-dir",
    default="panorama_output",
    help="Directory for output files",
)
@click.option(
    "--overlap",
    default=30,
    help="Overlap percentage between images (10-50)",
    type=click.IntRange(10, 50),
)
@click.option(
    "--rows",
    default=3,
    help="Number of rows in the panorama grid",
    type=click.IntRange(1, 10),
)
@click.option(
    "--cols",
    default=4,
    help="Number of columns in the panorama grid",
    type=click.IntRange(1, 10),
)
@click.option(
    "--start-alt",
    default=30,
    help="Starting altitude in degrees",
    type=click.FloatRange(0, 90),
)
@click.option(
    "--end-alt",
    default=60,
    help="Ending altitude in degrees",
    type=click.FloatRange(0, 90),
)
@click.option(
    "--start-az",
    default=0,
    help="Starting azimuth in degrees",
    type=click.FloatRange(0, 360),
)
@click.option(
    "--end-az",
    default=90,
    help="Ending azimuth in degrees",
    type=click.FloatRange(0, 360),
)
def panorama(
    host, port, prefix, output_dir, overlap, rows, cols, start_alt, end_alt, start_az, end_az
):
    """Create a panorama by capturing multiple images."""
    from panorama_generator import PanoramaGenerator
    
    generator = PanoramaGenerator(
        host=host,
        port=port,
        output_dir=output_dir,
        prefix=prefix,
        overlap=overlap,
        rows=rows,
        cols=cols,
        start_alt=start_alt,
        end_alt=end_alt,
        start_az=start_az,
        end_az=end_az,
    )
    
    asyncio.run(generator.capture_panorama())


@main.command("server")
@click.option("--server-port", default=8000, help="Port for the API server (default: 8000)")
@click.option("--seestar-host", help="Seestar device host address")
@click.option("--seestar-port", default=4700, help="Seestar device port (default: 4700)")
@click.option(
    "--remote-controller",
    multiple=True,
    help="Remote controller address (format: host:port). Can be specified multiple times",
)
@click.option(
    "--no-discovery",
    is_flag=True,
    help="Disable automatic telescope discovery",
)
@click.option(
    "--reload",
    is_flag=True,
    help="Enable auto-reload on code changes (development mode)",
)
@click.option(
    "--network-sim",
    type=click.Choice(
        ["slow_3g", "slow_4g", "unstable_wifi", "satellite", "dial_up", "extreme_poor", "intermittent"]
    ),
    help="Enable network simulation with the specified preset",
)
@click.option(
    "--network-sim-delay",
    type=float,
    help="Custom network simulation delay in milliseconds (overrides preset)",
)
@click.option(
    "--network-sim-packet-loss",
    type=float,
    help="Custom network simulation packet loss rate 0.0-1.0 (overrides preset)",
)
@click.option(
    "--network-sim-bandwidth",
    type=float,
    help="Custom network simulation bandwidth limit in KB/s (overrides preset)",
)
def server(
    server_port,
    seestar_host,
    seestar_port,
    remote_controller,
    no_discovery,
    reload,
    network_sim,
    network_sim_delay,
    network_sim_packet_loss,
    network_sim_bandwidth,
):
    """Start a FastAPI server for controlling a Seestar device."""
    setup_logging()
    
    # Clear screen and show banner
    click.clear()
    click.secho("=" * 60, fg="cyan")
    click.secho("Seestar API Server", fg="cyan", bold=True)
    click.secho("=" * 60, fg="cyan")
    click.echo(f"Starting Seestar API server on port {server_port}")
    
    if no_discovery:
        click.echo("Auto-discovery is disabled")
    else:
        click.echo("Auto-discovery is enabled")
    
    if reload:
        click.echo("Auto-reload enabled - server will restart when code changes")
    
    # Create FastAPI app
    app = FastAPI(
        title="Seestar API",
        description="API for controlling Seestar devices",
        version="1.0.0",
    )
    
    # Create the controller
    controller = Controller(app, service_port=server_port, discover=not no_discovery, reload=reload)
    
    # Store controller in app state for access from endpoints
    app.state.controller = controller
    
    # Configure network simulation if requested
    if network_sim or network_sim_delay or network_sim_packet_loss or network_sim_bandwidth:
        from middleware.network_simulation import (
            get_simulation_state,
            enable_simulation,
            NetworkSimulationConfig,
        )
        from api.routers.network_simulation import SIMULATION_PRESETS
        
        # Start with preset if specified
        if network_sim:
            if network_sim in SIMULATION_PRESETS:
                config = SIMULATION_PRESETS[network_sim]
                click.echo(f"🌐 Network simulation enabled: {network_sim}")
                click.echo(f"   - Base delay: {config.base_delay_ms}ms")
                click.echo(f"   - Packet loss: {config.packet_loss_rate*100:.1f}%")
                if config.bandwidth_limit_kbps:
                    click.echo(f"   - Bandwidth limit: {config.bandwidth_limit_kbps} KB/s")
            else:
                config = NetworkSimulationConfig()
        else:
            config = NetworkSimulationConfig()
        
        # Override with custom values if provided
        if network_sim_delay is not None:
            config.base_delay_ms = network_sim_delay
            click.echo(f"   - Custom delay: {network_sim_delay}ms")
        if network_sim_packet_loss is not None:
            config.packet_loss_rate = network_sim_packet_loss
            click.echo(f"   - Custom packet loss: {network_sim_packet_loss*100:.1f}%")
        if network_sim_bandwidth is not None:
            config.bandwidth_limit_kbps = network_sim_bandwidth
            click.echo(f"   - Custom bandwidth: {network_sim_bandwidth} KB/s")
        
        # Enable simulation
        state = get_simulation_state()
        enable_simulation(config)
    
    # Add star map endpoint (example of additional endpoint)
    @app.get("/api/starmap")
    async def get_star_map(ra: float, dec: float, width: int = 800, height: int = 600):
        """Generate a star map for the specified coordinates."""
        return await skymap.generate_star_map(ra, dec, width, height)
    
    # Handle manual telescope configuration
    if seestar_host:
        click.echo(f"Manual telescope configuration: {seestar_host}:{seestar_port}")
        asyncio.run(
            controller.add_telescope(
                host=seestar_host,
                port=seestar_port,
                discover=False,
            )
        )
    
    # Add remote controllers
    if remote_controller:
        for rc in remote_controller:
            try:
                host, port = rc.split(":")
                port = int(port)
                click.echo(f"Adding remote controller: {host}:{port}")
                # Note: We'd need to run this async, but for now just log it
            except ValueError:
                click.echo(f"Invalid remote controller format: {rc} (expected host:port)")
    
    # Define the async server runner
    async def run_server():
        """Run the server with the controller."""
        # Set up signal handlers
        def signal_handler(sig, frame):
            click.echo("\nShutting down gracefully...")
            asyncio.create_task(controller.disconnect_all_telescopes())
            raise KeyboardInterrupt
        
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
        
        # Run the controller
        await controller.runner()
        
        # Configure and start Uvicorn
        config = uvicorn.Config(
            app,
            host="0.0.0.0",
            port=server_port,
            reload=reload,
            log_level="info" if not reload else "debug",
        )
        server = uvicorn.Server(config)
        await server.serve()
    
    # Run the server
    try:
        asyncio.run(run_server())
    except KeyboardInterrupt:
        click.echo("\nServer stopped by user")
    except Exception as e:
        click.echo(f"\nServer error: {e}", err=True)
        raise


@main.command("test")
@click.option("--host", default="seestar.local", help="IP address of the Seestar device")
@click.option("--port", default=4700, help="Port of the Seestar device")
@click.option("--action", type=click.Choice(["goto", "park", "focus", "status"]), help="Action to perform")
@click.option("--target-name", help="Name of the target for goto action")
@click.option("--ra", type=float, help="Right ascension for goto (hours)")
@click.option("--dec", type=float, help="Declination for goto (degrees)")
@click.option("--ra-str", help="Right ascension string (HH:MM:SS)")
@click.option("--dec-str", help="Declination string (DD:MM:SS)")
@click.option("--start-imaging", is_flag=True, help="Start imaging after goto")
@click.option("--exposure", type=int, default=10, help="Exposure time in seconds")
@click.option("--gain", type=int, default=80, help="Gain value")
@click.option("--count", type=int, default=1, help="Number of exposures")
def test_command(
    host, port, action, target_name, ra, dec, ra_str, dec_str, start_imaging, exposure, gain, count
):
    """Test various telescope commands."""
    from smarttel.seestar.client import SeestarClient, EventBus
    from smarttel.seestar.commands.simple import GetViewState, Park
    from smarttel.seestar.commands.parameterized import GotoTarget, GotoTargetParameters
    from smarttel.seestar.commands.imaging import StartImaging, StopImaging
    
    async def run_test():
        """Run the test command."""
        event_bus = EventBus()
        client = SeestarClient(host, port, event_bus)
        
        try:
            # Connect to telescope
            click.echo(f"Connecting to {host}:{port}...")
            await client.connect()
            click.echo("Connected!")
            
            # Perform the requested action
            if action == "status":
                click.echo("Getting telescope status...")
                response = await client.send_and_recv(GetViewState())
                click.echo(f"Status: {response}")
                
            elif action == "park":
                click.echo("Parking telescope...")
                response = await client.send_and_recv(Park())
                click.echo(f"Park response: {response}")
                
            elif action == "goto":
                # Parse coordinates if needed
                if ra_str:
                    parts = ra_str.split(":")
                    ra = float(parts[0]) + float(parts[1]) / 60 + float(parts[2]) / 3600
                if dec_str:
                    parts = dec_str.split(":")
                    dec = float(parts[0])
                    if dec >= 0:
                        dec += float(parts[1]) / 60 + float(parts[2]) / 3600
                    else:
                        dec -= float(parts[1]) / 60 + float(parts[2]) / 3600
                
                if ra is None or dec is None:
                    click.echo("Error: RA and DEC are required for goto", err=True)
                    return
                
                params = GotoTargetParameters(
                    target_name=target_name or f"Target_{ra:.2f}_{dec:.2f}",
                    ra_h=ra,
                    dec_deg=dec,
                )
                
                click.echo(f"Going to {params.target_name} (RA: {ra:.4f}h, DEC: {dec:.4f}°)...")
                response = await client.send_and_recv(GotoTarget(params=params))
                click.echo(f"Goto response: {response}")
                
                if start_imaging:
                    click.echo(f"Starting imaging (exposure: {exposure}s, gain: {gain}, count: {count})...")
                    response = await client.send_and_recv(
                        StartImaging(params={"exposure": exposure, "gain": gain, "count": count})
                    )
                    click.echo(f"Imaging response: {response}")
            
            elif action == "focus":
                click.echo("Focus control not yet implemented")
            
        except Exception as e:
            click.echo(f"Error: {e}", err=True)
        finally:
            await client.disconnect()
            click.echo("Disconnected")
    
    # Run the async function
    asyncio.run(run_test())


if __name__ == "__main__":
    main()