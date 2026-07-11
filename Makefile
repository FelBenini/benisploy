BUN := $(shell command -v bun 2>/dev/null)
COMPOSE_FILE := docker-compose.dev.yml

.PHONY: setup dev test lint build clean db-up db-down db-reset db-migrate db-generate db-studio

setup:
	@if [ -z "$(BUN)" ]; then \
		echo "Installing Bun..."; \
		curl -fsSL https://bun.sh/install | bash; \
	fi
	bun install
	@echo ""
	@echo "Starting Postgres..."
	$(MAKE) db-up
	@echo ""
	@echo "Running database migrations..."
	$(MAKE) db-migrate
	@echo ""
	@echo "Make sure Go 1.22+ is installed: https://go.dev/dl/"

dev: db-up
	@trap 'kill 0' EXIT; \
	cd apps/web && bun run dev & \
	cd apps/node-agent && go run ./cmd/agent & \
	wait

test:
	@cd apps/web && bun run test
	@cd apps/node-agent && go test ./...

lint:
	@cd apps/web && bun run lint
	@cd apps/node-agent && golangci-lint run ./...

build:
	@cd apps/web && bun run build
	@cd apps/node-agent && go build -o ../../build/node-agent ./cmd/agent

db-up:
	@if docker compose -f $(COMPOSE_FILE) ps --status running --format '{{.Name}}' 2>/dev/null | grep -q postgres; then \
		echo "Postgres is already running."; \
	else \
		echo "Starting Postgres..."; \
		docker compose -f $(COMPOSE_FILE) up -d; \
		echo "Waiting for Postgres to be ready..."; \
		until docker compose -f $(COMPOSE_FILE) exec -T postgres pg_isready -U benisploy -d benisploy 2>/dev/null; do \
			sleep 1; \
		done; \
		echo "Postgres is ready!"; \
	fi

db-down:
	@echo "Stopping Postgres..."
	docker compose -f $(COMPOSE_FILE) down

db-reset:
	@echo "WARNING: This will delete all data in the database!"
	@read -p "Are you sure? [y/N] " confirm; \
	if [ "$$confirm" = "y" ] || [ "$$confirm" = "Y" ]; then \
		docker compose -f $(COMPOSE_FILE) down -v; \
		docker compose -f $(COMPOSE_FILE) up -d; \
		echo "Waiting for Postgres to be ready..."; \
		until docker compose -f $(COMPOSE_FILE) exec -T postgres pg_isready -U benisploy -d benisploy 2>/dev/null; do \
			sleep 1; \
		done; \
		$(MAKE) db-migrate; \
		echo "Database reset complete!"; \
	fi

db-migrate: db-up
	@cd apps/web && bun run db:migrate

db-generate:
	@cd apps/web && bun run db:generate

db-studio:
	@cd apps/web && bun run db:studio

clean:
	rm -rf apps/web/node_modules apps/web/dist apps/web/.svelte-kit build tmp
