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
