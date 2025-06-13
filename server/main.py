import asyncio
import sys
import json
import click
import uvicorn
from contextlib import suppress
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from typing import Optional, AsyncGenerator

from smarttel.seestar.client import SeestarClient
from smarttel.seestar.commands.common import CommandResponse
from smarttel.seestar.commands.discovery import select_device_and_connect
from smarttel.seestar.commands.simple import GetViewState


async def runner(host: str, port: int):
    client = SeestarClient(host, port, debug=True)

    await client.connect()

    msg: CommandResponse[dict] = await client.send_and_recv(GetViewState())
    print(f'Received GetViewState: {msg}')
    #while True:
    #    #msg: CommandResponse[GetTimeResponse] = await client.send_and_recv(GetTime())
    #    #print(f'---> Received: {msg}')
    #    print('')
    #    #await asyncio.sleep(5)

    while client.is_connected:
        msg = await client.recv()
        if msg is not None:
            print(f'----> Received: {msg}')
        with suppress(IndexError):
            event = client.recent_events.popleft()
            print(f'----> Event: {event}')
        await asyncio.sleep(0.1)

    #msg: CommandResponse[dict] = await client.send_and_recv(GetWheelPosition())
    #print(f'Received: {msg}')

    await client.disconnect()
    await asyncio.sleep(1)


def create_api_app(seestar_host: str, seestar_port: int):
    """Create a FastAPI app for Seestar control."""
    app = FastAPI(title="Seestar API", description="API for controlling Seestar devices")
    
    # Create a shared client instance
    client = SeestarClient(seestar_host, seestar_port, debug=True)
    
    @app.on_event("startup")
    async def startup():
        """Connect to the Seestar on startup."""
        try:
            await client.connect()
            print(f"Connected to Seestar at {seestar_host}:{seestar_port}")
        except Exception as e:
            print(f"Failed to connect to Seestar: {e}")
    
    @app.on_event("shutdown")
    async def shutdown():
        """Disconnect from the Seestar on shutdown."""
        await client.disconnect()
        print("Disconnected from Seestar")
    
    @app.get("/")
    async def root():
        """Root endpoint with basic info."""
        return {
            "status": "running",
            "seestar": {
                "host": seestar_host,
                "port": seestar_port,
                "connected": client.is_connected
            }
        }
    
    @app.get("/viewstate")
    async def get_view_state():
        """Get the current view state."""
        if not client.is_connected:
            raise HTTPException(status_code=503, detail="Not connected to Seestar")
        
        try:
            response = await client.send_and_recv(GetViewState())
            return {"view_state": response}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error: {str(e)}")
    
    async def status_stream_generator() -> AsyncGenerator[str, None]:
        """Generate a stream of client status updates."""
        try:
            while True:
                # Create a status object with current client information
                status = {
                    "timestamp": asyncio.get_event_loop().time(),
                    "connected": client.is_connected,
                    "host": seestar_host,
                    "port": seestar_port,
                    "status": client.status.model_dump()
                }
                
                # If connected, add recent events and messages
                # if client.is_connected:
                #     status["recent_events"] = [str(event) for event in list(client.recent_events)]
                #
                #     # Try to get current view state
                #     try:
                #         view_state = await client.send_and_recv(GetViewState())
                #         status["view_state"] = str(view_state)
                #     except Exception as e:
                #         status["view_state_error"] = str(e)
                
                # Send the status as a Server-Sent Event
                yield f"data: {json.dumps(status)}\n\n"
                
                # Wait for 5 seconds before sending next update
                await asyncio.sleep(5)
        except asyncio.CancelledError:
            # Handle client disconnection gracefully
            yield f"data: {json.dumps({'status': 'stream_closed'})}\n\n"
    
    @app.get("/status/stream")
    async def stream_status():
        """Stream client status updates every 5 seconds."""
        return StreamingResponse(
            status_stream_generator(),
            media_type="text/event-stream"
        )
    
    return app


@click.group()
def main():
    """Seestar commands."""
    pass


@main.command("console")
@click.option("--host", help="Seestar host address")
@click.option("--port", type=int, default=4700, help="Seestar port (default: 4700)")
def console(host, port):
    """Connect to a Seestar device, with optional device discovery."""
    asyncio.run(select_device_and_connect(host, port))


@main.command("server")
@click.option("--server-port", type=int, default=8000, help="Port for the API server (default: 8000)")
@click.option("--seestar-host", required=True, help="Seestar device host address")
@click.option("--seestar-port", type=int, default=4700, help="Seestar device port (default: 4700)")
def server(server_port, seestar_host, seestar_port):
    """Start a FastAPI server for controlling a Seestar device."""
    print(f"Starting Seestar API server on port {server_port}")
    print(f"Connecting to Seestar at {seestar_host}:{seestar_port}")
    
    app = create_api_app(seestar_host, seestar_port)
    uvicorn.run(app, host="0.0.0.0", port=server_port)


if __name__ == "__main__":
    main()