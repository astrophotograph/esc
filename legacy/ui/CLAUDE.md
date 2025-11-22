# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

Frontend (Next.js):
- `npm install --legacy-peer-deps` - Install dependencies (first time only)
- `npm run dev` - Start development server on port 3000
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

Backend (Python):
- `cd ../server && uv run main.py server` - Start FastAPI server on port 8000 with auto-discovery
- `cd ../server && uv run main.py console` - Launch interactive CLI with device discovery
- `cd ../server && uv sync` - Install/update Python dependencies

## Architecture Overview

This is a **telescope control application** with a **Next.js frontend** and **Python backend** for controlling Seestar telescopes. The two systems work together:

### Frontend Architecture (Next.js/React)

**Core State Management:**
- `TelescopeContext.tsx` - Central React context managing all application state including:
  - Multi-telescope management with `TelescopeInfo[]` and `currentTelescope`
  - Camera controls (exposure, gain, brightness, contrast, focus)
  - Observation logging and session management
  - Equipment management with detailed tracking
  - Picture-in-Picture overlays and annotations
  - Planning panels and notification systems

**Component Organization:**
- `components/telescope/` - Main telescope control components organized by feature:
  - `Header.tsx`, `StatusAlerts.tsx`, `CameraView.tsx` - Core UI
  - `modals/` - Modal dialogs for settings and configuration
  - `panels/` - Tabbed panels for different control aspects
- `components/ui/` - Shadcn/ui component library (Radix UI + Tailwind)
- `telescope-control.tsx` - Main page component orchestrating the entire interface

**Data Flow:**
- Frontend polls backend at `http://localhost:8000/api/telescopes` for telescope discovery
- Server-Sent Events stream at `/api/status/stream` provides real-time status updates
- Context providers manage state and handle telescope selection/switching
- Persistent state using localStorage hooks (`use-persistent-state.ts`)

### Backend Architecture (Python/FastAPI)

**Core Components** (from existing server CLAUDE.md):
- `SeestarClient` - Central orchestrator managing TCP connections and event processing
- `SeestarConnection` - Low-level TCP handling with newline-delimited JSON
- Command system with strongly-typed Pydantic models
- 25+ event types using discriminated unions for real-time telescope state
- Dual interface: CLI (Textual TUI) and HTTP API (FastAPI)

**Integration Points:**
- FastAPI server exposes RESTful endpoints for telescope management
- Server-Sent Events streaming provides real-time status to frontend
- UDP broadcast discovery automatically detects Seestar devices on network

### Key Development Patterns

**Frontend:**
- Extensive TypeScript typing with complex interfaces in `types/telescope-types.ts`
- Context-driven state management with comprehensive telescope control state
- Real-time UI updates via SSE integration
- Equipment management with maintenance tracking and compatibility checking
- Responsive design with collapsible panels and Picture-in-Picture overlays

**Backend:**
- Async-first architecture with asyncio throughout
- Type-safe command/response pattern with auto-incrementing IDs
- Event-driven real-time telescope state updates
- Clean separation between protocol handling, commands, and UI layers

## Data Models

Critical TypeScript interfaces in `types/telescope-types.ts`:
- `TelescopeInfo` - Multi-telescope support with status tracking
- `CelestialObject`, `ObservationLogEntry`, `Session` - Observation data
- `Equipment`, `MaintenanceRecord`, `EquipmentSet` - Equipment management
- `AnnotationSettings`, `PipOverlaySettings` - UI customization

## Communication Flow

1. Frontend discovers telescopes via `/api/telescopes` endpoint
2. User selects telescope, frontend updates `currentTelescope` in context
3. Real-time status updates flow via SSE from `/api/status/stream`
4. Frontend state management handles telescope switching and control panels
5. Backend maintains persistent connections to selected telescopes

## Testing and Development

Always test with both frontend and backend running simultaneously:
1. Start Python server: `cd ../server && uv run main.py server`
2. Start Next.js dev server: `npm run dev`
3. Access at `http://localhost:3000` with auto-discovery of Seestar devices