# Docker Configuration

## Quick Start

```bash
# Development mode
make dev

# Production mode
make prod

# Stop all containers
make down
```

## Port Configuration

The application uses the following default ports:

- **Backend API Server**: Port 8000
- **Frontend UI**: Port 3000 (development) or 3001 (production standalone)
- **Redis**: Port 6379 (when using network_mode: host)

## Environment Variables

Create a `.env` file in the project root or use `.env.docker` for Docker-specific settings:

```bash
# Server Configuration
SERVER_PORT=8000              # FastAPI server port
PYTHON_ENV=development        # Python environment (development/production)
LOG_LEVEL=DEBUG              # Logging level

# UI Configuration
NODE_ENV=development         # Node environment
NEXT_PUBLIC_API_URL=http://localhost:8000  # Public API URL for frontend
BACKEND_HOST=localhost:8000  # Backend host for server-side API calls
```

## Network Mode

Both services use `network_mode: host` to enable:
- Direct access to Seestar devices on the local network
- UDP broadcast discovery for telescope detection
- Simplified networking without port mapping

## Common Issues

### Port Mismatch
If the UI cannot connect to the backend, ensure:
1. Backend is running on port 8000: `docker logs esc_server_1`
2. UI environment has correct backend URL: `BACKEND_HOST=localhost:8000`

### Building Images
```bash
# Rebuild without cache
docker-compose build --no-cache

# Build specific service
docker-compose build server
docker-compose build ui
```

### Viewing Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f server
docker-compose logs -f ui
```

## Production Deployment

For production, use `docker-compose.prod.yml`:

```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

This adds:
- Optimized Dockerfiles for smaller images
- Nginx reverse proxy on ports 80/443
- Production environment variables
- Removed development volume mounts