# ESC (Experimental Scope Creep)

Advanced telescope control interface for Seestar telescopes. This project provides enhanced features and experimental capabilities beyond the standard Seestar app.

There are two parts: the `server` written in Python and `ui` written in NextJS.
Both pieces need to be run at the same time.

## Quick Start with Docker

The easiest way to get started is to use our setup script which will:
- Check that Docker is installed
- Pull pre-built Docker images from GitHub Container Registry
- Start the application automatically

### Running Latest Version

Run this single command:

```bash
curl -sSL https://raw.githubusercontent.com/astrophotograph/esc/main/setup-and-run.sh | bash
```

### Running Specific Version

You can specify a version using an environment variable with curl:

```bash
# Run specific version v1.0.0
VERSION=v1.0.0 curl -sSL https://raw.githubusercontent.com/astrophotograph/esc/main/setup-and-run.sh | bash

# Run beta version
VERSION=beta curl -sSL https://raw.githubusercontent.com/astrophotograph/esc/main/setup-and-run.sh | bash

# Run nightly/development version
VERSION=main curl -sSL https://raw.githubusercontent.com/astrophotograph/esc/main/setup-and-run.sh | bash
```

Or download the script and use command-line arguments:

```bash
# Download the script
curl -sSL https://raw.githubusercontent.com/astrophotograph/esc/main/setup-and-run.sh -o setup-and-run.sh

# Run specific version
bash setup-and-run.sh --version v1.0.0

# Or run beta version
bash setup-and-run.sh --version beta

# Or run latest (default)
bash setup-and-run.sh --version latest
```

### Script Options

```bash
# View all options
bash setup-and-run.sh --help

# Force download source code
bash setup-and-run.sh --force-download

# Run specific version with source download
bash setup-and-run.sh --version v1.0.0 --force-download
```

After running, the application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Documentation: http://localhost:8000/docs

### Data Persistence

The application automatically persists manually added telescopes in a SQLite database. In Docker setups, this database is stored in a volume and survives container restarts and updates.

- **Auto-discovered telescopes**: Rediscovered on each startup
- **Manually added telescopes**: Persisted and restored automatically
- **Backup instructions**: See [Docker documentation](README.Docker.md#backup-and-recovery)

## Manual Setup

### Raspberry Pi 4 Setup

For Raspberry Pi 4 users, we provide a special setup script that handles ARM64 compatibility:

```bash
cd server
./setup-rpi.sh  # Installs ARM64-compatible dependencies
uv run python main.py server
```

**Requirements:**
- Raspberry Pi 4 with 64-bit OS (required)
- At least 4GB RAM recommended
- 5GB free disk space

The setup script will:
- Install system dependencies for ARM64
- Compile critical packages from source to avoid illegal instruction errors
- Configure optimized settings for Raspberry Pi hardware

### Standard Server Setup

```shell
cd server
uv run python main.py server
```

The above should autodetect any Seestars on the network.

### UI Setup

```shell
cd ui
npm install --legacy-peer-deps   # Only need to run first time
npm run dev
```

### Running

After the above are run, go to `http://localhost:3000/`. It will have
automatically discovered any Seestars on the network.

