# UI Scripts

## Auto-Respawn Scripts

These scripts automatically restart the Next.js server if it crashes or exits unexpectedly.

### Usage

#### Option 1: Using npm scripts (Recommended)

```bash
# Development server with auto-respawn
npm run dev:respawn

# Production server with auto-respawn
npm run start:respawn

# Build and start production with auto-respawn
npm run start:production
```

#### Option 2: Using nodemon (requires installation)

First install nodemon:
```bash
npm install --save-dev nodemon
```

Then run:
```bash
npm run dev:nodemon
```

#### Option 3: Direct script execution

```bash
# Node.js respawn script (cross-platform)
node scripts/respawn.js dev
node scripts/respawn.js start
node scripts/respawn.js build-start

# Bash respawn script (Unix/Linux/macOS)
./scripts/respawn.sh dev
./scripts/respawn.sh start
./scripts/respawn.sh build-start
```

### Features

- **Auto-restart**: Automatically restarts the server if it crashes
- **Retry limit**: Stops after 10 consecutive failures to prevent infinite loops
- **Retry delay**: Waits 3 seconds between restart attempts
- **Graceful shutdown**: Press Ctrl+C twice to exit cleanly
- **Smart retry counter**: Resets after 60 seconds of successful operation
- **Exit code handling**: Distinguishes between normal exits and crashes

### Configuration

Edit the scripts to adjust:
- `MAX_RETRIES`: Maximum number of restart attempts (default: 10)
- `RETRY_DELAY`: Delay between restarts in milliseconds (default: 3000)
- `RESET_COUNTER_AFTER`: Time after which to reset retry counter (default: 60000ms)

### When to Use

Use auto-respawn when:
- Running long development sessions where occasional crashes occur
- Deploying to production without a process manager like PM2
- Testing server stability and recovery
- Running the server in Docker containers

### Alternative: PM2 (Production)

For production deployments, consider using PM2:

```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start npm --name "nextjs-app" -- start
pm2 save
pm2 startup

# Monitor
pm2 monit
pm2 logs
```

## Version Generation Script

`generate-version.js` - Generates version information for the application

### Usage

```bash
# Generate version and update package.json
npm run version:generate

# Show current version without updating
npm run version:show
```