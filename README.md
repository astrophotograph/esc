# ESC - Telescope Controller

A browser-based controller for Seestar smart telescopes. Connect from any device on your local network to control your telescope, browse catalogs, capture images, and plan observation sessions.

Also available as a native desktop app for Linux and macOS.

## Quick Start

### Linux Server

The web version is one Rust binary, `web_server`, which serves the frontend and
the API on port 9846. Build it on the target's distribution (it links
WebKitGTK, so the build host needs the Tauri prerequisites listed below):

```bash
pnpm install --frozen-lockfile && pnpm web:build      # frontend -> dist-web/
PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig \
  cargo build --release --manifest-path src-tauri/Cargo.toml --bin web_server

ESC_STATIC_DIR=$PWD/dist-web ./target/release/web_server
```

Then open **http://\<server-ip\>:9846** from any device on the same network.
The server must be on the same subnet as the telescope for discovery to find it.

| Variable | Purpose |
|---|---|
| `ESC_STATIC_DIR` | Directory of the built frontend. Unset, only the API is served. |
| `SEESTAR_INTEROP_PEM` | Path to the interop key for the Seestar verification handshake. |
| `XDG_DATA_HOME` | Where `com.erewhon.esc/eesc.db` (saved telescopes, settings) is kept. |

`deploy/incus/esc.service` is a systemd unit for running it as a service. The
server has no authentication of its own: put it behind a proxy that does if
the network is not trusted.

The `esc-web` `.deb` of earlier releases packaged the previous Python backend
and is no longer built.

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
- **Tauri prerequisites** (desktop app and the web server binary): see [Tauri docs](https://v2.tauri.app/start/prerequisites/)

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

# Web server (see Quick Start)
cargo build --release --manifest-path src-tauri/Cargo.toml --bin web_server
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
├── deploy/                 # systemd unit for the web server
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
