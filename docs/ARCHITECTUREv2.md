# Architecture (v2)

This document describes the current architecture of the platform. For the phased build plan, see [`roadmap.md`](./roadmap.md).

> **This is a revision of the original architecture doc.** The node-side design changed from a single, persistent Go daemon (WebSocket + custom mTLS PKI, doing everything from health reporting to Docker execution) to a split model: the control plane drives deployments over SSH using generated Docker Compose files and a minimal forced-command script, while a separate, small monitoring daemon handles node-initiated telemetry. See [§0 Changelog](#0-changelog-from-v1) for the full diff and rationale.

---

## 0. Changelog from v1

| Area | v1 | v2 | Why |
|---|---|---|---|
| Control channel (deploy, restart, rollback, etc.) | Persistent WebSocket to a Go node-agent daemon, custom message protocol, daemon translates `AppSpec` into Docker Engine SDK calls | SSH, invoked on demand by the control plane. The control plane generates a `docker-compose.yml` from the `AppSpec`, SFTPs it to the node, then runs a fixed set of `docker compose` commands via an SSH forced command | SSH already provides an authenticated channel capable of running `docker compose` directly — there's no need to reimplement Compose semantics as hand-mapped Docker SDK struct fields inside a custom daemon. This also makes "Compose is the source of truth" (§2) literally true rather than just descriptive: the generated file *is* the deploy artifact. |
| Node identity / auth for control actions | Client certificate, fingerprint looked up in `registered_nodes`, verified during a custom WS mTLS handshake (its own CA, CSR signing, cert renewal, and revocation-sweep subsystem) | SSH public key, looked up in `registered_nodes`, installed as a forced-command `authorized_keys` entry | Same trust model, a small fraction of the code and no custom PKI to build, operate, or eventually patch. Also closes a real bug class: in v1, a connecting client self-reported its identity in a message payload before any cryptographic binding was verified; in v2, identity *is* the SSH connection target, with nothing to spoof in-band. |
| Node-side control logic | A compiled Go program: parses WS messages, `switch`es on type, wraps the Docker Engine SDK (`ContainerCreate`/`Start`/`Remove`, network/volume/health-check config translation) | No compiled program. A small POSIX shell script, installed as the SSH forced command, reads a structured action (e.g. `deploy <app-id>`) from **stdin**, and runs one of a fixed set of `docker compose` invocations | The control plane already has to open the SSH connection; running `docker compose` over it is strictly less to build than reimplementing Compose semantics in a second language against a second SDK. Also eliminates an entire Go module's dependency-management surface (Docker SDK versioning, module-split issues) from the node side. |
| `AppSpec` → deployment translation | Lives on the node, in Go, mapped field-by-field to Docker SDK types (`container.Config`, `HostConfig`, `NetworkingConfig`) | Lives on the control plane, in TypeScript, as a **Compose YAML generator** | One implementation instead of two; testable with plain unit tests, no Docker daemon or SDK dependency required to test it. |
| Node-initiated telemetry (health, stats, crashloop/OOM detection) | Same WS connection as control, `heartbeat` messages | Separate, minimal daemon (**node monitor**) that only pushes stats and tails `docker events`, never receives commands, has no write access to the Docker API | Telemetry and control have different latency/availability needs and different trust requirements; splitting them lets each be sized — and privileged — appropriately instead of one channel/program serving both. |
| Node monitor auth | N/A (same channel and trust model as control) | Bearer token issued at registration, sent over HTTPS | Blast radius of a leaked token is "can push fake stats," not "can deploy or delete apps" — no need for cert-grade mutual auth on a read-only, non-destructive channel. |
| `diagnose(app_id)` | Ran fresh checks against the node at call time, every time | Reads primarily from telemetry already reported by the node monitor (recent events, health-check history); falls back to an on-demand SSH call only for point-in-time checks the monitor doesn't continuously track (e.g. port conflicts, env var validation) | Faster for the common case (no round trip), and matches the Phase 3 model where the monitor noticing a problem is what *triggers* diagnosis in the first place, rather than diagnosis re-discovering it from scratch. |
| Revocation | DB status flip + background sweep to force-close open WS connections within ~30s, plus certificate lifecycle management | Remove the SSH key from `authorized_keys`; rotate the monitor's bearer token | Revocation becomes a config edit on both channels, not a stateful sweep process or a certificate-lifecycle concern. |
| Node-side codebase | One Go module, one binary, bidirectional (control + telemetry combined) | One Go module (the monitor only) plus one uncompiled shell script (the forced command). No SDK-wrapping Go code on the node at all. | Smaller attack surface per component — the only always-running process on the node is read-only by construction and has no code path capable of creating, modifying, or deleting anything. |
| Command-injection defense | N/A — messages were structured JSON over a typed protocol, not shell text | Explicit design requirement: the forced-command script reads intent from **stdin as a structured payload**, never from `$SSH_ORIGINAL_COMMAND` — and never passes any client-influenced string through `eval`/`sh -c` | SSH forced commands still populate `$SSH_ORIGINAL_COMMAND` with whatever the client literally typed; treating that as trusted input would reintroduce shell-injection risk that the typed-message v1 protocol never had. Worth calling out explicitly now that node-side dispatch logic is a shell script rather than a program with a fixed type system. |
| Outbound connectivity requirement | Node dials out to control plane (NAT-friendly) | SSH requires the control plane to reach the node inbound; the monitor daemon still dials out (push-based) | Accepted trade-off for v1 scope ("Single-VPS first," per §1) — flagged as an open question for Phase 4 multi-server / non-public-IP support. See §8. |

---

## 1. Vision & Goals

*(Unchanged from v1.)*

An open-source platform that lets a non-technical person turn a VPS or bare-metal box into a running set of self-hosted apps, guided by an AI agent.

Design goals, in priority order:

1. Safety and reliability of the core engine.
2. A non-technical person can install and recover an app without reading docs.
3. The agent is a thin, auditable layer on top of a well-defined API — never raw shell access.
4. Single-VPS first. Multi-server, teams, and marketplace come later.
5. Self-hostable end to end, including the AI component (bring-your-own LLM key as an option).

Non-goals (v1): Kubernetes support, enterprise SSO, multi-region HA, arbitrary language buildpacks beyond Docker/Compose.

**v2 note on goal #3:** the AI agent still never gets shell access — it only ever calls the Orchestrator API, unchanged since v1. What changed is *where* the "never raw shell" guarantee is enforced for the Orchestrator API's own node-side execution: not by a typed Go program deciding what to do with a parsed message, but by the SSH forced command refusing to execute anything except a fixed `case` statement (§4.1), enforced by `sshd` itself, with the script written specifically to never pass client-supplied text through `sh -c`/`eval`.

---

## 2. Guiding Principles

- **Compose is the source of truth.** Every app the platform manages is representable as a Docker Compose file. **v2: this is now literally the on-node deploy artifact**, not just a conceptual description — the file the control plane generates is the exact file `docker compose` runs on the node.
- **The agent calls an API, never a shell.** Unchanged.
- **Confirm before anything destructive or resource-committing.** Unchanged.
- **Every agent action is deterministic and replayable.** Unchanged.
- **Explain, don't just execute.** Unchanged.
- **NEW — Control and telemetry are separate concerns.** Anything the control plane *initiates* (deploy, restart, delete, config change) goes over the SSH control channel. Anything the node *initiates* (stats, health signals, crash/OOM events) goes over the monitor channel. No component needs to do both, and no component needs privileges for both.
- **NEW — Node-side logic is minimized, not just isolated.** All deployment-shape decision-making (what a Compose file should contain) lives in exactly one place — the control plane. The node's control-side component isn't a second implementation of that logic, just a thin, fixed dispatcher with no decisions of its own to make.

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
│  │ Compose Generator  — AppSpec -> docker-compose.yml     │ │
│  └───────────────────────────────────────────────────────┘ │
│  ┌───────────────────────┐   ┌───────────────────────────┐ │
│  │ SSH/SFTP Client         │   │ Telemetry Ingest           │ │
│  │ (control, on-demand)    │   │ (receives monitor pushes)  │ │
│  └───────────────────────┘   └───────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ Postgres (platform state + recent telemetry/events)     │ │
│  └───────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
          │ SSH + SFTP (inbound to node,       │ HTTPS (outbound from
          │ forced command,                    │ node, bearer token,
          │ control-plane-initiated)            │ node-initiated push)
┌───────────────────────────────────────────────────────────┐
│  Managed Server                                             │
│  ┌───────────────────────────┐  ┌────────────────────────┐ │
│  │ Forced-command script       │  │ Node monitor daemon      │ │
│  │ (shell, not compiled;       │  │ (long-running; docker    │ │
│  │  reads action from stdin,   │  │  events tail + periodic  │ │
│  │  runs `docker compose`)     │  │  stats push; read-only   │ │
│  │                              │  │  Docker access)          │ │
│  └───────────────────────────┘  └────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
                          │
┌───────────────────────────────────────────────────────────┐
│  Docker Engine + Managed Apps + Reverse Proxy + Volumes     │
└───────────────────────────────────────────────────────────┘
```

**v2 change:** the single "Node Agent" box from v1 is gone. In its place: a **Compose Generator** on the control plane (new — this is where `AppSpec`→deployment translation now lives), a **forced-command shell script** on the node with no logic of its own beyond dispatching a fixed set of `docker compose` invocations, and a **node monitor** daemon that is the only long-running, compiled process on the node.

Two deployable pieces (same count as v1, different shape): the **control plane** (now also does Compose generation and SFTP delivery) and the **node monitor** (Go, the only compiled node-side component). The forced-command script isn't a "deployable" in the versioned-binary sense — it's a small install artifact copied once during node setup and rarely touched again.

---

## 4. Core Components

### 4.1 Node-Side Components *(replaces v1's "4.1 Node Agent")*

**Forced-command script (not a compiled program)**
- A POSIX shell script installed at a fixed path (e.g. `/opt/benisploy/bin/exec-command.sh`) during node registration.
- Installed as the forced command for a dedicated SSH key in `authorized_keys`:
  ```
  command="/opt/benisploy/bin/exec-command.sh",no-pty,no-port-forwarding,no-X11-forwarding,no-agent-forwarding ssh-ed25519 AAAA... node-<server-id>
  ```
- **Critical design constraint:** the script reads the requested action from **stdin as a structured payload** (e.g. `ACTION APP_ID`), never from `$SSH_ORIGINAL_COMMAND`. SSH forced commands still populate that environment variable with whatever the connecting client literally typed; treating it as trusted input and passing it through `sh -c`/`eval` would reintroduce shell injection. The client sends real intent over the already-authenticated SSH data channel (stdin) instead, and the script's `case` statement only ever invokes hardcoded, parameterized `docker compose` invocations — never a string built from client input.
- Validates any identifier used in a filesystem path (e.g. `APP_ID`) against a strict allowlist pattern (`^[a-zA-Z0-9_-]+$`) before it touches a path, to prevent path traversal.
- Supported actions map directly to a subset of the Orchestrator table (§4.2): `deploy`, `restart`, `stop`, `delete`, `status`, `logs`. Each is a single, fixed `docker compose` invocation against a per-app Compose file at a predictable path (`/opt/benisploy/apps/<app-id>/docker-compose.yml`).
- No build step, no version-compatibility matrix, no release pipeline — it's copied to the node once during install and rarely touched again. Updates are a file overwrite, not a binary swap.

**Node monitor**
- The only long-running, compiled process on the managed server.
- Responsibilities, and *only* these:
  - Periodically collect and push host stats (CPU/RAM/disk, container list + state) to the control plane's telemetry ingest endpoint.
  - Tail `docker events` for a small set of signals that matter for proactive triggers: container `die`, `oom`, `health_status: unhealthy`, restart-loop detection.
  - Push events to the control plane as they happen (not polled) — this is what preserves near-real-time crashloop/OOM detection that a pure poll-based design would lose.
- Uses only read-level Docker API calls (`ContainerList`, `ContainerInspect`, the `docker events` stream) — **it has no code path that calls `ContainerCreate`, `ContainerStart`, `ContainerRemove`, or anything else destructive.** This is a structural guarantee, not a policy: compromising this process cannot be used to deploy, modify, or delete an app.
- Authenticates to the control plane with a bearer token issued at node registration (stored in `registered_nodes` alongside the node's SSH public key), sent over HTTPS. No mTLS needed here — see §5.

### 4.2 Orchestrator API (the tool surface)

*(Function table unchanged from v1 — still every action's single entry point, whether from a human or the AI agent.)*

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

**v2 change — execution path per function:**

| Function | v2 execution path |
|---|---|
| `create_app` | Control plane generates `docker-compose.yml` from the `AppSpec`, SFTPs it to `/opt/benisploy/apps/<app-id>/`, then sends `deploy <app-id>` over the SSH exec channel → forced-command script runs `docker compose up -d`. |
| `set_env`, `set_domain`, `provision_db` | Control plane regenerates the Compose file (or proxy-config file, for `set_domain`) with the change applied, re-uploads via SFTP, sends `deploy <app-id>` again — `docker compose up -d` picks up the changed file and recreates only what changed. |
| `restart_app` | `restart <app-id>` → `docker compose restart`. |
| `rollback(app_id, version)` | Control plane re-uploads the *previous* version's Compose file (kept in the `deployments` table, §4.7), then `deploy <app-id>`. |
| `delete_app` | `delete <app-id>` → `docker compose down -v` (if volumes requested) + removes the app directory. |
| `get_logs` | `logs <app-id>` → `docker compose logs --tail N`, output parsed directly by the control plane. |
| `get_server_status` | Reads the *last-pushed* stats from Postgres (populated by the node monitor) rather than a live round trip to the node. Faster, and removes "node temporarily slow to answer a status poll" as a failure mode. |
| `diagnose` | See §4.3 — telemetry-first, falls back to `status <app-id>` (`docker compose ps --format json`) over SSH only for point-in-time checks the monitor doesn't track. |

### 4.3 `diagnose(app_id)` — telemetry-first, SSH as fallback

This is the one function whose *behavior*, not just its plumbing, changed from v1:

- **v1:** ran fresh structured checks against the node at call time, every time.
- **v2:** first reads from what the node monitor has already reported — recent `docker events` history, current health-check state, container restart counts — stored in Postgres. For the checks this covers (crashloop, OOM, health-check failures, cert-expiry-driven failures the monitor already surfaces), `diagnose` answers immediately with no round trip to the node.
- **Falls back to an on-demand SSH call** (`status <app-id>`) only for checks that are inherently point-in-time and not something a continuous monitor would naturally track: port conflicts, misconfigured env vars.
- **This also changes who initiates diagnosis in the common case.** In the proactive-agent model (Phase 3), it's the monitor noticing a `die`/`oom`/`unhealthy` event and pushing it that *triggers* the agent-initiated conversation in the first place — `diagnose` in that flow explains something already known, not discovering it from scratch. The fallback-to-SSH path is only exercised when a user or the agent asks "what's wrong?" for a class of problem the monitor doesn't watch continuously.

### 4.4 AI Agent Service

*(Unchanged from v1.)* Stateless service that:
1. Takes the user's natural-language request + conversation history.
2. Calls `resolve_app` / `get_server_status` / `diagnose` as needed to gather context (read-only tools).
3. Produces a plan in plain language and structured form, and asks for confirmation before any state-changing tool.
4. On failure, calls `diagnose` and `get_logs`, then either retries with a fix or reports back with options.
5. Never receives raw SSH/shell access itself — its entire world is the Orchestrator API. (The Orchestrator API's *own* implementation now uses SSH under the hood for some functions, per §4.1/§4.2 — the agent has no visibility into or access to that layer.)

LLM access: `LLMProvider` interface (`chat(messages, tools) -> Response`). Bring-your-own-key (Anthropic/OpenAI-compatible) at launch; local-model support via Ollama planned behind the same interface, not built yet.

### 4.5 App Definition & Catalog

Every app is a normalized spec: `{ image or build context, env vars, exposed ports, volume mounts, resource limits, health check }` — the `AppSpec`. **v2 addition:** since `AppSpec`→Compose translation now lives entirely on the control plane (§4.1's Compose Generator, with no second consumer in a different language constraining its shape), templates can more directly ship as near-literal Compose fragments with light templating for env vars, rather than needing a fully separate normalized intermediate format. Catalog of curated templates ships with the platform (~15 to start). For anything not in the catalog, the agent infers a spec from a Git repo and shows the inferred plan before deploying.

### 4.6 Reverse Proxy & TLS

Traefik or Caddy, driven by labels **generated directly in the Compose file** by the Compose Generator. Automatic subdomain assignment plus custom-domain support with guided DNS instructions — unchanged in behavior from v1, just generated in a different place.

### 4.7 Data Model (control plane, Postgres)

Core tables largely unchanged: `users`, `servers`, `apps`, `deployments`, `env_vars` (encrypted at rest), `domains`, `backups`, `audit_log`.

**v2 changes:**
- `registered_nodes`: stores each node's **SSH public key** and **monitor bearer token**. `status` (active/disabled/revoked) gates whether the SSH key is present in the generated `authorized_keys` and whether the bearer token is accepted.
- `deployments` **now stores the generated Compose YAML itself** (versioned, for rollback) rather than an abstract `AppSpec` snapshot — since the Compose file *is* the deployment artifact, storing it directly makes rollback a literal "re-upload this exact prior file" operation.
- **New:** a telemetry/event table (`node_events`) — recent `docker events`-derived signals pushed by the monitor daemon, retained for a rolling window (exact retention TBD), which `diagnose` and `get_server_status` read from instead of round-tripping to the node.
- `registration_tokens`: a one-time, TTL'd token used during node setup to register the SSH public key and issue the monitor's bearer token in one step.

### 4.8 Observability

Per-app logs and resource metrics, surfaced in the dashboard and as agent-readable structured data. Platform-level: uptime checks per app, disk pressure alerts, cert expiry warnings. **v2 change:** this data now arrives primarily via the monitor daemon's push channel rather than being polled by the control plane, which is what makes near-real-time crashloop/disk-pressure alerting practical without constant SSH round trips.

### 4.9 Backups

Scheduled volume + database dumps to S3-compatible storage (self-hostable via MinIO), restore exposed as an agent tool (`restore_backup`) with heavy confirmation. **v2:** triggered via the forced-command script's action set (a `backup`/`restore` action) rather than a resident daemon.

### 4.10 Auth & Multi-Tenancy

*(Unchanged from v1.)* v1: single admin user per control-plane instance. Data model includes `team_id` from day one even though the UI doesn't expose teams yet.

---

## 5. Security & Guardrails

- The SSH forced command is the enforcement point for "no shell, no arbitrary code execution on the node" — `sshd` itself refuses to run anything except the forced script, regardless of what the connecting side requests.
- **The forced-command script must never evaluate `$SSH_ORIGINAL_COMMAND` (or any other client-influenced string) as shell code.** All action intent is read from stdin as fixed-format data, and only ever used to select among hardcoded `docker compose` invocations or to fill validated, allowlist-checked path segments — never interpolated into a string that gets `eval`'d or passed to `sh -c`. This is worth stating as an explicit rule, not just an implementation detail, because it's easy to get subtly wrong in shell scripting in ways that a typed program wouldn't allow.
- **The node monitor's Docker API access is read-only by construction** — no destructive Docker SDK calls exist anywhere in its code path. A compromised monitor can lie about stats/events; it cannot deploy, modify, or delete anything.
- **Secrets** (env vars, DB passwords) are encrypted at rest and never included in prompts sent to the LLM in plaintext.
- **Revocation** is two separate, simple operations: remove the SSH key from the generated `authorized_keys` (control access gone immediately, enforced by `sshd`), and invalidate/rotate the bearer token (telemetry access gone on next push attempt). Neither requires connection-tracking or a polling sweep.
- **SFTP write access on the node should be scoped**, not general filesystem access — restrict it (via `ForceCommand`/`ChrootDirectory`/`internal-sftp` with a path restriction) to only the app directory tree (`/opt/benisploy/apps/`), so a compromised control-plane credential can't overwrite files outside it.
- **The "infer spec from arbitrary GitHub repo" path** is rate-limited and sandboxed.
- **Full audit trail** of agent reasoning + actions, visible to the user — now also recording which SSH exec calls and which Compose file version were applied, giving a literal command-level audit trail in addition to the Orchestrator-function-level one.

---

## 6. Repository Structure & Technology

### 6.1 Language split

TypeScript (SvelteKit + Bun) for the control plane — including **Compose YAML generation**. Go only for the node monitor; no compiled program at all on the node's control side.

Control plane ↔ node: SSH (exec + SFTP) for control, HTTPS (bearer token) for telemetry.

### 6.2 Monorepo layout

```
/repo-root
  /apps
    /web                       # SvelteKit + TS + Bun — dashboard, control-plane API, Compose generator
    /node-monitor                # Go module — the only compiled node-side component
  /packages
    /agent-protocol               # shared schemas: AppSpec + telemetry push payloads
    /tool-schemas                 # JSON schema for orchestrator tools
  /templates                    # curated app catalog: compose specs + metadata
  /deploy
    /node-setup                   # install script + the forced-command shell script + sshd_config snippet
  /docs
  /scripts
```

### 6.3 Control plane internal structure

```
/apps/web/src
  /routes
    /api
      /apps/+server.ts
      /servers/+server.ts
      /agent/chat/+server.ts
      /telemetry/ingest/+server.ts   # receives node-monitor pushes
    /(dashboard routes)
    hooks.server.ts
  /lib/server
    /domain
    /usecase
    /ports                       # NodeCommandClient, TelemetryIngest, LLMProvider, EventPublisher
    /adapters
      /db
      /node-ssh                  # SSH exec + SFTP client implementing NodeCommandClient
      /compose-gen                # AppSpec -> docker-compose.yml
      /telemetry                  # ingest handling + storage of node_events / latest stats
      /llm
      /eventbus
    /agent
      /tools
      /planner
      /statemachine
  /lib/components
  drizzle.config.ts
```

### 6.4 Design patterns in use

| Pattern | Where |
|---|---|
| Ports & Adapters (hexagonal) | Control plane core (`lib/server/usecase` + `ports`) |
| Repository pattern | Data access (`ports.Repository`, Drizzle adapter) |
| Strategy pattern | `LLMProvider` interface |
| Command pattern | Each orchestrator tool — maps onto "generate/upload a Compose file, then send one of six fixed action words over SSH" |
| Explicit state machine | Deployment lifecycle: `pending → planning → awaiting_confirmation → executing → verifying → healthy / failed → (rolled_back)` |
| Observer / pub-sub | Deployment & health events → in-process event emitter → WebSocket gateway + audit logger + agent self-healing trigger. Event *source* for health signals is the telemetry ingest endpoint receiving monitor pushes. |
| Adapter pattern | Reverse proxy backend (Traefik/Caddy); `node-ssh` adapter (paired with `compose-gen`, kept behind the `NodeCommandClient` port so the transport is swappable) |

### 6.5 Node-side structure

```
/deploy/node-setup
  install.sh                    # provisions the node: installs docker, creates the ssh user,
                                  # installs exec-command.sh, writes the authorized_keys entry,
                                  # installs and starts the node-monitor systemd service
  exec-command.sh                # the forced command — reads action from stdin, runs docker compose
  sshd-restrictions.conf          # ChrootDirectory/internal-sftp snippet scoping SFTP to /opt/benisploy/apps

/apps/node-monitor
  /cmd/monitor/main.go
  /internal
    /stats                      # host + container stats collection (read-only)
    /events                     # docker events tail, filtered to die/oom/unhealthy/restart-loop
    /push                       # HTTPS client, bearer-token auth, pushes to control plane
```

`exec-command.sh` lives under `/deploy`, not `/apps` — it's an install-time artifact, not a versioned application with its own build/release lifecycle. Note also that `node-monitor`'s internal packages have **no** package with Docker write access — it depends only on read-level Docker Engine SDK calls, kept in narrow `stats`/`events` packages. This is deliberate: giving the monitor compile-time access to destructive calls, even unused, would weaken "structurally cannot deploy or delete" down to "currently chooses not to."

### 6.6 Technology by layer

| Layer | Technology |
|---|---|
| Node control channel | SSH forced command (shell script) + SFTP — no compiled binary |
| Node monitor | Go, Docker Engine SDK (read-only calls), HTTPS client |
| Control plane ↔ node (control) | SSH exec + SFTP |
| Control plane ↔ node (telemetry) | HTTPS, bearer token, JSON push |
| Control plane + dashboard | SvelteKit + TypeScript, Bun runtime, `adapter-node` |
| Compose generation | TypeScript, control-plane-side |
| Persistence | PostgreSQL, Drizzle ORM, `drizzle-kit` for migrations |
| Event bus | In-process event emitter, fed by telemetry ingest |
| Reverse proxy (managed nodes) | Traefik, config generated directly into the Compose file |
| AI agent / LLM | TypeScript, `LLMProvider` interface, `@anthropic-ai/sdk` first, Ollama later |
| Auth (control plane) | SvelteKit `hooks.server.ts`, `Bun.password` (argon2id) |
| Auth (node control channel) | SSH key pair per node, forced command in `authorized_keys` |
| Auth (node telemetry channel) | Bearer token per node, issued at registration |
| CI/CD | GitHub Actions, `goreleaser` for the node-monitor binary, single Docker build for `apps/web` |
| Testing | Vitest + Playwright for `apps/web` (including Compose-generation unit tests); `testify` + `testcontainers-go` for `node-monitor` |
| Observability | Prometheus client, structured logging (`pino`) |

### 6.7 Versioning & compatibility

Only **one** compiled, versioned node-side component (`node-monitor`) — released independently of the control plane, tracked via a compatibility matrix, refused if unrecognized. The forced-command script is versioned informally (overwritten on each `install.sh` run); since it contains no business logic beyond dispatch, drift is low-risk, but it should still echo a version string on an unrecognized action so mismatches are detectable rather than silent.

---

## 7. Key Decisions

| Decision | Choice |
|---|---|
| License | Apache 2.0 |
| LLM provider strategy | Bring-your-own-key (Anthropic/OpenAI-compatible) at launch; provider-agnostic `LLMProvider` interface; local-model support via Ollama designed for, not yet built |
| Backend language split | TypeScript (SvelteKit + Bun) for control plane, dashboard, **and Compose generation**; Go only for the node monitor |
| **NEW — Control-channel transport** | **SSH exec + SFTP, forced command — not a custom WebSocket protocol + custom PKI** |
| **NEW — Telemetry-channel transport** | **HTTPS push with a bearer token, not the same channel as control** |
| **NEW — Node-side control logic** | **No compiled program. A minimal shell script dispatches a fixed set of `docker compose` invocations; all deployment-shape decisions are made on the control plane and shipped as a literal Compose file.** |
| Node-side process model | One long-running, minimal, read-only monitor daemon; no persistent or compiled control-side process |

---

## 8. Open Questions

- Business model, if any: pure open source community project, or open-core with a hosted control-plane offering later.
- **Phase 4 multi-server support** may include nodes that aren't publicly reachable on port 22 (residential NAT, etc.). The current SSH-inbound model assumes the control plane can reach the node directly. If that assumption breaks, options include a reverse SSH tunnel (the node dials out and holds the tunnel open) or a relay/bastion. Not a v1 blocker; worth deciding before Phase 4 design starts.
- **Exact retention window and schema** for the `node_events` telemetry table — how much history `diagnose` needs available locally vs. how much can be discarded after the relevant alert has fired.
- **Live `get_logs(follow=true)`** — served from the monitor's already-flowing stream, or kept as an on-demand SSH exec held open for the duration of a dashboard tab? Leaning toward the latter for v1 given the monitor wasn't scoped to carry full log volume; revisit if it doesn't scale.
- **`docker compose` version skew across nodes** — since the control plane generates Compose syntax directly with no SDK layer insulating against version differences, worth pinning a minimum supported `docker compose` version at node-install time and failing the install loudly if a node's version is older, rather than discovering a syntax incompatibility mid-deploy.

---

See [`roadmap.md`](./roadmap.md) for the phased build plan.
