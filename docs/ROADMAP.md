# Roadmap

See [`architecture.md`](./architecture.md) for the system design this roadmap builds toward.

## Phase 0 — Foundations (2–4 weeks)
- Finalize the Orchestrator API contract (Section 4.2 of the architecture doc) — the spec everything else depends on.
- Node agent (Go): install script, Docker Compose execution, health reporting over the WebSocket protocol.
- Control plane (SvelteKit/Bun): auth, server registration, Postgres schema via Drizzle.
- No AI yet, no dashboard polish yet. **Goal:** deploy a Compose app via a raw API call and see it running.

## Phase 1 — Manual MVP Dashboard (4–6 weeks)
- Web UI: add server, browse catalog, deploy app, view logs/status, restart/delete.
- Traefik integration + automatic Let's Encrypt.
- 10–15 curated templates.
- **Goal:** a technical user can fully run the platform without touching a terminal. This validates the core engine before adding AI on top.

## Phase 2 — AI Agent Layer, v1 (4–6 weeks)
- Chat interface wired to the Orchestrator API via tool-calling.
- Flows: guided install from catalog, guided install from a Git repo URL, plain-language plan + confirmation, basic diagnose-and-retry on failed deploys.
- Audit log of agent reasoning + actions.
- **Goal:** a non-technical tester can install Nextcloud end-to-end talking to the agent, with zero prior knowledge of Docker/DNS/ports.

## Phase 3 — Self-Healing & Proactive Agent (4–6 weeks)
- Background monitoring triggers agent-initiated conversations (disk pressure, cert expiry, crashlooping container).
- Expanded `diagnose` coverage: port conflicts, OOM kills, misconfigured env vars, failed health checks.
- Backup/restore flows exposed to the agent.
- **Goal:** most common failure modes get fixed or explained without the user opening a terminal or filing a GitHub issue.

## Phase 4 — Scale Out (ongoing)
- Multi-server support (agent picks the right node based on capacity).
- Team accounts / roles.
- Expanded template marketplace, community-contributed specs (reviewed before trusted).
- Optional local-LLM mode for fully self-hosted AI.
