# EESC - Telescope Control Application

A modern telescope control application built with Tauri 2, React, Rust, and Python. Features observation session planning, image management (FITS support), and cloud-based image sharing.

## Features

- **Telescope Control**: Connect and control telescopes via ASCOM, INDI, or Alpaca protocols
- **Observation Planning**: Plan observation sessions with target selection and visibility analysis
- **Image Management**: Manage astronomical images with FITS file support
- **Image Sharing**: Share images via cloud storage with public gallery
- **Dual Deployment**: Run as desktop application (Tauri) or web application
- **Dark Theme**: Beautiful dark blue color palette optimized for astronomy

## Technology Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for build tooling
- **Zod** for runtime type validation
- **Vitest** for testing

### Backend
- **Rust** (Tauri commands and core logic)
- **Python** (PyO3 embedded)
  - Astronomical calculations (astropy, astroplan)
  - Telescope hardware control
  - User scripting engine
- **Tauri 2** for desktop application framework

## Project Structure

```
eesc/
├── src/                          # React frontend
│   ├── features/                 # Feature modules
│   │   ├── telescope-control/
│   │   ├── session-planning/
│   │   ├── image-management/
│   │   └── image-sharing/
│   ├── services/                 # API abstraction layer
│   ├── types/                    # TypeScript types (Zod schemas)
│   ├── styles/                   # Global styles and theme
│   ├── test/                     # Test utilities
│   ├── App.tsx
│   └── main.tsx
│
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── commands/             # Tauri commands
│   │   ├── telescope/            # Telescope control logic
│   │   ├── imaging/              # Image processing
│   │   ├── python/               # PyO3 bridge
│   │   ├── main.rs
│   │   └── lib.rs
│   │
│   ├── python/                   # Python modules
│   │   ├── astronomy/            # Coordinate transforms, ephemeris
│   │   ├── hardware/             # Telescope drivers
│   │   └── scripting/            # User script engine
│   │
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── build.rs
│
├── tests/                        # Python tests
│   ├── test_astronomy.py
│   └── test_scripting.py
│
├── package.json                  # pnpm configuration
├── pyproject.toml                # Python/uv configuration
├── vite.config.ts                # Vite configuration
├── vitest.config.ts              # Vitest configuration
└── README.md
```

## Getting Started

### Prerequisites

- **Node.js** (v18+)
- **pnpm** (v8+)
- **Rust** (latest stable)
- **Python** (3.11+)
- **uv** (Python package manager)
- **Tauri Prerequisites**: See [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/)

### Installation

1. **Install dependencies**:

```bash
# Install JavaScript dependencies
pnpm install

# Install Python dependencies
uv sync

# The Rust dependencies will be installed automatically when building
```

2. **Development**:

```bash
# Run desktop app in development mode
pnpm tauri:dev

# Run web version in development mode
pnpm web:api
pnpm web:dev
```

### Building

```bash
# Build desktop application
pnpm tauri:build

# Build web version
pnpm web:build
```

### Testing

```bash
# Run all tests
pnpm test:all

# Run TypeScript/React tests
pnpm test

# Run TypeScript tests with UI
pnpm test:ui

# Run Python tests
pnpm test:python

# Run Rust tests
pnpm test:rust

# Run tests with coverage
pnpm test:coverage
```

### Linting and Formatting

```bash
# Format all code
pnpm format
pnpm format:python

# Lint code
pnpm lint
pnpm lint:python
```

## Development Workflow

### Adding New Tauri Commands

1. Define the command in `src-tauri/src/commands/mod.rs`
2. Register it in `src-tauri/src/main.rs` via `generate_handler![]`
3. Call from frontend using `invoke('command_name', { args })`

### Using Python from Rust

Python modules are integrated via PyO3 in `src-tauri/src/python/mod.rs`. To call Python code:

```rust
use pyo3::prelude::*;

Python::with_gil(|py| {
    // Execute Python code
    let result = py.eval("1 + 1", None, None)?;
    println!("{}", result);
    Ok(())
})
```

### Adding New Features

1. Create feature directory in `src/features/`
2. Implement React components with TypeScript
3. Define types using Zod schemas in `src/types/`
4. Create corresponding Rust commands if needed
5. Add Python modules for complex calculations

### Dual Deployment (Desktop & Web)

The API abstraction layer (`src/services/api.ts`) automatically detects the runtime environment:

- **Desktop (Tauri)**: Uses `@tauri-apps/api` for direct Rust communication
- **Web**: Falls back to REST API calls (requires separate backend server)

## Architecture

### Frontend → Backend Communication

```
React Components
    ↓
API Abstraction Layer (src/services/api.ts)
    ↓
    ├─→ Tauri (Desktop): invoke() → Rust Commands
    └─→ Web: fetch() → REST API → Rust Server
            ↓
        Rust Backend
            ↓
            ├─→ Pure Rust (telescope, imaging)
            └─→ PyO3 Bridge → Python Modules
                    ↓
                ├─→ Astronomy (astropy, astroplan)
                ├─→ Hardware (ASCOM/INDI drivers)
                └─→ Scripting (user scripts)
```

## Python Modules

### Astronomy (`src-tauri/python/astronomy/`)
- **coordinates.py**: RA/Dec ↔ Alt/Az transformations
- **ephemeris.py**: Sun, Moon, and planet positions
- **planning.py**: Observation planning and visibility analysis

### Hardware (`src-tauri/python/hardware/`)
- **telescope_driver.py**: Abstract telescope driver for ASCOM/INDI/Alpaca

### Scripting (`src-tauri/python/scripting/`)
- **script_engine.py**: Embedded Python interpreter for user scripts

## Contributing

1. Follow the existing code style
2. Use `pnpm format` and `pnpm lint` before committing
3. Add tests for new features
4. Update documentation as needed

## License

See LICENSE file for details.

## Roadmap

- [ ] Implement actual telescope hardware communication
- [ ] Add FITS image viewer with stretch algorithms
- [ ] Integrate star catalogs and deep sky object databases
- [ ] Add plate solving capabilities
- [ ] Implement cloud storage backend
- [ ] Add session scheduling and weather integration
- [ ] Create mobile companion app
