"""Web API server for the Vite web frontend.

Exposes Tauri-like command endpoints at /api/{command} so the web
frontend can run without the desktop backend.
"""

from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime
from dataclasses import dataclass, field
from typing import Any, Optional

from fastapi import Body, FastAPI, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse

from .catalog.catalog_service import (
    catalog_get_object_types,
    catalog_get_solar_system,
    catalog_quick_search,
    catalog_search,
)
from .imaging.astrometry_client import solve_image_base64, solve_image_sync
from .imaging.imaging_service import (
    cleanup_image,
    enhance_image,
    get_enhancement_methods,
    get_stretch_modes,
    process_fits,
)
from .planning.planning_service import (
    create_session,
    get_target_visibility,
    get_tonight_targets,
    update_session,
)
from .telescope.discovery import discover_telescopes
from .telescope.seestar_bridge import SeestarBridge


@dataclass
class TelescopeEntry:
    id: str
    host: str
    port: int
    name: str
    bridge: Optional[SeestarBridge] = None
    connected: bool = False
    op_lock: asyncio.Lock = field(default_factory=asyncio.Lock)


app = FastAPI()

_telescopes: dict[str, TelescopeEntry] = {}
_telescopes_lock = asyncio.Lock()
_sessions: dict[str, dict[str, Any]] = {}
_sessions_lock = asyncio.Lock()


def _parse_host_port(value: str) -> tuple[str, int]:
    if ":" in value:
        host, port_str = value.rsplit(":", 1)
        try:
            port = int(port_str)
        except ValueError:
            return value, 4700
        return host, port
    return value, 4700


def _looks_like_host(value: str) -> bool:
    # crude heuristic: contains dot (IP/hostname) or colon port.
    return "." in value or ":" in value


async def _get_or_create_entry(
    telescope_id: str,
    host: Optional[str] = None,
    port: Optional[int] = None,
    name: Optional[str] = None,
) -> TelescopeEntry:
    async with _telescopes_lock:
        entry = _telescopes.get(telescope_id)
        if entry is not None:
            return entry

        if host is None and telescope_id:
            if not _looks_like_host(telescope_id):
                raise HTTPException(
                    status_code=400,
                    detail="Unknown telescope id. Run discovery first.",
                )
            host, parsed_port = _parse_host_port(telescope_id)
            port = port or parsed_port

        if not host:
            raise HTTPException(status_code=400, detail="Missing telescope host")

        entry = TelescopeEntry(
            id=telescope_id,
            host=host,
            port=port or 4700,
            name=name or telescope_id or f"{host}:{port or 4700}",
        )
        _telescopes[telescope_id] = entry
        return entry


async def _get_bridge(entry: TelescopeEntry) -> SeestarBridge:
    if entry.bridge is None:
        entry.bridge = SeestarBridge(entry.host, entry.port)
    return entry.bridge


async def _get_connected_bridge(
    entry: TelescopeEntry,
) -> tuple[SeestarBridge, Optional[dict[str, Any]]]:
    async with entry.op_lock:
        bridge = await _get_bridge(entry)
        if bridge.client is None:
            result = await bridge.connect()
            entry.connected = bool(result.get("success"))
            if not entry.connected:
                return bridge, result
        return bridge, None


def _json_string_response(payload: Any) -> JSONResponse:
    return JSONResponse(content=json.dumps(payload))


def _extract_telescope_id(payload: dict[str, Any]) -> Optional[str]:
    return payload.get("telescopeId") or payload.get("telescope_id") or payload.get("id")


def _pick_default_telescope_id() -> Optional[str]:
    # Prefer a connected telescope if available.
    for entry in _telescopes.values():
        if entry.connected:
            return entry.id
    # Fall back to any known telescope.
    for entry in _telescopes.values():
        return entry.id
    return None


@app.post("/api/{command}")
async def handle_command(command: str, payload: dict[str, Any] = Body(default_factory=dict)):
    if command == "discover_telescopes":
        timeout = float(payload.get("timeout", 3.0))
        telescopes = await discover_telescopes(timeout=timeout)
        # Cache discovered telescopes so connect uses the right host/port.
        async with _telescopes_lock:
            for t in telescopes:
                telescope_id = t.get("serial_number") or f"{t.get('host')}:{t.get('port', 4700)}"
                if not telescope_id or not t.get("host"):
                    continue
                entry = TelescopeEntry(
                    id=telescope_id,
                    host=t.get("host"),
                    port=t.get("port", 4700),
                    name=t.get("name") or f"Seestar {t.get('serial_number') or t.get('host')}",
                )
                _telescopes[telescope_id] = entry
        return telescopes

    if command == "add_telescope":
        config = payload.get("config") or {}
        telescope_id = config.get("id") or f"{config.get('host')}:{config.get('port', 4700)}"
        entry = await _get_or_create_entry(
            telescope_id=telescope_id,
            host=config.get("host"),
            port=config.get("port", 4700),
            name=config.get("name"),
        )
        async with _telescopes_lock:
            _telescopes[entry.id] = entry
        return {"success": True, "id": entry.id}

    if command == "remove_telescope":
        telescope_id = _extract_telescope_id(payload)
        if not telescope_id:
            raise HTTPException(status_code=400, detail="Missing telescopeId")
        async with _telescopes_lock:
            _telescopes.pop(telescope_id, None)
        return {"success": True}

    if command == "connect_telescope":
        telescope_id = _extract_telescope_id(payload)
        if not telescope_id:
            raise HTTPException(status_code=400, detail="Missing telescopeId")
        entry = await _get_or_create_entry(telescope_id=telescope_id)
        bridge, connect_result = await _get_connected_bridge(entry)
        if connect_result:
            return connect_result
        return {"success": True, "message": "Connected"}

    if command == "disconnect_telescope":
        telescope_id = _extract_telescope_id(payload)
        if not telescope_id:
            raise HTTPException(status_code=400, detail="Missing telescopeId")
        entry = await _get_or_create_entry(telescope_id=telescope_id)
        if entry.bridge is None:
            entry.connected = False
            return {"success": True, "message": "Already disconnected"}
        result = await entry.bridge.disconnect()
        entry.connected = False
        return result

    if command == "get_telescope_status":
        telescope_id = _extract_telescope_id(payload) or _pick_default_telescope_id()
        if not telescope_id:
            return {"connected": False}
        entry = await _get_or_create_entry(telescope_id=telescope_id)
        if entry.bridge is None or not entry.connected:
            bridge, connect_result = await _get_connected_bridge(entry)
            if connect_result:
                return {"connected": False}
        else:
            bridge = entry.bridge

        result = await bridge.get_status()
        if not result.get("success"):
            # Retry once after reconnect for flaky links.
            bridge, connect_result = await _get_connected_bridge(entry)
            if connect_result:
                return {"connected": False}
            result = await bridge.get_status()
            if not result.get("success"):
                return {"connected": False}
        state = result.get("state") or {}
        return {
            "connected": True,
            # Menu bar fields (camelCase)
            "batteryPercent": state.get("battery"),
            "temperatureC": state.get("cur_temp"),
            "humidityPercent": state.get("cur_hum"),
            "gain": state.get("gain"),
            "gainMode": state.get("gain_mode"),
            "dewHeaterPower": state.get("dew_heater_power"),
            "isGoto": state.get("is_goto"),
            "isTracking": state.get("is_tracking"),
            "mountType": state.get("mount_type"),
            "viewState": state.get("view"),
            # Status overlay fields (snake_case)
            "battery_capacity": state.get("battery_capacity") or state.get("battery"),
            "charger_status": state.get("charger_status"),
            "temp": state.get("temp") or state.get("cur_temp"),
            "balance_sensor": state.get("balance_sensor"),
            # Shared fields
            "ra": state.get("ra"),
            "dec": state.get("dec"),
        }

    if command == "goto_target":
        telescope_id = _extract_telescope_id(payload)
        params = payload.get("params") or {}
        entry = await _get_or_create_entry(telescope_id=telescope_id or "")
        bridge, connect_result = await _get_connected_bridge(entry)
        if connect_result:
            return connect_result
        return await bridge.goto_target(params)

    if command == "park_telescope":
        telescope_id = _extract_telescope_id(payload)
        entry = await _get_or_create_entry(telescope_id=telescope_id or "")
        bridge, connect_result = await _get_connected_bridge(entry)
        if connect_result:
            return connect_result
        return await bridge.park()

    if command == "telescope_move":
        telescope_id = _extract_telescope_id(payload)
        params = payload.get("params") or {}
        if "direction" in payload and "direction" not in params:
            params["direction"] = payload["direction"]
        entry = await _get_or_create_entry(telescope_id=telescope_id or "")
        bridge, connect_result = await _get_connected_bridge(entry)
        if connect_result:
            return connect_result
        return await bridge.move(params)

    if command == "telescope_stop_move":
        telescope_id = _extract_telescope_id(payload)
        entry = await _get_or_create_entry(telescope_id=telescope_id or "")
        bridge, connect_result = await _get_connected_bridge(entry)
        if connect_result:
            return connect_result
        return await bridge.stop_move()

    if command in ("telescope_focus", "set_focus"):
        telescope_id = _extract_telescope_id(payload)
        params = payload.get("params") or {}
        if "position" in payload and "position" not in params:
            params["position"] = payload["position"]
        entry = await _get_or_create_entry(telescope_id=telescope_id or "")
        bridge, connect_result = await _get_connected_bridge(entry)
        if connect_result:
            return connect_result
        return await bridge.focus(params)

    if command == "telescope_focus_increment":
        telescope_id = _extract_telescope_id(payload)
        params = payload.get("params") or {}
        if "steps" in payload and "increment" not in params:
            params["increment"] = payload["steps"]
        entry = await _get_or_create_entry(telescope_id=telescope_id or "")
        bridge, connect_result = await _get_connected_bridge(entry)
        if connect_result:
            return connect_result
        return await bridge.focus_increment(params)

    if command == "telescope_auto_focus":
        telescope_id = _extract_telescope_id(payload)
        entry = await _get_or_create_entry(telescope_id=telescope_id or "")
        bridge, connect_result = await _get_connected_bridge(entry)
        if connect_result:
            return connect_result
        return await bridge.auto_focus()

    if command == "telescope_get_focuser_position":
        telescope_id = _extract_telescope_id(payload)
        entry = await _get_or_create_entry(telescope_id=telescope_id or "")
        bridge, connect_result = await _get_connected_bridge(entry)
        if connect_result:
            return connect_result
        result = await bridge.get_focuser_position()
        if not result.get("success"):
            return result
        return {"position": result.get("position")}

    if command == "telescope_set_gain":
        telescope_id = _extract_telescope_id(payload)
        params = {"gain": payload.get("gain")}
        entry = await _get_or_create_entry(telescope_id=telescope_id or "")
        bridge, connect_result = await _get_connected_bridge(entry)
        if connect_result:
            return connect_result
        return await bridge.set_gain(params)

    if command == "telescope_set_exposure":
        telescope_id = _extract_telescope_id(payload)
        params = {"exposure_ms": payload.get("exposureMs") or payload.get("exposure_ms")}
        entry = await _get_or_create_entry(telescope_id=telescope_id or "")
        bridge, connect_result = await _get_connected_bridge(entry)
        if connect_result:
            return connect_result
        return await bridge.set_exposure(params)

    if command == "telescope_stop_goto":
        telescope_id = _extract_telescope_id(payload)
        entry = await _get_or_create_entry(telescope_id=telescope_id or "")
        bridge, connect_result = await _get_connected_bridge(entry)
        if connect_result:
            return connect_result
        return await bridge.stop_goto()

    if command == "imaging_start":
        telescope_id = _extract_telescope_id(payload)
        params = {
            "exposure_ms": payload.get("exposureMs"),
            "gain": payload.get("gain"),
            "target_name": payload.get("targetName"),
        }
        entry = await _get_or_create_entry(telescope_id=telescope_id or "")
        bridge, connect_result = await _get_connected_bridge(entry)
        if connect_result:
            return connect_result
        return await bridge.start_imaging(params)

    if command == "imaging_stop":
        telescope_id = _extract_telescope_id(payload)
        entry = await _get_or_create_entry(telescope_id=telescope_id or "")
        bridge, connect_result = await _get_connected_bridge(entry)
        if connect_result:
            return connect_result
        return await bridge.stop_imaging()

    if command == "imaging_process_fits":
        params = payload.get("params") or {}
        result = await asyncio.to_thread(process_fits, **params)
        return _json_string_response(result)

    if command == "imaging_enhance":
        params = payload.get("params") or {}
        result = await asyncio.to_thread(enhance_image, **params)
        return _json_string_response(result)

    if command == "imaging_get_stretch_modes":
        result = await asyncio.to_thread(get_stretch_modes)
        return _json_string_response(result)

    if command == "imaging_get_enhancement_methods":
        result = await asyncio.to_thread(get_enhancement_methods)
        return _json_string_response(result)

    if command == "imaging_cleanup":
        image_id = payload.get("imageId") or payload.get("image_id")
        if not image_id:
            raise HTTPException(status_code=400, detail="Missing imageId")
        result = await asyncio.to_thread(cleanup_image, image_id)
        return result

    if command == "imaging_plate_solve":
        params = payload.get("params") or {}
        use_base64 = bool(params.get("image_base64"))
        if use_base64:
            result = await asyncio.to_thread(solve_image_base64, **params)
        else:
            result = await asyncio.to_thread(solve_image_sync, **params)
        return _json_string_response(result)

    if command == "catalog_search":
        params = payload.get("params") or {}
        result = await asyncio.to_thread(catalog_search, **params)
        return _json_string_response(result)

    if command == "catalog_quick_search":
        query = payload.get("query")
        limit = payload.get("limit", 20)
        if not query:
            return _json_string_response({"suggestions": []})
        result = await asyncio.to_thread(catalog_quick_search, query, limit)
        suggestions = []
        for obj in result.get("objects", []):
            suggestions.append(
                {
                    "id": obj.get("id"),
                    "name": obj.get("name"),
                    "object_type": obj.get("object_type"),
                    "magnitude": obj.get("magnitude"),
                }
            )
        return _json_string_response({"suggestions": suggestions})

    if command == "catalog_get_object_types":
        result = await asyncio.to_thread(catalog_get_object_types)
        types = [
            {"id": name, "name": name, "count": count}
            for name, count in result.items()
        ]
        return _json_string_response({"types": types})

    if command == "catalog_get_solar_system":
        latitude = payload.get("latitude")
        longitude = payload.get("longitude")
        result = await asyncio.to_thread(
            catalog_get_solar_system, latitude=latitude, longitude=longitude
        )
        return _json_string_response({"objects": result})

    if command == "planning_get_visibility":
        target = payload.get("target") or {}
        location = payload.get("location") or {}
        result = await asyncio.to_thread(
            get_target_visibility,
            target.get("name"),
            target.get("ra"),
            target.get("dec"),
            location.get("latitude"),
            location.get("longitude"),
            location.get("elevation", 0),
            payload.get("date"),
            payload.get("minAltitude") or payload.get("min_altitude"),
        )
        return _json_string_response(result)

    if command == "planning_get_tonight_targets":
        location = payload.get("location") or {}
        limit = payload.get("limit", 20)
        min_altitude = payload.get("minAltitude") or payload.get("min_altitude", 30.0)
        catalog_result = await asyncio.to_thread(
            catalog_search,
            max_magnitude=8.0,
            above_horizon_only=False,
            limit=500,
        )
        result = await asyncio.to_thread(
            get_tonight_targets,
            catalog_result.get("objects", []),
            location.get("latitude"),
            location.get("longitude"),
            location.get("elevation", 0),
            limit,
            min_altitude,
        )
        return _json_string_response(result)

    if command == "planning_create_session":
        params = payload.get("params") or {}
        session = await asyncio.to_thread(
            create_session,
            params.get("name"),
            params.get("telescope_id"),
            params.get("location_lat"),
            params.get("location_lon"),
            params.get("notes"),
        )
        async with _sessions_lock:
            _sessions[session["id"]] = session
        return _json_string_response(session)

    if command == "planning_get_sessions":
        async with _sessions_lock:
            sessions = list(_sessions.values())
        return _json_string_response(sessions)

    if command == "planning_end_session":
        session_id = payload.get("sessionId") or payload.get("session_id")
        if not session_id:
            raise HTTPException(status_code=400, detail="Missing sessionId")
        notes = payload.get("notes")
        ended_at = datetime.utcnow().isoformat()
        update = await asyncio.to_thread(update_session, session_id, ended_at, notes)
        async with _sessions_lock:
            session = _sessions.get(session_id)
            if session is None:
                raise HTTPException(status_code=404, detail="Session not found")
            session.update(update)
        return _json_string_response(session)

    if command == "planning_delete_session":
        session_id = payload.get("sessionId") or payload.get("session_id")
        if not session_id:
            raise HTTPException(status_code=400, detail="Missing sessionId")
        async with _sessions_lock:
            _sessions.pop(session_id, None)
        return {"success": True}

    raise HTTPException(status_code=404, detail=f"Unknown command: {command}")


@app.get("/api/stream/{telescope_id}")
async def stream_video(telescope_id: str):
    # For stream requests, don't treat unknown serial IDs as bad requests.
    if not _looks_like_host(telescope_id) and telescope_id not in _telescopes:
        raise HTTPException(status_code=404, detail="Unknown telescope id")

    entry = await _get_or_create_entry(telescope_id=telescope_id)
    bridge, connect_result = await _get_connected_bridge(entry)
    if connect_result:
        raise HTTPException(status_code=503, detail=connect_result.get("error", "Not connected"))

    async def generate():
        boundary = b"--frame\r\n"
        while True:
            frame = await bridge.get_next_frame(camera_id=0)
            if not frame:
                await asyncio.sleep(0.1)
                continue
            yield boundary
            yield b"Content-Type: image/jpeg\r\n\r\n"
            yield frame
            yield b"\r\n"

    return StreamingResponse(
        generate(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-store"},
    )


if __name__ == "__main__":
    import uvicorn

    host = os.environ.get("WEB_API_HOST", "0.0.0.0")
    port = int(os.environ.get("WEB_API_PORT", "8000"))
    uvicorn.run("python.web_api:app", host=host, port=port, reload=False)
