# Telescope Control UI

A modern web interface for controlling Seestar telescopes, built with Next.js and React.

## Overview

This is the frontend application for the telescope control system. It provides a comprehensive interface for:

- **Multi-telescope management** - Control multiple Seestar devices simultaneously
- **Real-time camera control** - Live view with exposure, gain, brightness, and contrast adjustments
- **Observation logging** - Track celestial objects, sessions, and viewing conditions
- **Equipment management** - Organize telescopes, eyepieces, filters, and maintenance records
- **Picture-in-Picture overlays** - Floating annotations and controls
- **Planning tools** - Session planning with weather and astronomical data

## Prerequisites

- Node.js 18.x or higher
- pnpm (recommended) or npm
- The Python backend server running on port 8000 (see `../server/README.md`)

## Installation

```bash
# Install pnpm if you haven't already
npm install -g pnpm

# Install dependencies
pnpm install
```

Note: If you encounter peer dependency issues with React 19, you can use:
```bash
pnpm install --config.strict-peer-dependencies=false
```

## Development

```bash
# Start the development server on http://localhost:3000
pnpm run dev

# The backend server must also be running:
cd ../server && uv run main.py server
```

The application will automatically discover Seestar devices on your network through the backend API.

## Building for Production

```bash
# Create production build
pnpm run build

# Start production server
pnpm run start
```

## Testing

```bash
# Run tests
pnpm test

# Run tests in watch mode
pnpm run test:watch

# Generate coverage report
pnpm run test:coverage
```

## Linting

```bash
# Run ESLint
pnpm run lint
```

## Architecture

### Technology Stack

- **Framework**: Next.js 15.3 with App Router
- **UI Components**: Shadcn/ui (Radix UI + Tailwind CSS)
- **State Management**: React Context API
- **Styling**: Tailwind CSS
- **Testing**: Jest + React Testing Library
- **Type Safety**: TypeScript

### Key Components

#### Core State Management
- `components/telescope/TelescopeContext.tsx` - Central context managing all application state
- `hooks/use-persistent-state.ts` - LocalStorage persistence for user preferences

#### UI Structure
```
components/
├── telescope/          # Main telescope control components
│   ├── Header.tsx     # Application header with telescope selector
│   ├── CameraView.tsx # Live camera feed with controls
│   ├── modals/        # Settings, equipment, and configuration dialogs
│   └── panels/        # Tabbed control panels (camera, focus, etc.)
└── ui/                # Shadcn/ui component library
```

#### Data Flow
1. Frontend polls `/api/telescopes` for device discovery
2. Server-Sent Events at `/api/status/stream` provide real-time updates
3. React Context manages state and telescope switching
4. LocalStorage persists user preferences and session data

### API Integration

The UI communicates with the Python backend via:

- **REST API**: Device discovery and control commands
- **Server-Sent Events**: Real-time status updates
- **Base URL**: `http://localhost:8000`

Key endpoints:
- `GET /api/telescopes` - List available telescopes
- `GET /api/status/stream` - SSE stream for status updates
- `POST /api/telescope/{id}/command` - Send control commands

### Type Definitions

See `types/telescope-types.ts` for comprehensive TypeScript interfaces including:
- `TelescopeInfo` - Device information and status
- `CelestialObject` - Astronomical targets
- `ObservationLogEntry` - Viewing session records
- `Equipment` - Telescope accessories and maintenance

## Environment Variables

Create a `.env.local` file for configuration:

```bash
# API endpoint (optional, defaults to http://localhost:8000)
NEXT_PUBLIC_API_URL=http://localhost:8000

# Other configuration as needed
```

## Project Structure

```
ui/
├── app/                    # Next.js app directory
│   ├── api/               # API routes (if needed)
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── telescope-control/ # Main application page
├── components/            # React components
├── hooks/                 # Custom React hooks
├── lib/                   # Utility functions
├── types/                 # TypeScript type definitions
├── public/                # Static assets
└── __tests__/            # Test files
```

## Development Guidelines

1. **Component Organization**: Keep components focused and use the established directory structure
2. **Type Safety**: Always define proper TypeScript types for props and state
3. **State Management**: Use the central TelescopeContext for shared state
4. **Testing**: Write tests for new components using the existing test patterns
5. **Styling**: Use Tailwind utility classes and follow the existing design system

## Troubleshooting

### Common Issues

1. **"Cannot find telescopes"**
   - Ensure the backend server is running on port 8000
   - Check that Seestar devices are on the same network
   - Verify no firewall is blocking UDP discovery

2. **"pnpm install fails"**
   - Use `pnpm install --config.strict-peer-dependencies=false` for React 19 compatibility
   - Alternatively, use npm with `npm install --legacy-peer-deps`

3. **"Port 3000 already in use"**
   - Kill the existing process or use a different port: `pnpm run dev -- -p 3001`

## Contributing

1. Follow the existing code style and patterns
2. Write tests for new features
3. Update TypeScript types as needed
4. Test with real Seestar hardware when possible

## License

See the LICENSE file in the root directory for details.