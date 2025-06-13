# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

This project uses `uv` as the package manager. Common commands:

- `uv run python main.py console` - Launch interactive CLI with device discovery
- `uv run python main.py console --host <ip>` - Connect directly to a Seestar device
- `uv run python main.py server --seestar-host <ip>` - Start FastAPI server on port 8000
- `uv run python main.py server --seestar-host <ip> --server-port <port>` - Start server on custom port
- `uv add <package>` - Add new dependencies
- `uv sync` - Install/update dependencies

## Architecture Overview

### Core Components

**SeestarClient** (`smarttel/seestar/client.py`) - Central orchestrator that manages:
- TCP connection to telescope via `SeestarConnection`
- Command/response lifecycle with auto-incrementing IDs
- Real-time event stream processing and parsing
- Status aggregation from multiple event types
- Deque-based recent events buffer

**Connection Layer** (`smarttel/seestar/connection.py`) - Low-level TCP handling:
- Async StreamReader/StreamWriter for newline-delimited JSON
- Connection lifecycle management
- Message counting for debugging

**Command System** (`smarttel/seestar/commands/`) - Structured telescope control:
- `common.py` - Base classes with Generic type support
- `simple.py` - Parameter-less commands (GetTime, GetViewState, etc.)
- `parameterized.py` - Commands requiring parameters
- `discovery.py` - UDP broadcast discovery with TUI device picker
- `imaging.py` - Imaging and exposure commands
- `settings.py` - Device configuration commands

**Event System** (`smarttel/seestar/events/__init__.py`) - Comprehensive event handling:
- 25+ strongly-typed event classes using Pydantic discriminated unions
- Events cover all telescope operations: goto, tracking, focusing, imaging, etc.
- Real-time status updates via `PiStatusEvent` for battery/temperature
- Frame stacking progress via `BatchStackEvent` and `StackErrorEvent`

### Dual Interface Architecture

**CLI Interface** (`cli/ui.py`) - Textual-based TUI:
- Device discovery screen with selectable table
- Real-time status monitoring
- Integrated with `CombinedSeestarUI` class

**HTTP API Interface** (`main.py`) - FastAPI server:
- RESTful endpoints (`/viewstate`, etc.)
- Server-Sent Events streaming at `/status/stream`
- Shared client instance across requests

### Key Patterns

- **Async-first**: All I/O operations use asyncio
- **Type Safety**: Extensive use of Pydantic models with Generic types and discriminated unions
- **Event-driven**: Real-time telescope state via parsed event stream
- **Command-response**: JSON-RPC-like protocol with ID correlation
- **Discovery**: UDP broadcast for automatic device detection

### Data Flow

1. Commands sent as JSON over TCP to telescope
2. Responses and events received as newline-delimited JSON
3. Events parsed into typed objects and stored in client state
4. Status aggregated from multiple event types into `SeestarStatus`
5. UI layers consume client state for real-time updates

The architecture cleanly separates protocol handling, command abstractions, event processing, and user interfaces while maintaining type safety throughout the stack.