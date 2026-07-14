package protocol

import (
	"encoding/json"
	"testing"
)

func roundTrip[T any](t *testing.T, in T) T {
	t.Helper()
	data, err := json.Marshal(in)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var out T
	if err := json.Unmarshal(data, &out); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	return out
}

func TestAppSpecRoundTrip(t *testing.T) {
	in := AppSpec{
		Name:  "test-app",
		Image: "nginx:alpine",
		EnvVars: map[string]string{
			"FOO": "bar",
		},
		Ports: []PortMapping{
			{Container: 80, Protocol: "tcp"},
		},
		VolumeMounts: []VolumeMount{
			{Source: "data", Target: "/var/lib/data", Mode: "rw"},
		},
		ResourceLimits: &ResourceLimits{
			CPUs:     "0.5",
			MemoryMB: 256,
		},
		HealthCheck: &HealthCheck{
			Test: []string{"CMD-SHELL", "curl -f http://localhost || exit 1"},
		},
	}
	out := roundTrip(t, in)

	if out.Name != in.Name {
		t.Fatalf("Name: got %q, want %q", out.Name, in.Name)
	}
	if out.Image != in.Image {
		t.Fatalf("Image: got %q, want %q", out.Image, in.Image)
	}
	if out.EnvVars["FOO"] != "bar" {
		t.Fatal("EnvVars.FOO not preserved")
	}
	if out.ResourceLimits.CPUs != "0.5" {
		t.Fatal("ResourceLimits.CPUs not preserved")
	}
}

func TestDeployPayloadRoundTrip(t *testing.T) {
	in := DeployPayload{
		DeploymentID: "deploy-1",
		AppSpec: AppSpec{
			Name:  "myapp",
			Image: "redis:7",
		},
	}
	out := roundTrip(t, in)

	if out.DeploymentID != "deploy-1" {
		t.Fatalf("DeploymentID: got %q, want %q", out.DeploymentID, "deploy-1")
	}
	if out.AppSpec.Name != "myapp" {
		t.Fatalf("AppSpec.Name: got %q, want %q", out.AppSpec.Name, "myapp")
	}
}

func TestStatusResponsePayloadRoundTrip(t *testing.T) {
	in := StatusResponsePayload{
		CPUPercent:    45.2,
		MemoryUsed:    8_000_000_000,
		MemoryTotal:   16_000_000_000,
		DiskUsed:      200_000_000_000,
		DiskTotal:     500_000_000_000,
		Containers:    []ContainerInfo{
			{ID: "abc123", Name: "web", Image: "nginx:alpine", State: "running"},
		},
		UptimeSeconds: 3600,
	}
	out := roundTrip(t, in)

	if out.CPUPercent != 45.2 {
		t.Fatalf("CPUPercent: got %f, want %f", out.CPUPercent, 45.2)
	}
	if len(out.Containers) != 1 {
		t.Fatalf("expected 1 container, got %d", len(out.Containers))
	}
}

func TestEnvelopeRoundTrip(t *testing.T) {
	payload, _ := json.Marshal(HeartbeatPayload{ServerID: "srv-1"})
	in := Envelope{
		Type:      TypeHeartbeat,
		ID:        "msg-1",
		Timestamp: "2026-01-01T00:00:00Z",
		Payload:   payload,
	}
	out := roundTrip(t, in)

	if out.Type != TypeHeartbeat {
		t.Fatalf("Type: got %q, want %q", out.Type, TypeHeartbeat)
	}
	if out.ID != "msg-1" {
		t.Fatalf("ID: got %q, want %q", out.ID, "msg-1")
	}

	var hb HeartbeatPayload
	if err := json.Unmarshal(out.Payload, &hb); err != nil {
		t.Fatalf("unmarshal heartbeat payload: %v", err)
	}
	if hb.ServerID != "srv-1" {
		t.Fatalf("ServerID: got %q, want %q", hb.ServerID, "srv-1")
	}
}

func TestHeartbeatPayloadExtendedRoundTrip(t *testing.T) {
	in := HeartbeatPayload{
		ServerID:      "srv-ext",
		Hostname:      "myserver.local",
		CPUPercent:    42.5,
		MemoryUsed:    8_000_000_000,
		MemoryTotal:   16_000_000_000,
		DiskUsed:      200_000_000_000,
		DiskTotal:     500_000_000_000,
		UptimeSeconds: 7200,
	}
	out := roundTrip(t, in)

	if out.ServerID != "srv-ext" {
		t.Fatalf("ServerID: got %q, want %q", out.ServerID, "srv-ext")
	}
	if out.Hostname != "myserver.local" {
		t.Fatalf("Hostname: got %q, want %q", out.Hostname, "myserver.local")
	}
	if out.CPUPercent != 42.5 {
		t.Fatalf("CPUPercent: got %f, want %f", out.CPUPercent, 42.5)
	}
	if out.MemoryUsed != 8_000_000_000 {
		t.Fatalf("MemoryUsed: got %d, want %d", out.MemoryUsed, 8_000_000_000)
	}
	if out.MemoryTotal != 16_000_000_000 {
		t.Fatalf("MemoryTotal: got %d, want %d", out.MemoryTotal, 16_000_000_000)
	}
	if out.DiskUsed != 200_000_000_000 {
		t.Fatalf("DiskUsed: got %d, want %d", out.DiskUsed, 200_000_000_000)
	}
	if out.DiskTotal != 500_000_000_000 {
		t.Fatalf("DiskTotal: got %d, want %d", out.DiskTotal, 500_000_000_000)
	}
	if out.UptimeSeconds != 7200 {
		t.Fatalf("UptimeSeconds: got %d, want %d", out.UptimeSeconds, 7200)
	}
}

func TestStreamLogsPayloadRoundTrip(t *testing.T) {
	in := StreamLogsPayload{
		AppID:  "app-1",
		Lines:  200,
		Follow: true,
	}
	out := roundTrip(t, in)

	if out.AppID != "app-1" {
		t.Fatalf("AppID: got %q, want %q", out.AppID, "app-1")
	}
	if out.Lines != 200 {
		t.Fatalf("Lines: got %d, want %d", out.Lines, 200)
	}
	if !out.Follow {
		t.Fatal("Follow should be true")
	}
}

func TestErrorPayloadRoundTrip(t *testing.T) {
	in := ErrorPayload{
		Code:              "DEPLOY_FAILED",
		Message:           "container exited immediately",
		OriginalMessageID: "msg-42",
	}
	out := roundTrip(t, in)

	if out.Code != "DEPLOY_FAILED" {
		t.Fatalf("Code: got %q, want %q", out.Code, "DEPLOY_FAILED")
	}
}

func TestDeployResponsePayloadRoundTrip(t *testing.T) {
	in := DeployResponsePayload{
		Accepted:     true,
		DeploymentID: "deploy-42",
	}
	out := roundTrip(t, in)

	if !out.Accepted {
		t.Fatal("Accepted should be true")
	}
	if out.DeploymentID != "deploy-42" {
		t.Fatalf("DeploymentID: got %q, want %q", out.DeploymentID, "deploy-42")
	}
}

func TestHeartbeatAckPayloadRoundTrip(t *testing.T) {
	in := HeartbeatAckPayload{
		Timestamp: "2026-07-10T12:00:00Z",
	}
	out := roundTrip(t, in)

	if out.Timestamp != "2026-07-10T12:00:00Z" {
		t.Fatalf("Timestamp: got %q, want %q", out.Timestamp, "2026-07-10T12:00:00Z")
	}
}

func TestLogEntryPayloadRoundTrip(t *testing.T) {
	in := LogEntryPayload{
		Timestamp: "2026-07-10T12:00:00Z",
		Stream:    "stdout",
		Message:   "Server started",
	}
	out := roundTrip(t, in)

	if out.Stream != "stdout" {
		t.Fatalf("Stream: got %q, want %q", out.Stream, "stdout")
	}
	if out.Message != "Server started" {
		t.Fatalf("Message: got %q, want %q", out.Message, "Server started")
	}
}
