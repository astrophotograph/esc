# ESC - Telescope Controller

A browser-based controller for Seestar smart telescopes. Connect from any device on your local network to control your telescope, browse catalogs, capture images, and plan observation sessions.

Also available as a native desktop app for Linux and macOS.

## Quick Start

### Raspberry Pi / Linux Server

Download and install the `.deb` — it sets up everything automatically:

```bash
curl -LO https://github.com/astrophotograph/esc/releases/latest/download/esc-web_2026.2.0_all.deb
sudo dpkg -i esc-web_2026.2.0_all.deb
```

This installs ESC to `/opt/esc`, downloads Python and dependencies via [uv](https://docs.astral.sh/uv/), and starts a systemd service. First install takes a few minutes while dependencies are pulled.

Once installed, open **http://\<pi-ip\>:9846** from any device on the same network.

```bash
# Manage the service
sudo systemctl status esc
sudo systemctl restart esc
journalctl -u esc -f

# Upgrade
curl -LO https://github.com/astrophotograph/esc/releases/latest/download/esc-web_2026.2.0_all.deb
sudo dpkg -i esc-web_2026.2.0_all.deb

# Uninstall
sudo dpkg -r esc-web        # remove
sudo dpkg -P esc-web        # purge (also removes venv and service user)
```

### Linux Desktop

Download the `.deb` or `.rpm` from the [latest release](https://github.com/astrophotograph/esc/releases/latest):

```bash
# Debian/Ubuntu
sudo dpkg -i ESC_2026.2.0_amd64.deb

# Fedora/RHEL
sudo rpm -i ESC-2026.2.0-1.x86_64.rpm
```

### macOS

Download `ESC_2026.2.0_aarch64.dmg` from the [latest release](https://github.com/astrophotograph/esc/releases/latest) and drag to Applications.

## Features

- **Live Video Feed**: MJPEG stream from the telescope with zoom, pan, and rotation
- **Telescope Control**: GoTo, tracking, focus, park, and manual movement
- **Catalog Search**: Browse deep sky objects, solar system targets, and star catalogs
- **Session Planning**: Plan observation sessions with target visibility analysis
- **Image Processing**: FITS support with stretch algorithms and plate solving
- **Multiple Themes**: Dark, light, and astronomy-optimized color schemes
- **Dual Deployment**: Run as a desktop app (Tauri) or web server (FastAPI)

## Architecture

ESC has two deployment modes that share the same React frontend:

- **Desktop (Tauri)**: Rust backend with embedded Python via PyO3. Frontend communicates with Rust directly through Tauri IPC.
- **Web (FastAPI)**: Python backend serving both the API and static frontend. Any browser on the local network can connect.

The API abstraction layer (`src/services/api.ts`) detects the runtime and routes calls accordingly:

```
React Frontend
    ↓
API Abstraction Layer
    ├─→ Desktop: Tauri IPC → Rust → PyO3 → Python
    └─→ Web: HTTP POST /api/{command} → FastAPI → Python
```

## Development

### Prerequisites

- **Node.js** 18+ and **pnpm** 8+
- **Rust** (latest stable) — only needed for desktop builds
- **uv** (Python package manager): `curl -LsSf https://astral.sh/uv/install.sh | sh`
- **Tauri prerequisites** (desktop only): see [Tauri docs](https://v2.tauri.app/start/prerequisites/)

### Setup

```bash
git clone https://github.com/astrophotograph/esc.git
cd esc
pnpm install
uv sync
```

### Running in Development

**Web mode** (two terminals):

```bash
pnpm web:api     # Python backend on :9846
pnpm web:dev     # Vite dev server on :9273 (proxies /api to backend)
```

Open http://localhost:9273

**Desktop mode**:

```bash
./run-dev.sh     # Sets up LD_LIBRARY_PATH and launches Tauri
```

### Building

```bash
# Web frontend (outputs to dist-web/)
pnpm web:build

# Desktop app
pnpm tauri:build

# Web .deb package
pnpm web:build && ./deploy/build-deb.sh
```

### Testing

```bash
pnpm test              # TypeScript/React tests
pnpm test:python       # Python tests
pnpm test:rust         # Rust tests
pnpm test:all          # Everything
pnpm test:coverage     # With coverage report
```

### Linting and Formatting

```bash
pnpm format            # Prettier (TypeScript)
pnpm format:python     # Ruff (Python)
pnpm lint              # ESLint
pnpm lint:python       # Ruff linter
```

### Project Structure

```
esc/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── hooks/              # React hooks (polling, shortcuts, etc.)
│   ├── services/           # API abstraction layer
│   ├── stores/             # Zustand state stores
│   └── themes/             # Theme definitions
├── src-tauri/              # Rust backend (desktop mode)
│   └── src/
│       ├── commands/       # Tauri command handlers
│       └── python/         # PyO3 bridge
├── python/                 # Python backend (web + embedded)
│   ├── telescope/          # Seestar bridge and discovery
│   ├── catalog/            # Deep sky object catalogs
│   ├── imaging/            # FITS processing, plate solving
│   ├── planning/           # Session planning
│   └── web_api.py          # FastAPI server
├── deploy/                 # Packaging (systemd, .deb build)
├── run-dev.sh              # Desktop dev launcher
├── pyproject.toml          # Python dependencies
└── package.json            # Node dependencies
```

## Contributing

1. Follow the existing code style
2. Run `pnpm format` and `pnpm lint` before committing
3. Add tests for new features

## License

See LICENSE file for details.
