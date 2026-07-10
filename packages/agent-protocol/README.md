# agent-protocol

Shared WebSocket message schemas for the control-plane ↔ node-agent protocol.

## Package structure

```
packages/agent-protocol/
  src/index.ts          # Zod schemas (TypeScript / control plane)
  go/protocol.go        # Matching Go structs (node agent)
  go/protocol_test.go   # Round-trip JSON tests
```

## Wire format

Every WebSocket message is a JSON object with this envelope:

```json
{
  "type": "<message_type>",
  "id": "<unique_message_id>",
  "timestamp": "<ISO8601>",
  "payload": { /* type-specific fields */ }
}
```

`type` discriminates the message. The receiver dispatches based on `type`.

## Message types

| type (CP → Agent)  | Payload | type (Agent → CP) | Payload |
|---|---|---|---|
| `deploy` | `{ deploymentId, appSpec, composeContent? }` | `deploy_response` | `{ accepted, deploymentId }` |
| `get_status` | `{}` | `status_response` | `{ cpuPercent, memoryUsed, memoryTotal, diskUsed, diskTotal, containers[], uptimeSeconds }` |
| `stream_logs` | `{ appId, lines?, follow? }` | `log_entry` (stream) | `{ timestamp, stream, message }` |
| `heartbeat` | `{ serverId }` | `heartbeat_ack` | `{ timestamp }` |

Errors (either direction):

```json
{ "type": "error", "id": "…", "timestamp": "…", "payload": { "code": "…", "message": "…", "originalMessageId": "…" } }
```

## AppSpec wire format

`AppSpec` is the normalized representation of a Docker Compose app, shared between the orchestrator API and the node agent:

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Human-readable app name |
| `image` | string | see note | Docker image (e.g. `nginx:alpine`) |
| `buildContext` | string | see note | Git repo URL or tarball path |
| `composeOverrides` | string | no | Raw docker-compose YAML merged into the final compose file |
| `envVars` | object | no | `{ KEY: "value" }` |
| `ports` | array | no | `[{ container, protocol }]` |
| `volumeMounts` | array | no | `[{ source, target, mode }]` |
| `resourceLimits` | object | no | `{ cpus: "0.5", memoryMB: 256 }` |
| `healthCheck` | object | no | `{ test[], interval, timeout, retries, startPeriod }` |

Either `image` or `buildContext` must be set (not both, not neither).

All JSON keys use **camelCase** to match JavaScript conventions. The Go structs use `json:"..."` tags for the same keys.
