// Package protocol defines the shared wire protocol between the control plane
// and the node monitor.
//
// The TypeScript implementation (packages/agent-protocol/src/index.ts)
// remains the source of truth. This package mirrors the JSON schema for Go
// producers.
//
// NOTE:
// The node monitor no longer consumes command messages. This package now
// contains only the shared envelope, AppSpec (still used elsewhere), and
// telemetry push payloads.
package protocol

import "encoding/json"

// ─────────────────────────────────────────────────────────────────────────────
// Envelope
// ─────────────────────────────────────────────────────────────────────────────

type MessageType string

const (
	TypeStatsPush MessageType = "stats_push"
	TypeEventPush MessageType = "event_push"
)

type Envelope struct {
	Type      MessageType     `json:"type"`
	ID        string          `json:"id"`
	Timestamp string          `json:"timestamp"`
	Payload   json.RawMessage `json:"payload"`
}

// ─────────────────────────────────────────────────────────────────────────────
// AppSpec (shared wire format)
// ─────────────────────────────────────────────────────────────────────────────

type HealthCheck struct {
	Test        []string `json:"test"`
	Interval    int      `json:"interval"`
	Timeout     int      `json:"timeout"`
	Retries     int      `json:"retries"`
	StartPeriod int      `json:"startPeriod"`
}

type ResourceLimits struct {
	CPUs     string `json:"cpus"`
	MemoryMB int    `json:"memoryMB"`
}

type VolumeMount struct {
	Source string `json:"source"`
	Target string `json:"target"`
	Mode   string `json:"mode"`
}

type PortMapping struct {
	Container int    `json:"container"`
	Protocol  string `json:"protocol"`
}

type AppSpec struct {
	Name             string            `json:"name"`
	Image            string            `json:"image,omitempty"`
	BuildContext     string            `json:"buildContext,omitempty"`
	ComposeOverrides string            `json:"composeOverrides,omitempty"`
	EnvVars          map[string]string `json:"envVars"`
	Ports            []PortMapping     `json:"ports"`
	VolumeMounts     []VolumeMount     `json:"volumeMounts"`
	ResourceLimits   *ResourceLimits   `json:"resourceLimits,omitempty"`
	HealthCheck      *HealthCheck      `json:"healthCheck,omitempty"`
}

// ─────────────────────────────────────────────────────────────────────────────
// Telemetry
// ─────────────────────────────────────────────────────────────────────────────

type MemoryStats struct {
	Total     uint64 `json:"total"`
	Used      uint64 `json:"used"`
	Available uint64 `json:"available"`
}

type DiskStats struct {
	Total uint64 `json:"total"`
	Used  uint64 `json:"used"`
}

type ContainerState struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	State string `json:"state"`
}

type StatsPushPayload struct {
	CPUPercent      float64          `json:"cpuPercent"`
	Memory          MemoryStats      `json:"memory"`
	Disk            DiskStats        `json:"disk"`
	Uptime          uint64           `json:"uptime"`
	ContainerCount  int              `json:"containerCount"`
	ContainerStates []ContainerState `json:"containerStates"`
}

type EventType string

const (
	EventDie         EventType = "die"
	EventOOM         EventType = "oom"
	EventUnhealthy   EventType = "unhealthy"
	EventRestartLoop EventType = "restart_loop"
)

type EventPushPayload struct {
	EventType     EventType              `json:"eventType"`
	ContainerID   string                 `json:"containerId"`
	ContainerName string                 `json:"containerName"`
	AppID         *string                `json:"appId,omitempty"`
	Timestamp     string                 `json:"timestamp"`
	Extra         map[string]interface{} `json:"extra"`
}

