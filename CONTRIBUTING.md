# Contributing

## Commit Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add deployment rollback endpoint
fix: handle port conflict on re-deploy
chore: update dependencies
docs: add database architecture notes
refactor: extract LLM provider strategy
test: add node agent health check tests
```

## Local Development

### Prerequisites

- [Bun](https://bun.sh) 1.2+
- [Go](https://go.dev/dl/) 1.22+
- [Docker](https://docs.docker.com/get-docker/) (for Postgres and container testing)
- [golangci-lint](https://golangci-lint.run/) (optional, for linting Go code)

### Setup

```bash
make setup
```

This installs Bun (if missing), runs `bun install`, and prints Go/Docker reminders.

### Running the dev server

```bash
make dev
```

Starts the SvelteKit control plane + dashboard at `http://localhost:5173`.

### Node Agent (Go)

```bash
cd apps/node-agent && go run ./cmd/agent
```

### Database

Migrations are managed with Drizzle Kit:

```bash
make db-migrate
make db-studio     # Opens Drizzle Studio for browsing data
```

### Testing

```bash
make test          # Runs both TS and Go tests
```

### Linting

```bash
make lint
```

## Pull Request Workflow

1. Create a feature branch from `main`.
2. Make your changes. Keep commits small and well-named per the convention above.
3. Open a PR against `main`. CI must pass before merge.
4. At least one review is required before merging.

## Architecture

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before making significant changes — it describes the component boundaries and design patterns used throughout the project.
