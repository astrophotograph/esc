# Docker Setup for Telescope Control Application

This document explains how to run the telescope control application using Docker and Docker Compose.

## Architecture

The application consists of three main services:

- **UI Service**: Next.js frontend (Port 3000)
- **Server Service**: Python FastAPI backend (Port 8000)
- **Redis Service**: Optional caching and session storage (Port 6379)

## Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- At least 2GB available RAM
- Available ports: 3000, 8000, 6379

## Quick Start

### Development Mode

1. **Clone and navigate to the project**:
   ```bash
   cd /path/to/alp-experimental/main
   ```

2. **Copy environment configuration**:
   ```bash
   cp .env.example .env
   ```

3. **Start all services**:
   ```bash
   docker-compose up -d
   ```

4. **Access the application**:
   - UI: http://localhost:3000
   - API: http://localhost:8000
   - API Docs: http://localhost:8000/docs

5. **View logs**:
   ```bash
   # All services
   docker-compose logs -f
   
   # Specific service
   docker-compose logs -f ui
   docker-compose logs -f server
   ```

### Production Mode

1. **Build and start production services**:
   ```bash
   docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
   ```

2. **Access via Nginx reverse proxy**:
   - Application: http://localhost
   - Direct API access is proxied through `/api/`

## Environment Configuration

Copy `.env.example` to `.env` and customize:

```bash
# Server Configuration
SERVER_PORT=8000
SERVER_HOST=0.0.0.0

# UI Configuration  
UI_PORT=3000
NEXT_PUBLIC_API_URL=http://localhost:8000

# Telescope Settings
SEESTAR_HOST=192.168.1.100  # Set your telescope IP
SEESTAR_PORT=4700

# Development vs Production
NODE_ENV=development
PYTHON_ENV=development
```

## Service Management

### Start Services
```bash
# Development mode
docker-compose up -d

# Production mode
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Start specific service
docker-compose up -d server
```

### Stop Services
```bash
# Stop all
docker-compose down

# Stop and remove volumes
docker-compose down -v

# Stop specific service
docker-compose stop ui
```

### Rebuild Services
```bash
# Rebuild all
docker-compose build

# Rebuild specific service
docker-compose build server --no-cache

# Rebuild and restart
docker-compose up -d --build
```

## Development Workflow

### Hot Reloading

Both services support hot reloading in development mode:

- **UI**: Changes to `/ui` directory trigger Next.js hot reload
- **Server**: Changes to `/server` directory restart the FastAPI server

### Running Commands

```bash
# Execute commands in running containers
docker-compose exec server python main.py console
docker-compose exec ui npm run test
docker-compose exec ui npm run lint

# Run one-off commands
docker-compose run --rm server python -c "print('Hello')"
docker-compose run --rm ui npm install new-package
```

### Database/Storage

```bash
# Access Redis CLI
docker-compose exec redis redis-cli

# View Redis data
docker-compose exec redis redis-cli keys "*"
```

## Telescope Connection

### Network Configuration

The application discovers Seestar telescopes on the local network. Ensure:

1. **Docker network access**: The containers can reach your telescope IP
2. **Firewall settings**: Ports 4700 (Seestar) are accessible
3. **Network mode**: Use `host` network if discovery fails:

```yaml
# In docker-compose.yml
services:
  server:
    network_mode: host  # For telescope discovery
```

### Manual Configuration

Set telescope IP in environment:

```bash
# .env file
SEESTAR_HOST=192.168.1.100
SEESTAR_PORT=4700
```

## Troubleshooting

### Common Issues

1. **Port conflicts**:
   ```bash
   # Check if ports are in use
   lsof -i :3000
   lsof -i :8000
   
   # Change ports in docker-compose.yml
   ports:
     - "3001:3000"  # Use different host port
   ```

2. **Permission errors**:
   ```bash
   # Fix file permissions
   sudo chown -R $USER:$USER .
   ```

3. **Build failures**:
   ```bash
   # Clean build
   docker-compose down
   docker system prune -f
   docker-compose build --no-cache
   ```

4. **Permission errors (chown failures or .next/trace access)**:
   ```bash
   # For server permission issues:
   # Edit docker-compose.yml server section:
   # dockerfile: Dockerfile.multistage
   
   # For UI permission issues (.next/trace):
   # Edit docker-compose.yml ui section:
   # dockerfile: Dockerfile.multistage
   
   # Rebuild affected service
   docker-compose build server --no-cache
   docker-compose build ui --no-cache
   ```

5. **Network issues**:
   ```bash
   # Inspect networks
   docker network ls
   docker network inspect main_telescope-network
   ```

### Health Checks

```bash
# Check service health
docker-compose ps

# Test endpoints
curl http://localhost:3000/api/health
curl http://localhost:8000/health
```

### Logs and Debugging

```bash
# Detailed logs
docker-compose logs -f --tail=100 server

# Enter container for debugging
docker-compose exec server bash
docker-compose exec ui sh

# Check resource usage
docker stats
```

## Performance Optimization

### Resource Limits

Add resource constraints in `docker-compose.yml`:

```yaml
services:
  server:
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '0.5'
```

### Volume Optimization

```yaml
# Use named volumes for better performance
volumes:
  node_modules:
  python_cache:

services:
  ui:
    volumes:
      - ./ui:/app
      - node_modules:/app/node_modules
```

## Security Considerations

### Production Security

1. **Use production builds** with optimized Dockerfiles
2. **Enable HTTPS** with SSL certificates in nginx
3. **Set secure environment variables**
4. **Regular updates** of base images
5. **Non-root users** in containers (already configured)

### Network Security

```bash
# Create isolated network
docker network create telescope-secure --driver bridge

# Limit external access
docker-compose -f docker-compose.secure.yml up
```

## Monitoring

### Container Monitoring

```bash
# Resource usage
docker stats

# System info
docker system df
docker system info
```

### Application Monitoring

Add monitoring endpoints:

```bash
# Health checks
curl http://localhost:3000/api/health
curl http://localhost:8000/health

# Metrics (if implemented)
curl http://localhost:8000/metrics
```

## Backup and Recovery

### Data Backup

```bash
# Backup Redis data
docker-compose exec redis redis-cli BGSAVE
docker cp $(docker-compose ps -q redis):/data/dump.rdb ./backup/

# Backup configuration
tar -czf backup/config-$(date +%Y%m%d).tar.gz .env docker-compose.yml
```

### Recovery

```bash
# Restore Redis data
docker cp ./backup/dump.rdb $(docker-compose ps -q redis):/data/
docker-compose restart redis
```

## Support

For issues related to:
- **Docker setup**: Check this README and Docker logs
- **Telescope connection**: See telescope documentation  
- **Application bugs**: Check application logs and GitHub issues

### Useful Commands Reference

```bash
# Complete reset
docker-compose down -v && docker system prune -f

# Update images
docker-compose pull && docker-compose up -d

# Export logs
docker-compose logs --no-color > telescope-app.log

# Database shell
docker-compose exec redis redis-cli
```