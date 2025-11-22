# Electron Wrapper for ALP Experimental

This directory contains the Electron wrapper that packages the ALP Experimental application as a desktop app.

## Structure

- `main.js` - Main Electron process that manages the application window and lifecycle
- `preload.js` - Preload script for security isolation between main and renderer processes
- `processManager.js` - Manages the Python backend and Next.js frontend processes
- `package.json` - Electron dependencies and build configuration

## Development

### Prerequisites

1. Install dependencies in the root directory:
   ```bash
   npm install
   ```

2. Install Electron dependencies:
   ```bash
   cd electron
   npm install
   ```

### Running in Development

1. Start the backend server:
   ```bash
   cd server
   uv run python main.py server
   ```

2. Start the frontend dev server:
   ```bash
   cd ui
   pnpm run dev
   ```

3. Start Electron:
   ```bash
   cd electron
   npm start
   ```

Or use the convenience script from the root:
```bash
npm run electron:dev
```

## Building for Production

### Build Prerequisites

1. Build the frontend:
   ```bash
   cd ui
   pnpm run build
   pnpm run export  # Creates static export in ui/out
   ```

2. Build the backend:
   ```bash
   cd server
   pyinstaller --onefile --name main \
     --add-data "templates:templates" \
     --add-data "static:static" \
     --hidden-import uvicorn.logging \
     --hidden-import uvicorn.loops \
     --hidden-import uvicorn.loops.auto \
     --hidden-import uvicorn.protocols \
     --hidden-import uvicorn.protocols.http \
     --hidden-import uvicorn.protocols.http.auto \
     --hidden-import uvicorn.protocols.websockets \
     --hidden-import uvicorn.protocols.websockets.auto \
     --hidden-import uvicorn.lifespan \
     --hidden-import uvicorn.lifespan.on \
     main.py
   ```

### Building the Electron App

From the root directory:
```bash
npm run electron:build  # Builds without packaging
npm run electron:dist   # Creates distributable packages
```

This will create platform-specific installers in the `dist/` directory.

## Configuration

### Development vs Production

The app automatically detects if it's running in development or production:

- **Development**: Connects to existing dev servers (backend on 8000, frontend on 3000)
- **Production**: Launches bundled backend and serves static frontend files

### Environment Variables

- `NODE_ENV` - Set to 'development' for dev mode
- `ELECTRON_START_URL` - Override the default frontend URL (default: http://localhost:3000)

## Architecture

The Electron wrapper works by:

1. **Main Process** (`main.js`):
   - Creates the application window
   - Manages app lifecycle
   - Handles menu and system integration

2. **Process Manager** (`processManager.js`):
   - Spawns and manages the Python backend process
   - In development, checks if servers are already running
   - In production, launches the bundled executables

3. **Security** (`preload.js`):
   - Provides controlled access to Electron APIs
   - Maintains context isolation for security

## Troubleshooting

### Backend won't start
- Check Python is installed (development mode)
- Verify all Python dependencies are installed: `cd server && uv sync`
- Check logs in console for specific errors

### Frontend connection issues
- Ensure frontend is built: `cd ui && pnpm run build`
- Check that port 3000 (dev) is not in use
- Verify CORS settings in backend

### Build failures
- Ensure all dependencies are installed
- For Windows: May need to run as administrator
- For macOS: May need to allow app in Security settings
- Check that PyInstaller can access all required Python modules

## Platform-Specific Notes

### macOS
- App will appear in the dock
- Supports native macOS menu conventions
- May require notarization for distribution

### Windows
- Creates Start Menu shortcuts
- Supports Windows installer conventions
- May require code signing for distribution

### Linux
- Creates AppImage for easy distribution
- Supports system tray integration
- Works with most desktop environments