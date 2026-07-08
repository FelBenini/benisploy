# Benisploy

**Benisploy** is an open-source, AI-agentic PaaS that turns a bare VPS into a self-hosted app platform. Guided by a conversational AI agent, anyone can deploy, manage, and recover apps without touching a terminal — powered by a deterministic orchestration engine grounded in Docker Compose.

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Go](https://img.shields.io/badge/Go-1.22+-00ADD8)](apps/node-agent)
[![Bun](https://img.shields.io/badge/Bun-1.2+-F9F9F9)](apps/web)

> **Status: Pre-Alpha** — not usable yet. Everything is in flux. Watch/star for updates.

- [Architecture Document](docs/ARCHITECTURE.md)
- [Contributing Guide](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)

## Monorepo Structure

```
/apps
  /web                       # SvelteKit + TS + Bun — dashboard UI and control-plane API, one deployable
  /node-agent                 # Go module — installed on each managed VPS
/packages
  /agent-protocol              # shared JSON/Zod schemas for control-plane <-> node-agent WS protocol
  /tool-schemas                 # JSON schema for orchestrator tools (source of truth for AI agent)
/templates                    # curated app catalog (future)
/deploy                       # compose file / install script (future)
/docs
/scripts
```

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design document.
