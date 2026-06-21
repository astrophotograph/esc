# esc — telescope control app. Run with `just <recipe>` (https://github.com/casey/just).

set shell := ["bash", "-cu"]

# Tauri's Rust backend links system libs (webkit2gtk-4.1 / libsoup-3.0) discovered
# via pkg-config. Export the Debian/Ubuntu multiarch path for every cargo recipe so
# `cargo build/check/test` work without a wrapper (mirrors run-dev.sh). Harmless
# elsewhere — pkg-config just falls back to its default search path.
export PKG_CONFIG_PATH := "/usr/lib/x86_64-linux-gnu/pkgconfig:" + env_var_or_default("PKG_CONFIG_PATH", "")

# Default: list recipes.
default:
    @just --list

# --- Setup ---

# Install JS dependencies.
install:
    pnpm install

# --- Dev (run a dev instance) ---

# Desktop app (Tauri) with hot reload — the default dev instance.
dev:
    ./run-dev.sh

# Browser web app: builds & starts the Rust web server, then the Vite dev server.
# Optional host IP for TAURI_DEV_HOST (default 0.0.0.0): `just web 192.168.1.10`
web host="0.0.0.0":
    ./run-dev.sh --web {{host}}

# Vite dev server only (no backend) — for pure frontend work.
frontend:
    pnpm web:dev

# --- Build ---

# Type-check + bundle the frontend (desktop mode).
build:
    pnpm build

# Type-check + bundle the frontend for web mode (-> dist-web/).
build-web:
    pnpm web:build

# Build the standalone Rust web API server (debug).
build-server:
    cargo build --bin web_server

# Build the desktop app for release (Tauri bundles).
build-desktop:
    pnpm tauri:build

# --- Test ---

# Run the whole suite (Rust + TypeScript).
test: test-rust test-ts

# Rust unit + integration tests (includes the session-replay E2E suite).
test-rust:
    cargo test

# TypeScript/React tests (single run).
test-ts:
    pnpm test --run

# Just the session-replay E2E integration tests.
test-e2e:
    cargo test --test replay_e2e

# Vitest in watch mode.
test-watch:
    pnpm test

# Frontend test coverage report.
coverage:
    pnpm test:coverage

# --- Quality ---

# Lint: prettier check + TypeScript type-check (matches `pnpm lint`).
lint:
    pnpm lint

# Fast Rust type-check (no codegen).
check:
    cargo check --all-targets

# Format the codebase (prettier for TS, rustfmt for Rust).
fmt:
    pnpm format
    cargo fmt

# --- Maintenance ---

# Remove build artifacts (Rust target + bundled frontend output).
clean:
    cargo clean
    rm -rf dist dist-web
