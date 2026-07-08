# agent-protocol

Shared WebSocket message schemas for the control-plane ↔ node-agent protocol.

- **TypeScript (control plane):** Zod schemas for request/response validation.
- **Go (node agent):** Matching Go structs for deserialization.

This is the single source of truth for the wire format between the two deployable pieces.
