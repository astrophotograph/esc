# Getting Started with EESC

This guide will help you get the EESC telescope control application up and running.

## Quick Start

### 1. Install Dependencies

```bash
# Install JavaScript dependencies
pnpm install

# Install Python dependencies (creates .venv automatically)
uv sync

# Rust dependencies are installed automatically on first build
```

### 2. Run the Development Server

Choose one of the following:

**Desktop Application (Recommended for development)**
```bash
pnpm tauri:dev
```

**Web Version**
```bash
pnpm web:dev
```

The application will open automatically. The desktop version includes hot-reload and React DevTools.

## Project Overview

### Key Directories

- `src/` - React frontend code
  - `features/` - Main application features
  - `services/` - API communication layer
  - `types/` - TypeScript types and Zod schemas

- `src-tauri/` - Rust backend
  - `src/` - Rust source code
  - `python/` - Python modules for astronomy and telescope control

### Available Scripts

```bash
# Development
pnpm tauri:dev          # Desktop app with hot-reload
pnpm web:dev            # Web version

# Building
pnpm tauri:build        # Build desktop app
pnpm web:build          # Build web version

# Testing
pnpm test               # Run TypeScript tests
pnpm test:ui            # Interactive test UI
pnpm test:python        # Python tests
pnpm test:rust          # Rust tests
pnpm test:all           # All tests

# Code Quality
pnpm format             # Format TypeScript/JavaScript
pnpm format:python      # Format Python
pnpm lint               # Lint TypeScript
pnpm lint:python        # Lint Python
```

## Next Steps

### 1. Explore the Codebase

Start with:
- `src/App.tsx` - Main React application
- `src-tauri/src/main.rs` - Tauri entry point
- `src-tauri/src/commands/mod.rs` - Backend commands

### 2. Add Your First Feature

Try modifying the greeting example:
1. Open `src-tauri/src/commands/mod.rs`
2. Modify the `greet()` function
3. Save and watch hot-reload update the app

### 3. Explore Python Integration

The Python modules in `src-tauri/python/` provide:
- **astronomy/** - Coordinate transformations, ephemeris
- **hardware/** - Telescope control (placeholder for now)
- **scripting/** - User script execution

### 4. Run Tests

```bash
# Run tests in watch mode during development
pnpm test

# Run Python tests
pnpm test:python
```

## Architecture Quick Reference

### Frontend → Backend Communication

```typescript
// In React components
import { invoke } from '@/services/api'

// Call Rust command
const result = await invoke<string>('greet', { name: 'World' })
```

### Rust → Python Integration

```rust
// In Rust code
use pyo3::prelude::*;

Python::with_gil(|py| {
    let result = py.eval("1 + 1", None, None)?;
    Ok(())
})
```

## Common Tasks

### Add a New Tauri Command

1. Define in `src-tauri/src/commands/mod.rs`:
```rust
#[tauri::command]
pub fn my_command(arg: String) -> String {
    format!("You said: {}", arg)
}
```

2. Register in `src-tauri/src/main.rs`:
```rust
.invoke_handler(tauri::generate_handler![
    commands::greet,
    commands::my_command,  // Add here
])
```

3. Call from frontend:
```typescript
const result = await invoke<string>('my_command', { arg: 'hello' })
```

### Add a New React Feature

1. Create directory: `src/features/my-feature/`
2. Add component: `MyFeature.tsx`
3. Add styles: `MyFeature.css`
4. Export from: `index.ts`
5. Import in `src/App.tsx`

### Add Python Functionality

1. Add module in `src-tauri/python/`
2. Use via PyO3 in `src-tauri/src/python/mod.rs`
3. Expose through Tauri commands

## Troubleshooting

### Build Errors

**Python not found**
```bash
# Make sure uv is installed
curl -LsSf https://astral.sh/uv/install.sh | sh
uv sync
```

**Rust compilation errors**
```bash
# Update Rust
rustup update stable
```

**Tauri prerequisites missing**
- See: https://v2.tauri.app/start/prerequisites/

### Development Issues

**Hot reload not working**
- Try restarting the dev server
- Check that you're not modifying `tauri.conf.json` while running

**Python modules not found**
- Run `uv sync` to install dependencies
- Check that `.venv` directory exists

**TypeScript errors**
- Run `pnpm install` to ensure all types are installed
- Restart your TypeScript server

## Resources

- [Tauri Documentation](https://v2.tauri.app/)
- [React Documentation](https://react.dev/)
- [PyO3 Guide](https://pyo3.rs/)
- [Astropy Documentation](https://docs.astropy.org/)
- [Zod Documentation](https://zod.dev/)

## Getting Help

If you encounter issues:
1. Check the console for error messages
2. Review the relevant documentation
3. Check the issue tracker in the main ESC repository
4. Enable debug logging in `tauri.conf.json`

Happy coding!
