BUN := $(shell command -v bun 2>/dev/null)

.PHONY: setup dev test lint build clean db-migrate db-studio

setup:
	@if [ -z "$(BUN)" ]; then \
		echo "Installing Bun..."; \
		curl -fsSL https://bun.sh/install | bash; \
	fi
	bun install
	@echo ""
	@echo "Make sure Go 1.22+ is installed: https://go.dev/dl/"
	@echo "Make sure Docker is running for Postgres."

dev:
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

db-migrate:
	@cd apps/web && bun run db:migrate

db-studio:
	@cd apps/web && bun run db:studio

clean:
	rm -rf apps/web/node_modules apps/web/dist build tmp
