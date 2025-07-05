# ALP Experimental

Seestar ALP experimental repo. This is an experimental copy of what I hope to
eventually get integrated into Seestar ALP.

There are two parts: the `server` written in Python and `ui` written in NextJS.
Both pieces need to be run at the same time.

## Quick Start with Docker

The easiest way to get started is to use our setup script which will:
- Check that Docker is installed
- Clone or update the repository
- Start the application automatically

Run this single command:

```bash
curl -sSL https://raw.githubusercontent.com/astrophotograph/alp-experimental/main/setup-and-run.sh | bash
```

Or if you prefer to review the script first:

```bash
# Download and review the script
curl -sSL https://raw.githubusercontent.com/astrophotograph/alp-experimental/main/setup-and-run.sh -o setup-and-run.sh
cat setup-and-run.sh

# Run it
bash setup-and-run.sh
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

### Server

```shell
cd server
uv run main.py server
```

The above should autodetect any Seestars on the network.

### UI

```shell
cd ui
npm install --legacy-peer-deps   # Only need to run first time
npm run dev
```

### Running

After the above are run, go to `http://localhost:3000/`. It will have
automatically discovered any Seestars on the network.

