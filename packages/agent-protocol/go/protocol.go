// Package protocol defines the WebSocket message types shared
// between the control plane (TypeScript/Zod) and the node agent (Go).
//
// Every message is wrapped in an Envelope with a string-encoded
// JSON payload that the receiver dispatches based on Type.
//
// Wire format: JSON. Field tags must stay in sync with the Zod
// schemas in packages/agent-protocol/src/index.ts.
package protocol

import "encoding/json"

// ── Envelope ────────────────────────────────────────────────────────────

// MessageType enumerates all valid message discriminators.
type MessageType string

const (
	TypeDeploy        MessageType = "deploy"
	TypeDeployResp    MessageType = "deploy_response"
	TypeGetStatus     MessageType = "get_status"
	TypeStatusResp    MessageType = "status_response"
	TypeStreamLogs    MessageType = "stream_logs"
	TypeLogEntry      MessageType = "log_entry"
	TypeHeartbeat     MessageType = "heartbeat"
	TypeHeartbeatAck  MessageType = "heartbeat_ack"
	TypeError         MessageType = "error"
)

// Envelope is the outer wrapper for every WebSocket message.
type Envelope struct {
	Type      MessageType     `json:"type"`
	ID        string          `json:"id"`
	Timestamp string          `json:"timestamp"`
	Payload   json.RawMessage `json:"payload"`
}

// ── AppSpec (wire format) ────────────────────────────────────────────────

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
	Name           string            `json:"name"`
	Image          string            `json:"image,omitempty"`
	BuildContext   string            `json:"buildContext,omitempty"`
	ComposeOverrides string          `json:"composeOverrides,omitempty"`
	EnvVars        map[string]string `json:"envVars"`
	Ports          []PortMapping     `json:"ports"`
	VolumeMounts   []VolumeMount     `json:"volumeMounts"`
	ResourceLimits *ResourceLimits   `json:"resourceLimits,omitempty"`
	HealthCheck    *HealthCheck      `json:"healthCheck,omitempty"`
}

// ── deploy / deploy_response ────────────────────────────────────────────

type DeployPayload struct {
	DeploymentID   string  `json:"deploymentId"`
	AppSpec        AppSpec `json:"appSpec"`
	ComposeContent string  `json:"composeContent,omitempty"`
}

type DeployResponsePayload struct {
	Accepted     bool   `json:"accepted"`
	DeploymentID string `json:"deploymentId"`
}

// ── get_status / status_response ────────────────────────────────────────

type ContainerInfo struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Image        string `json:"image"`
	State        string `json:"state"`
	PortMappings []struct {
		Host      int `json:"host"`
		Container int `json:"container"`
	} `json:"portMappings"`
}

type StatusResponsePayload struct {
	CPUPercent    float64         `json:"cpuPercent"`
	MemoryUsed    int64           `json:"memoryUsed"`
	MemoryTotal   int64           `json:"memoryTotal"`
	DiskUsed      int64           `json:"diskUsed"`
	DiskTotal     int64           `json:"diskTotal"`
	Containers    []ContainerInfo `json:"containers"`
	UptimeSeconds int64           `json:"uptimeSeconds"`
}

// ── stream_logs / log_entry ─────────────────────────────────────────────

type StreamLogsPayload struct {
	AppID  string `json:"appId"`
	Lines  int    `json:"lines"`
	Follow bool   `json:"follow"`
}

type LogEntryPayload struct {
	Timestamp string `json:"timestamp"`
	Stream    string `json:"stream"`
	Message   string `json:"message"`
}

// ── heartbeat / heartbeat_ack ───────────────────────────────────────────

// HeartbeatPayload is sent periodically by the node agent to report
// liveness and basic host facts. The control plane uses this to flip
// the server status to "online" and cache the metrics for get_server_status.
type HeartbeatPayload struct {
	ServerID      string  `json:"serverId"`
	Hostname      string  `json:"hostname"`
	CPUPercent    float64 `json:"cpuPercent"`
	MemoryUsed    int64   `json:"memoryUsed"`
	MemoryTotal   int64   `json:"memoryTotal"`
	DiskUsed      int64   `json:"diskUsed"`
	DiskTotal     int64   `json:"diskTotal"`
	UptimeSeconds int64   `json:"uptimeSeconds"`
}

type HeartbeatAckPayload struct {
	Timestamp string `json:"timestamp"`
}

// ── error ───────────────────────────────────────────────────────────────

type ErrorPayload struct {
	Code              string `json:"code"`
	Message           string `json:"message"`
	OriginalMessageID string `json:"originalMessageId"`
}
