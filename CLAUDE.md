# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ALP Experimental is a telescope control application for Seestar telescopes. It consists of:
- A Next.js/React frontend (`ui/`) for the web interface
- A Python/FastAPI backend (`server/`) that handles telescope communication
- Docker support for containerized deployment

## Essential Commands

### Frontend Development (ui/ directory)
```bash
cd ui
pnpm install          # Install dependencies
pnpm run dev         # Start development server (http://localhost:3000)
pnpm run build       # Build for production
pnpm run lint        # Run ESLint
pnpm test            # Run tests
pnpm test:coverage   # Run tests with coverage
```

### Backend Development (server/ directory)
```bash
cd server
uv sync              # Install dependencies
uv run python main.py server    # Start API server (http://localhost:8000)
uv run python main.py server --reload  # Start API server with auto-reload for development
uv run python main.py console   # Start interactive CLI
uv run pytest        # Run tests
uv run ruff check .  # Run linter
uv run ruff format . # Format code
```

### Docker Development (root directory)
```bash
make dev             # Start development environment
make prod            # Start production environment
make test            # Run all tests in containers
make lint            # Run linting in containers
make down            # Stop all containers
```

## Architecture Overview

### System Architecture
```
┌─────────────┐     HTTP/SSE      ┌─────────────┐     TCP Socket    ┌────────────┐
│   Next.js   │ <───────────────> │   FastAPI   │ <──────────────> │  Seestar   │
│   Frontend  │                   │   Backend   │                   │ Telescope  │
└─────────────┘                   └─────────────┘                   └────────────┘
```

### Backend Architecture
The backend (`server/`) uses an event-driven architecture:

1. **Connection Management** (`connection_manager.py`): Maintains persistent TCP connections to telescopes
2. **Event Processing** (`services/events.py`): Processes real-time event streams from telescopes
3. **API Layer** (`api/`): FastAPI endpoints for frontend communication
4. **Models** (`models/`): Pydantic models for type-safe data handling
5. **Services** (`services/`): Business logic and telescope protocol handling

Key patterns:
- Asyncio for concurrent telescope connections
- Server-Sent Events (SSE) for real-time updates to frontend
- Type-safe communication using Pydantic models
- Clean separation between protocol handling and business logic

### Frontend Architecture
The frontend (`ui/`) is a modern Next.js 15 application:

1. **Pages** (`app/`): App router with server and client components
2. **Components** (`components/`): Reusable UI components using shadcn/ui
3. **Hooks** (`hooks/`): Custom React hooks for state management
4. **Services** (`services/`): API client and SSE event handling
5. **Types** (`types/`): TypeScript type definitions

Key patterns:
- Server Components for initial data fetching
- Client Components for interactive features
- Real-time updates via SSE
- Responsive design with Tailwind CSS

## Development Workflow

1. **Running Tests**: Always run tests before committing changes
   - Frontend: `cd ui && pnpm test`
   - Backend: `cd server && uv run pytest`

2. **Type Checking**: Ensure TypeScript/Python types are correct
   - Frontend: TypeScript checks run automatically with `pnpm run build`
   - Backend: Type hints are validated by Pydantic at runtime

3. **Code Formatting**:
   - Frontend: Uses Prettier (configured in `.prettierrc`)
   - Backend: Uses Ruff (`uv run ruff format .`)

4. **API Changes**: When modifying API endpoints:
   - Update Pydantic models in `server/models/`
   - Update TypeScript types in `ui/types/`
   - Ensure both frontend and backend remain in sync

## Key Files and Directories

- `server/connection_manager.py`: Core telescope connection logic
- `server/api/routers/telescope.py`: Main API endpoints
- `ui/app/page.tsx`: Main frontend page
- `ui/components/telescope/`: Telescope control UI components
- `docker-compose.yml`: Docker configuration
- `Makefile`: Development shortcuts