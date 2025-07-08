# Makefile for Telescope Control Application

.PHONY: help dev prod build start stop restart logs clean test test-backend test-frontend test-coverage lint health

# Default target
help: ## Show this help message
	@echo "Telescope Control Application - Docker Commands"
	@echo "================================================"
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ { printf "  %-15s %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

# Development commands
dev: ## Start development environment
	docker-compose up -d
	@echo "🚀 Development environment started!"
	@echo "UI: http://localhost:3000"
	@echo "API: http://localhost:8000"

prod: ## Start production environment
	docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
	@echo "🚀 Production environment started!"
	@echo "Application: http://localhost"

build: ## Build all containers
	docker-compose build

build-clean: ## Build all containers without cache
	docker-compose build --no-cache

fix-server-permissions: ## Fix server permission issues using multistage build
	@echo "🔧 Switching to server multistage Dockerfile..."
	@sed -i.bak 's/dockerfile: Dockerfile/dockerfile: Dockerfile.multistage/' docker-compose.yml
	docker-compose build server --no-cache
	@echo "✅ Server rebuilt with permission fixes"

fix-ui-permissions: ## Fix UI permission issues using multistage build
	@echo "🔧 Switching to UI multistage Dockerfile..."
	@sed -i.bak 's/dockerfile: Dockerfile/dockerfile: Dockerfile.multistage/' docker-compose.yml
	docker-compose build ui --no-cache
	@echo "✅ UI rebuilt with permission fixes"

restore-dockerfiles: ## Restore original Dockerfiles in docker-compose.yml
	@echo "🔄 Restoring original Dockerfiles..."
	@sed -i.bak 's/dockerfile: Dockerfile.multistage/dockerfile: Dockerfile/' docker-compose.yml
	@echo "✅ Restored to original Dockerfiles"

# Container management
start: ## Start all services
	docker-compose start

stop: ## Stop all services
	docker-compose stop

restart: ## Restart all services
	docker-compose restart

down: ## Stop and remove containers
	docker-compose down

down-clean: ## Stop containers and remove volumes
	docker-compose down -v

# Logs and monitoring
logs: ## Show logs for all services
	docker-compose logs -f

logs-ui: ## Show UI logs
	docker-compose logs -f ui

logs-server: ## Show server logs
	docker-compose logs -f server

logs-redis: ## Show Redis logs
	docker-compose logs -f redis

# Development tools
shell-ui: ## Open shell in UI container
	docker-compose exec ui sh

shell-server: ## Open shell in server container
	docker-compose exec server bash

shell-redis: ## Open Redis CLI
	docker-compose exec redis redis-cli

# Testing and linting
test: test-frontend test-backend ## Run all tests (frontend and backend)
	@echo "✅ All tests completed!"

test-frontend: ## Run frontend tests in UI container
	docker-compose exec ui npm test

test-backend: ## Run backend tests with coverage
	docker-compose exec server uv run pytest tests/ --cov=. --cov-report=term-missing --cov-report=html
	@echo "✅ Backend tests completed!"

test-coverage: ## Run all tests with coverage
	@echo "🧪 Running frontend tests with coverage..."
	docker-compose exec ui npm run test:coverage
	@echo "🧪 Running backend tests with coverage..."
	docker-compose exec server uv run pytest tests/ --cov=. --cov-report=term-missing --cov-report=html
	@echo "✅ Coverage reports generated!"
	@echo "Frontend coverage: ui/coverage/"
	@echo "Backend coverage: server/htmlcov/"

lint: ## Run linting
	docker-compose exec ui npm run lint

# Health and status
health: ## Check service health
	@echo "Checking service health..."
	@curl -s http://localhost:3000/api/health && echo "✅ UI healthy" || echo "❌ UI unhealthy"
	@curl -s http://localhost:8000/health && echo "✅ Server healthy" || echo "❌ Server unhealthy"

status: ## Show container status
	docker-compose ps

# Maintenance
clean: ## Clean up Docker resources
	docker system prune -f
	docker volume prune -f

clean-all: ## Clean up all Docker resources (dangerous!)
	docker system prune -a -f
	docker volume prune -f

update: ## Pull latest images and restart
	docker-compose pull
	docker-compose up -d

# Setup
setup: ## Initial setup - copy env file and start development
	@if [ ! -f .env ]; then cp .env.example .env; echo "📄 Created .env file from example"; fi
	$(MAKE) dev

# Backup and restore
backup: ## Backup Redis data and configuration
	@mkdir -p backup
	docker-compose exec redis redis-cli BGSAVE
	docker cp $$(docker-compose ps -q redis):/data/dump.rdb ./backup/
	tar -czf backup/config-$$(date +%Y%m%d-%H%M%S).tar.gz .env docker-compose.yml
	@echo "💾 Backup completed in ./backup/"

# Network debugging
network: ## Show network information
	docker network ls
	docker network inspect $$(docker-compose ps --services | head -1 | xargs -I {} docker inspect {}  | jq -r '.[0].NetworkSettings.Networks | keys[0]') 2>/dev/null || echo "Network info unavailable"

# Resource monitoring
stats: ## Show container resource usage
	docker stats --no-stream

# Quick commands for common tasks
quick-restart: stop start ## Quick restart without rebuild
rebuild: down build dev ## Rebuild and start development
fresh-start: down-clean build dev ## Complete fresh start

# Permission fix commands
fix-permissions: fix-server-permissions fix-ui-permissions ## Fix both server and UI permission issues