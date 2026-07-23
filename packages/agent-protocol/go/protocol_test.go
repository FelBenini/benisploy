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
			{
				Container: 80,
				Protocol:  "tcp",
			},
		},
		VolumeMounts: []VolumeMount{
			{
				Source: "data",
				Target: "/var/lib/data",
				Mode:   "rw",
			},
		},
		ResourceLimits: &ResourceLimits{
			CPUs:     "0.5",
			MemoryMB: 256,
		},
		HealthCheck: &HealthCheck{
			Test: []string{
				"CMD-SHELL",
				"curl -f http://localhost || exit 1",
			},
		},
	}

	out := roundTrip(t, in)

	if out.Name != in.Name {
		t.Fatal("name mismatch")
	}

	if out.Image != in.Image {
		t.Fatal("image mismatch")
	}

	if out.EnvVars["FOO"] != "bar" {
		t.Fatal("env vars mismatch")
	}
}

func TestStatsPushPayloadRoundTrip(t *testing.T) {
	in := StatsPushPayload{
		CPUPercent: 42.5,

		Memory: MemoryStats{
			Total:     16_000,
			Used:      8_000,
			Available: 8_000,
		},

		Disk: DiskStats{
			Total: 100_000,
			Used:  40_000,
		},

		Uptime:         7200,
		ContainerCount: 2,

		ContainerStates: []ContainerState{
			{
				ID:    "abc",
				Name:  "api",
				State: "running",
			},
			{
				ID:    "xyz",
				Name:  "redis",
				State: "running",
			},
		},
	}

	out := roundTrip(t, in)

	if out.CPUPercent != 42.5 {
		t.Fatal("cpu mismatch")
	}

	if out.Memory.Total != 16_000 {
		t.Fatal("memory mismatch")
	}

	if out.Disk.Used != 40_000 {
		t.Fatal("disk mismatch")
	}

	if len(out.ContainerStates) != 2 {
		t.Fatal("container count mismatch")
	}
}

func TestEventPushPayloadRoundTrip(t *testing.T) {
	appID := "app-123"

	in := EventPushPayload{
		EventType:     EventOOM,
		ContainerID:   "container-1",
		ContainerName: "api",
		AppID:         &appID,
		Timestamp:     "2026-07-22T10:00:00Z",
		Extra: map[string]interface{}{
			"exitCode": 137,
			"signal":   "SIGKILL",
		},
	}

	out := roundTrip(t, in)

	if out.EventType != EventOOM {
		t.Fatal("event type mismatch")
	}

	if out.ContainerID != "container-1" {
		t.Fatal("container id mismatch")
	}

	if *out.AppID != appID {
		t.Fatal("app id mismatch")
	}
}

func TestEnvelopeRoundTrip(t *testing.T) {
	payload, err := json.Marshal(StatsPushPayload{
		CPUPercent: 10,
	})

	if err != nil {
		t.Fatal(err)
	}

	in := Envelope{
		Type:      TypeStatsPush,
		ID:        "msg-1",
		Timestamp: "2026-07-22T10:00:00Z",
		Payload:   payload,
	}

	out := roundTrip(t, in)

	if out.Type != TypeStatsPush {
		t.Fatal("type mismatch")
	}

	var stats StatsPushPayload

	if err := json.Unmarshal(out.Payload, &stats); err != nil {
		t.Fatal(err)
	}

	if stats.CPUPercent != 10 {
		t.Fatal("payload mismatch")
	}
}

