# Architecture

This document describes the current architecture of the platform. For the phased build plan, see [`roadmap.md`](./roadmap.md).

## 1. Vision & Goals

An open-source platform that lets a non-technical person turn a VPS or bare-metal box into a running set of self-hosted apps, guided by an AI agent.

Design goals, in priority order:

1. Safety and reliability of the core engine.
2. A non-technical person can install and recover an app without reading docs.
3. The agent is a thin, auditable layer on top of a well-defined API — never raw shell access.
4. Single-VPS first. Multi-server, teams, and marketplace come later.
5. Self-hostable end to end, including the AI component (bring-your-own LLM key as an option).

Non-goals (v1): Kubernetes support, enterprise SSO, multi-region HA, arbitrary language buildpacks beyond Docker/Compose.

---

## 2. Guiding Principles

- **Compose is the source of truth.** Every app the platform manages is representable as a Docker Compose file.
- **The agent calls an API, never a shell.** All agent actions go through a fixed set of orchestration functions.
- **Confirm before anything destructive or resource-committing.** Deploys, deletes, and config changes that could cause downtime get a plain-language confirmation step.
- **Every agent action is deterministic and replayable.** The agent decides *what* to call; a non-AI code path executes it.
- **Explain, don't just execute.** Agent responses are plain language by default; logs are available on demand.

---

## 3. High-Level Architecture

```
┌───────────────────────────────────────────────────────────┐
│  Client (Web dashboard + chat UI, mobile later)            │
└───────────────────────────────────────────────────────────┘
                          │ HTTPS / WebSocket
┌───────────────────────────────────────────────────────────┐
│  Control Plane                                              │
│  ┌───────────────┐  ┌────────────────┐  ┌───────────────┐  │
│  │ API Gateway   │  │ Auth & Users   │  │ Event Bus /   │  │
│  │ (REST + WS)   │  │                │  │ Job Queue     │  │
│  └───────────────┘  └────────────────┘  └───────────────┘  │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ AI Agent Service                                       │ │
│  │  - intent parsing   - planning   - self-healing loop   │ │
│  │  - calls Orchestrator API only, via defined tool schema│ │
│  └───────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ Orchestrator API (the "tool surface")                  │ │
│  │  create_app · set_domain · provision_db · view_logs ·  │ │
│  │  restart · rollback · delete_app · get_server_status   │ │
│  └───────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ Postgres (platform state: apps, servers, users, plans) │ │
│  └───────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
                          │ WebSocket (mTLS)
┌───────────────────────────────────────────────────────────┐
│  Node Agent (small daemon installed on each managed server)│
│  - executes Docker/Compose commands                        │
│  - manages reverse proxy config (Traefik/Caddy)             │
│  - reports health, logs, metrics back to control plane      │
│  - obtains/renews TLS certs                                 │
└───────────────────────────────────────────────────────────┘
                          │
┌───────────────────────────────────────────────────────────┐
│  Docker Engine + Managed Apps + Reverse Proxy + Volumes     │
└───────────────────────────────────────────────────────────┘
```

Two deployable pieces: the **control plane** — a single SvelteKit/Bun application serving both the dashboard UI and the API/orchestrator/AI-agent logic via `+server.ts` routes — and a **Go node agent** installed on each managed VPS.

---

## 4. Core Components

### 4.1 Node Agent
- Go binary, installed via a one-line script (`curl | sh`), connects outbound to the control plane over WebSocket secured with mTLS.
- Responsibilities: pull/build images, run `docker compose up/down`, write proxy config, request/renew Let's Encrypt certs, stream logs and stats, run health checks, execute backup jobs.
- No decision-making — executes commands from the control plane only.

### 4.2 Orchestrator API (the tool surface)
Every action, whether from a human or the AI agent, goes through the same functions. This table also serves as the AI agent's function-calling schema.

| Function | Purpose | Confirmation required? |
|---|---|---|
| `resolve_app(query or repo_url)` | Match user intent to a template or infer a Compose spec from a repo | No |
| `plan_deploy(app_spec, server_id)` | Compute resource allocation, port, subdomain; returns a plan object | No |
| `create_app(plan_id)` | Execute a confirmed plan | Yes |
| `set_env(app_id, key, value)` | Update environment variables | Yes if app is running |
| `set_domain(app_id, domain)` | Attach a domain, trigger TLS issuance | Yes |
| `provision_db(app_id, engine)` | Spin up an attached database | Yes |
| `restart_app(app_id)` | Restart a container/stack | No |
| `rollback(app_id, version)` | Revert to previous known-good deployment | Yes |
| `delete_app(app_id)` | Tear down app and (optionally) volumes | Yes, explicit double-confirm |
| `get_logs(app_id, lines)` | Fetch recent logs | No |
| `get_server_status(server_id)` | CPU/RAM/disk headroom | No |
| `diagnose(app_id)` | Run structured checks (port conflicts, OOM, crashloop, cert failure) | No |

### 4.3 AI Agent Service
Stateless service that:
1. Takes the user's natural-language request + conversation history.
2. Calls `resolve_app` / `get_server_status` / `diagnose` as needed to gather context (read-only tools).
3. Produces a plan in plain language and structured form, and asks for confirmation before any state-changing tool.
4. On failure, calls `diagnose` and `get_logs`, then either retries with a fix or reports back with options.
5. Never receives raw SSH/shell access — its entire world is the Orchestrator API.

LLM access: `LLMProvider` interface (`chat(messages, tools) -> Response`). Bring-your-own-key (Anthropic/OpenAI-compatible) at launch; local-model support via Ollama planned behind the same interface, not built yet.

### 4.4 App Definition & Catalog
- Every app is a normalized spec: `{ image or build context, compose overrides, required env vars, exposed port, volume mounts, resource limits, health check }`.
- Catalog of curated templates ships with the platform (~15 to start: WordPress, Nextcloud, Ghost, n8n, Vaultwarden, Plausible, Postgres, Redis, Uptime Kuma, Immich, etc.).
- For anything not in the catalog, the agent infers a spec from a Git repo (Dockerfile or existing `docker-compose.yml`) and shows the inferred plan before deploying.

### 4.5 Reverse Proxy & TLS
- Traefik or Caddy, driven by labels/config generated by the node agent.
- Automatic subdomain assignment (`appname.yourdomain.com`) plus custom-domain support with guided DNS instructions.

### 4.6 Data Model (control plane, Postgres)
Core tables: `users`, `servers`, `apps`, `deployments` (versioned, for rollback), `env_vars` (encrypted at rest), `domains`, `backups`, `audit_log` (every action, human or agent, with actor and reasoning trace).

### 4.7 Observability
- Per-app logs and resource metrics, surfaced in the dashboard and as agent-readable structured data (what `diagnose` reads from).
- Platform-level: uptime checks per app, disk pressure alerts, cert expiry warnings — trigger the agent proactively.

### 4.8 Backups
- Scheduled volume + database dumps to S3-compatible storage (self-hostable via MinIO), restore exposed as an agent tool (`restore_backup`) with heavy confirmation.

### 4.9 Auth & Multi-Tenancy
- v1: single admin user per control-plane instance. Data model includes `team_id` from day one even though the UI doesn't expose teams yet.

---

## 5. Security & Guardrails

- Agent's LLM calls only the Orchestrator API tool schema — no shell, no direct DB access, no arbitrary code execution on the node.
- Every state-changing tool call requires explicit user confirmation or falls into a small, hard-coded "safe" allowlist (restart, view logs).
- Secrets (env vars, DB passwords) are encrypted at rest and never included in prompts sent to the LLM in plaintext.
- The "infer spec from arbitrary GitHub repo" path is rate-limited and sandboxed.
- Full audit trail of agent reasoning + actions, visible to the user.

---

## 6. Repository Structure & Technology

### 6.1 Language split

TypeScript (SvelteKit + Bun) for the control plane, which also serves the dashboard from the same app. Go is used only for the node agent (Docker Engine SDK, single static cross-compiled binary).

Control plane ↔ node agent: WebSocket + JSON, validated against shared Zod schemas.

### 6.2 Monorepo layout

```
/repo-root
  /apps
    /web                       # SvelteKit + TS + Bun — dashboard UI and control-plane API, one deployable
    /node-agent                 # Go module — installed on each managed VPS
  /packages
    /agent-protocol              # shared JSON/Zod schemas for the control-plane <-> node-agent WebSocket protocol
    /tool-schemas                 # JSON schema for orchestrator tools
  /templates                    # curated app catalog: compose specs + metadata
  /deploy                       # compose file / install script
  /docs
  /scripts
```

Only one Go module (`apps/node-agent`) — no `go.work` needed. No generated client SDK: the dashboard calls its own `+server.ts` routes directly.

### 6.3 Control plane internal structure

```
/apps/web/src
  /routes
    /api
      /apps/+server.ts         # REST handlers — call usecases, map HTTP <-> domain
      /servers/+server.ts
      /agent/chat/+server.ts   # SSE/WebSocket endpoint for the agent chat stream
    /(dashboard routes — pages, per 6.7)
    hooks.server.ts             # auth middleware, session handling
  /lib/server
    /domain                    # types: App, Server, Deployment, User
    /usecase                   # deployApp, rollbackApp, diagnoseApp, provisionDb
    /ports                     # interfaces: Repository, NodeAgentClient, LLMProvider, EventPublisher
    /adapters
      /db                      # Drizzle ORM implementation of Repository
      /node-agent-ws           # WebSocket server the node agent connects to; implements NodeAgentClient
      /llm
        /anthropic             # LLMProvider adapter for Claude API
        /ollama                # LLMProvider adapter for local models (Phase 4)
      /eventbus                # in-process event emitter
    /agent                     # AI agent service
      /tools                   # each orchestrator function as a self-describing Tool
      /planner                 # intent + context -> plan object
      /statemachine            # explicit deploy lifecycle states (see 6.4)
  /lib/components               # shared UI (shadcn-svelte / bits-ui based)
  drizzle.config.ts
```

Code under `src/lib/server` is never bundled to the client (SvelteKit convention) — this is where secrets and DB access live.

### 6.4 Design patterns in use

| Pattern | Where |
|---|---|
| Ports & Adapters (hexagonal) | Control plane core (`lib/server/usecase` + `ports`) |
| Repository pattern | Data access (`ports.Repository`, Drizzle adapter) |
| Strategy pattern | `LLMProvider` interface; container-runtime interface |
| Command pattern | Each orchestrator tool (`create_app`, `rollback`, etc.) — `validate()`, `execute()`, `undo()` where feasible |
| Explicit state machine | Deployment lifecycle: `pending → planning → awaiting_confirmation → executing → verifying → healthy / failed → (rolled_back)` |
| Observer / pub-sub | Deployment & health events → in-process event emitter → WebSocket gateway + audit logger + agent self-healing trigger |
| Adapter pattern | Reverse proxy backend (Traefik/Caddy); container runtime (Docker/containerd/k3s) |

### 6.5 Node agent structure

```
/apps/node-agent
  /cmd/agent/main.go
  /internal
    /docker          # Docker Engine SDK wrapper
    /proxy           # generates Traefik dynamic config from app specs
    /tls             # certificate lifecycle
    /health          # container/app health checks
    /backup          # scheduled dump + upload to S3-compatible storage
    /wsclient        # outbound-only mTLS WebSocket connection to the control plane
```

### 6.6 AI Agent service internals

```
/apps/web/src/lib/server/agent
  /tools
    create-app.ts        # wraps usecase.deployApp — Zod schema + execute()
    set-domain.ts
    diagnose.ts
    ...
  /planner
    planner.ts           # intent -> candidate plan
  /statemachine
    deployment-fsm.ts
  /llm
    provider.ts          # LLMProvider interface: chat(messages, tools) -> Response
```

### 6.7 Dashboard routes & shared frontend structure

Same app as the API (6.3) — SvelteKit's file-based routing interleaves page routes and API routes under one `src/routes` tree.

```
/apps/web/src/routes
  /(dashboard)
    /apps               # +page.svelte: list, [id]/+page.svelte: detail/logs/deploy wizard
    /servers             # server registration, status
    /agent-chat          # conversational install/troubleshoot UI
    /settings            # API key management, LLM provider config
    +layout.svelte        # shell: nav, auth guard, notifications
  /auth                  # login/setup pages
  /api                   # +server.ts route handlers, per 6.3
/apps/web/src/lib
  /components            # shared UI (shadcn-svelte / bits-ui based)
  /stores                 # Svelte stores for cross-route client state
  /ws                     # client-side WebSocket wrapper for live deploy logs + agent chat streaming
```

### 6.8 Technology by layer

| Layer | Technology |
|---|---|
| Node agent | Go, Docker Engine SDK, WebSocket client |
| Control plane + dashboard | SvelteKit + TypeScript, Bun runtime, `adapter-node` |
| Control-plane ↔ node-agent link | WebSocket + JSON, Zod schemas in `/packages/agent-protocol` |
| Persistence | PostgreSQL, Drizzle ORM, `drizzle-kit` for migrations |
| Event bus | In-process event emitter |
| Reverse proxy (managed nodes) | Traefik |
| AI agent / LLM | TypeScript, `LLMProvider` interface, `@anthropic-ai/sdk` first, Ollama later |
| Auth | SvelteKit `hooks.server.ts`, `Bun.password` (argon2id) |
| CI/CD | GitHub Actions, `goreleaser` for the node-agent binary, single Docker build for `apps/web` |
| Testing | Vitest + Playwright for `apps/web`; `testify` + `testcontainers-go` for the node agent |
| Observability | Prometheus client, structured logging (`pino`) |

### 6.9 Versioning & compatibility

Node agent versioned and released independently of the control plane. Control plane tracks a compatibility matrix and refuses to orchestrate a node agent version it doesn't recognize. Every WebSocket message carries a version field, checked on connect. The install script installs the node-agent version matching the control plane's expectations by default.

---

## 7. Key Decisions

| Decision | Choice |
|---|---|
| License | Apache 2.0 |
| LLM provider strategy | Bring-your-own-key (Anthropic/OpenAI-compatible) at launch; provider-agnostic `LLMProvider` interface; local-model support via Ollama designed for, not yet built |
| Backend language split | TypeScript (SvelteKit + Bun) for control plane and dashboard, one deployable; Go only for the node agent |
| Node-agent protocol | WebSocket + JSON with shared Zod schemas, not gRPC/protobuf |

## 8. Open Questions

- Business model, if any: pure open source community project, or open-core with a hosted control-plane offering later.

---

See [`roadmap.md`](./roadmap.md) for the phased build plan.
