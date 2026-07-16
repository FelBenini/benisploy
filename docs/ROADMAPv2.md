# Roadmap (v2)

See [`architecture-v2.md`](./architecture-v2.md) for the system design this roadmap builds toward.

> **This is a revision of the original roadmap**, following the node-side architecture change described in `architecture-v2.md` §0 (persistent WebSocket + custom mTLS daemon that wrapped the Docker SDK → SSH-driven deploys using control-plane-generated Compose files and a thin forced-command script, plus a separate lightweight monitor daemon). Changes are called out inline; everything not marked is unchanged.

---

## 0. Changelog from v1

| Phase | v1 | v2 | Why |
|---|---|---|---|
| Phase 0 | One Go "node agent": install script, Compose execution, health reporting — all over a custom WebSocket protocol, wrapping the Docker Engine SDK | Control-plane-side **Compose Generator** (TypeScript) turns `AppSpec` into `docker-compose.yml`; a thin **forced-command shell script** on the node dispatches a fixed set of `docker compose` calls over SSH; a separate, minimal **node monitor** (Go) handles health/stats/event push. Node registration issues an SSH key pair + bearer token instead of bootstrapping a custom CA. | Removes an entire custom PKI (CA bootstrap, CSR signing, cert renewal, revocation sweep) *and* an entire Go module that reimplemented Compose semantics via the Docker SDK — both replaced by SSH running `docker compose` directly, which is strictly less to build. |
| Phase 0 | No dedicated security/PKI milestone called out explicitly | SSH key provisioning + forced-command setup is scoped as part of Phase 0 from the start | Simple enough (standard SSH key management) to estimate and plan up front rather than discovered mid-build. |
| Phase 0 | `deployments` table implied to store a normalized `AppSpec` snapshot | `deployments` stores the generated Compose YAML directly | The Compose file *is* the deploy artifact now, so storing it directly makes rollback a literal "re-upload this exact prior file" operation. |
| Phase 1 | Dashboard log/status views implied to hit the node agent live | Status reads from telemetry the monitor already pushed (fast, cached); logs use an on-demand `docker compose logs` call via the forced-command script | No goal change, but worth noting explicitly since it affects what "view logs/status" calls under the hood. |
| Phase 1 | No mention of Compose-version compatibility | Node install step pins/verifies a minimum `docker compose` version | New risk introduced by generating Compose syntax directly with no SDK layer insulating against version skew — cheap to close off early. |
| Phase 2 | `diagnose-and-retry` flow unspecified in mechanism | Explicitly telemetry-first (reads what the monitor already reported), falls back to an on-demand `status` call via the forced-command script only for point-in-time checks | Directly follows from `architecture-v2.md` §4.3. Affects what "basic diagnose" can cover on day one of Phase 2. |
| Phase 3 | "Background monitoring triggers agent-initiated conversations" was new work for Phase 3 | The event-push mechanism this depends on (monitor watching `docker events` for die/oom/unhealthy/crashloop) is **built in Phase 0**, not Phase 3 | Biggest schedule change: Phase 3's headline feature no longer requires building its own monitoring infrastructure, only the agent-facing conversation layer on top of infrastructure already running since Phase 0. |
| Phase 4 | Multi-server assumed nodes are reachable the same way regardless of count | Explicit open question: SSH-inbound requires the control plane to reach the node directly; nodes behind NAT/no public IP need a reverse-tunnel or bastion story before they can be supported | Flagged in `architecture-v2.md` §8 as unresolved; surfaced here so it isn't discovered mid-Phase-4. |
| All phases | Node-side testing entirely in Go (`testify`/`testcontainers-go`) | Node-side deploy-logic testing moves to Vitest (Compose generation, control-plane-side, no Docker daemon required to test); `testify`/`testcontainers-go` narrows to covering only the node monitor | Removes the Docker-SDK dependency-resolution friction that came with testing Go code against the Docker Engine SDK; Compose YAML generation is plain, easily-unit-tested templating logic. |

---

## Phase 0 — Foundations (2–4 weeks)

- Finalize the Orchestrator API contract (§4.2 of the architecture doc) — the spec everything else depends on. **Unchanged** in purpose, though the contract's node-side execution mapping now references six fixed forced-command actions (`deploy`/`restart`/`stop`/`delete`/`status`/`logs`) instead of a WebSocket message schema.
- **Compose Generator (TypeScript, control plane):** `AppSpec` → `docker-compose.yml`, including env vars, ports, volumes, resource limits, health checks, and Traefik proxy labels. Straightforward templating/serialization, unit-testable without a Docker daemon. *(Replaces: "Node agent — Docker Compose execution... over the WebSocket protocol.")*
- **SSH/SFTP adapter (TypeScript, control plane):** SFTPs the generated Compose file to `/opt/benisploy/apps/<app-id>/docker-compose.yml` on the target node, then sends one of the fixed action words over an SSH exec session.
- **Forced-command script (shell, node-side):** installed once per node during setup; reads an action from stdin, dispatches to `docker compose`. No build step, no release pipeline.
- **Node monitor (Go, new as an explicit Phase 0 deliverable, not deferred to Phase 3):** minimal long-running daemon — periodic stats push (CPU/RAM/disk, container list/state) and a `docker events` tail for `die`/`oom`/`unhealthy`/restart-loop signals, pushed to a telemetry ingest endpoint. Read-only Docker API access only; no deploy/write code path.
- **Node registration flow:** generates an SSH key pair + bearer token per node at registration time, installs the forced-command `authorized_keys` entry (with SFTP access scoped to the app directory tree only), stores both in `registered_nodes`.
- Control plane (SvelteKit/Bun): auth, server registration, Postgres schema via Drizzle, plus a telemetry ingest endpoint and a `node_events` table.
- No AI yet, no dashboard polish yet.
- **Goal:** deploy a Compose app by generating its Compose file on the control plane, shipping it to the node via SFTP, and applying it via a single SSH exec call to the forced-command script — and see it running, with basic live stats/events arriving from the node monitor for that same node.

**Net effect on Phase 0 scope:** smaller than the original plan. You're not building a custom PKI, and you're not writing/testing/maintaining a Go module that wraps the Docker Engine SDK — deployment logic becomes Compose-YAML generation in the same language and codebase as the rest of the control plane.

---

## Phase 1 — Manual MVP Dashboard (4–6 weeks)

- Web UI: add server, browse catalog, deploy app, view logs/status, restart/delete.
  - "View status": reads from telemetry the node monitor already pushed (fast DB read), not a live round-trip to the node.
  - "View logs": `docker compose logs --tail N` via the forced-command script, output parsed directly.
  - "Restart"/"Delete": single forced-command actions (`restart`/`delete`).
- Traefik integration + automatic Let's Encrypt — generated directly as labels in the Compose file by the Compose Generator.
- 10–15 curated templates — can ship closer to literal Compose fragments with light templating for env vars, since there's no second consumer in a different language constraining the template format. Worth settling the exact template format during this phase.
- **New for this phase:** node install step verifies the node's `docker compose` version meets a pinned minimum and fails the install with a clear message if not.
- **Goal:** a technical user can fully run the platform without touching a terminal. **Unchanged.**

---

## Phase 2 — AI Agent Layer, v1 (4–6 weeks)

- Chat interface wired to the Orchestrator API via tool-calling. **Unchanged.**
- Flows: guided install from catalog, guided install from a Git repo URL, plain-language plan + confirmation. **Unchanged.**
- **Basic diagnose-and-retry on failed deploys** — telemetry-first: a failed deploy's `diagnose` call reads whatever the node monitor already captured (container exited immediately, OOM, health check failing) before falling back to an on-demand `status` call via the forced-command script for anything not already visible. Smaller lift than "run fresh checks every time," since the crashloop/OOM/unhealthy signals are already flowing from Phase 0.
- Audit log of agent reasoning + actions — now includes the underlying SSH exec calls and which Compose file version was applied, giving a literal command-level audit trail alongside the Orchestrator-function-level one.
- **Goal:** a non-technical tester can install Nextcloud end-to-end talking to the agent, with zero prior knowledge of Docker/DNS/ports. **Unchanged.**

---

## Phase 3 — Self-Healing & Proactive Agent (4–6 weeks)

*(The most reduced phase — its foundational infrastructure moved to Phase 0.)*

- ~~Background monitoring triggers agent-initiated conversations~~ — **the monitoring/triggering plumbing (disk pressure, cert expiry, crashlooping container detection) already exists as of Phase 0.** What's left for Phase 3 is specifically the **agent-facing layer on top of it**: turning a pushed event into a plain-language, agent-initiated conversation with a proposed fix.
- Expanded `diagnose` coverage: port conflicts, misconfigured env vars — **remain genuinely new Phase 3 work**, since they're point-in-time checks the monitor doesn't (and structurally shouldn't) continuously track; implemented as additional forced-command actions or extensions to `status`. OOM kills and failed health checks, by contrast, are **already covered** by Phase 0's monitor — what's new for them in Phase 3 is the agent turning an already-detected event into a self-healing action, not detecting the event itself.
- Backup/restore flows exposed to the agent — executed via the forced-command script's action set (a `backup`/`restore` action addition).
- **Goal:** most common failure modes get fixed or explained without the user opening a terminal or filing a GitHub issue. **Unchanged goal, meaningfully de-risked**: the hardest part (reliable, timely failure detection) has been running since Phase 0 rather than being built and proven in the same phase it's first relied upon.

**Net effect on Phase 3 scope:** smaller. Consider reallocating the freed time to hardening the Phase 0 monitor (retention policy for `node_events`, false-positive tuning on crashloop detection) rather than shortening the phase outright — better to spend it making the detection layer trustworthy than to ship the agent layer on top of an undertested signal source.

---

## Phase 4 — Scale Out (ongoing)

- **Multi-server support (agent picks the right node based on capacity)** — **flagged prerequisite:** confirm whether Phase 4 needs to support nodes without a direct inbound path from the control plane (residential NAT, no public IP). The current SSH-inbound control channel assumes direct reachability. If it needs to be supported, resolve the reverse-tunnel-vs-bastion question (`architecture-v2.md` §8) as a design task *before* multi-server implementation starts.
- Team accounts / roles. **Unchanged.**
- Expanded template marketplace, community-contributed specs (reviewed before trusted) — **slightly easier now**, since contributed specs can lean closer to raw Compose fragments rather than needing to conform to a format also consumed by a Go SDK-mapping layer. Still needs the same review-before-trusted process given these run on user infrastructure.
- Optional local-LLM mode for fully self-hosted AI. **Unchanged.**

---

See [`architecture-v2.md`](./architecture-v2.md) for the full system design.
