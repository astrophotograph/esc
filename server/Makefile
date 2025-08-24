# Makefile for ESC Server builds

.PHONY: help clean build-pyinstaller build-nuitka build-nuitka-fast build-nuitka-folder test-build

help:
	@echo "ESC Server Build Targets:"
	@echo "  make build-pyinstaller  - Build with PyInstaller (faster build, larger size)"
	@echo "  make build-nuitka       - Build with Nuitka onefile (slow build, smaller size)"
	@echo "  make build-nuitka-fast  - Build with Nuitka folder (faster build for testing)"
	@echo "  make build-nuitka-folder - Build with Nuitka as folder distribution"
	@echo "  make clean              - Clean all build artifacts"
	@echo "  make test-build         - Test the built executable"

clean:
	@echo "Cleaning build artifacts..."
	rm -rf build/ dist/ dist-nuitka/ *.spec __pycache__/
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete

build-pyinstaller: clean
	@echo "Building with PyInstaller..."
	uv run pyinstaller \
		--onefile \
		--name esc-server \
		--hidden-import=tzlocal \
		--hidden-import=pydash \
		--hidden-import=smarttel \
		--collect-all=tzlocal \
		--collect-all=pydash \
		--collect-all=smarttel \
		main.py
	@echo "Build complete: dist/esc-server"

build-nuitka: clean
	@echo "Building with Nuitka (onefile mode - this will take 10-30 minutes)..."
	uv run python -m nuitka \
		--standalone \
		--onefile \
		--output-dir=dist-nuitka \
		--output-filename=esc-server \
		--assume-yes-for-downloads \
		--follow-imports \
		--include-package=api \
		--include-package=models \
		--include-package=services \
		--include-package=smarttel \
		--include-package=cli \
		--include-module=tzlocal \
		--include-module=pydash \
		--show-progress \
		--show-memory \
		main.py
	@echo "Build complete: dist-nuitka/esc-server"

build-nuitka-fast: clean
	@echo "Building with Nuitka (fast mode for testing)..."
	uv run python -m nuitka \
		--standalone \
		--output-dir=dist-nuitka \
		--output-filename=esc-server \
		--assume-yes-for-downloads \
		--follow-imports \
		--include-package=api \
		--include-package=models \
		--include-package=services \
		--include-package=smarttel \
		--include-package=cli \
		--include-module=tzlocal \
		--include-module=pydash \
		--show-progress \
		main.py
	@echo "Build complete: dist-nuitka/esc-server.dist/esc-server"

build-nuitka-folder: clean
	@echo "Building with Nuitka (folder distribution)..."
	uv run python -m nuitka \
		--standalone \
		--output-dir=dist-nuitka \
		--output-filename=esc-server \
		--assume-yes-for-downloads \
		--enable-plugin=anti-bloat \
		--follow-imports \
		--include-package=api \
		--include-package=models \
		--include-package=services \
		--include-package=smarttel \
		--include-package=cli \
		--include-module=tzlocal \
		--include-module=pydash \
		--include-module=uvicorn.workers \
		--include-module=uvicorn.protocols.http.h11_impl \
		--include-module=uvicorn.protocols.http.httptools_impl \
		--include-module=uvicorn.protocols.websockets.websockets_impl \
		--include-module=uvicorn.lifespan.on \
		--include-module=uvicorn.loops.auto \
		--include-module=uvicorn.logging \
		--show-progress \
		--show-memory \
		main.py
	@echo "Build complete: dist-nuitka/esc-server.dist/"
	@echo "Run with: dist-nuitka/esc-server.dist/esc-server --help"

test-build:
	@echo "Testing built executables..."
	@if [ -f dist/esc-server ]; then \
		echo "Testing PyInstaller build:"; \
		dist/esc-server --help || true; \
	fi
	@if [ -f dist-nuitka/esc-server ]; then \
		echo "Testing Nuitka onefile build:"; \
		dist-nuitka/esc-server --help || true; \
	fi
	@if [ -f dist-nuitka/esc-server.dist/esc-server ]; then \
		echo "Testing Nuitka folder build:"; \
		dist-nuitka/esc-server.dist/esc-server --help || true; \
	fi