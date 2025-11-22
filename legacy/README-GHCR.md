# Using Pre-built Container Images

You can use the pre-built container images from GitHub Container Registry:

```bash
# Pull and run the latest images
docker-compose -f docker-compose.ghcr.yml pull
docker-compose -f docker-compose.ghcr.yml up -d
```

Available tags:
- `latest` - Latest stable release from main branch
- `main-<sha>` - Specific commit from main branch
- `develop` - Latest from develop branch
- `v*.*.*` - Specific version tags

Images are available for both linux/amd64 and linux/arm64 architectures.

## Data Persistence

The GHCR setup includes persistent storage for:
- **Telescope Database**: Manually added telescopes are stored in SQLite and persist across container restarts
- **Redis Data**: Session and cache data survives container updates

### Database Backup (GHCR)

```bash
# Backup telescope database
docker run --rm -v main_telescope-data:/data -v $(pwd):/backup alpine \
  cp /data/telescopes.db /backup/telescopes-backup-$(date +%Y%m%d).db

# Restore telescope database
docker run --rm -v main_telescope-data:/data -v $(pwd):/backup alpine \
  cp /backup/telescopes-backup-YYYYMMDD.db /data/telescopes.db
docker-compose -f docker-compose.ghcr.yml restart server
```

### Upgrading Images

```bash
# Update to latest images while preserving data
docker-compose -f docker-compose.ghcr.yml pull
docker-compose -f docker-compose.ghcr.yml up -d

# Your manually added telescopes will be automatically restored
```
