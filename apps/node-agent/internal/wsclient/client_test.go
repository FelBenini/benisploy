package wsclient

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	protocol "github.com/benisploy/agent-protocol/go"
	"github.com/benisploy/node-agent/internal/health"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
)

func mustMarshal(t *testing.T, v interface{}) []byte {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return b
}

func newTestServer(t *testing.T, onHeartbeat func(protocol.HeartbeatPayload)) *httptest.Server {
	t.Helper()

	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Logf("upgrade error: %v", err)
			return
		}
		defer func() { _ = conn.Close() }()

		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				return
			}

			var env protocol.Envelope
			if err := json.Unmarshal(msg, &env); err != nil {
				t.Logf("unmarshal error: %v", err)
				continue
			}

			switch env.Type {
			case protocol.TypeHeartbeat:
				var hb protocol.HeartbeatPayload
				if err := json.Unmarshal(env.Payload, &hb); err == nil && onHeartbeat != nil {
					onHeartbeat(hb)
				}

				ackPayload := mustMarshal(t, protocol.HeartbeatAckPayload{
					Timestamp: time.Now().UTC().Format(time.RFC3339),
				})
				ack := protocol.Envelope{
					Type:      protocol.TypeHeartbeatAck,
					ID:        "ack-" + env.ID,
					Timestamp: time.Now().UTC().Format(time.RFC3339),
					Payload:   ackPayload,
				}
				_ = conn.WriteJSON(&ack)

			case protocol.TypeGetStatus:
				t.Log("server received get_status")
			}
		}
	}))

	t.Cleanup(server.Close)
	return server
}

func TestConnectAndHeartbeat(t *testing.T) {
	heartbeatCh := make(chan protocol.HeartbeatPayload, 1)
	server := newTestServer(t, func(hb protocol.HeartbeatPayload) {
		select {
		case heartbeatCh <- hb:
		default:
		}
	})

	wsURL := "ws://" + server.Listener.Addr().String()
	collector := health.New()

	client := New(Config{
		ControlPlaneURL:   wsURL,
		ServerID:          "test-server",
		HeartbeatInterval: 100 * time.Millisecond,
	}, collector)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	go func() {
		_ = client.Run(ctx)
	}()

	select {
	case hb := <-heartbeatCh:
		assert.Equal(t, "test-server", hb.ServerID)
		assert.NotEmpty(t, hb.Hostname)
		assert.Greater(t, hb.MemoryTotal, int64(0))
	case <-ctx.Done():
		t.Fatal("timeout waiting for heartbeat")
	}
}

func TestReconnection(t *testing.T) {
	var mu sync.Mutex
	heartbeatCount := 0
	connectedCount := 0

	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		connectedCount++
		count := connectedCount
		mu.Unlock()

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer func() { _ = conn.Close() }()

		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				return
			}

			var env protocol.Envelope
			if err := json.Unmarshal(msg, &env); err != nil {
				continue
			}

			if env.Type == protocol.TypeHeartbeat {
				mu.Lock()
				heartbeatCount++
				hc := heartbeatCount
				mu.Unlock()

				ackPayload := mustMarshal(t, protocol.HeartbeatAckPayload{
					Timestamp: time.Now().UTC().Format(time.RFC3339),
				})
				_ = conn.WriteJSON(protocol.Envelope{
					Type:      protocol.TypeHeartbeatAck,
					ID:        "ack-" + env.ID,
					Timestamp: time.Now().UTC().Format(time.RFC3339),
					Payload:   ackPayload,
				})

				if count == 1 && hc == 1 {
					_ = conn.Close()
					return
				}
			}
		}
	}))
	defer server.Close()

	wsURL := "ws://" + server.Listener.Addr().String()
	collector := health.New()

	client := New(Config{
		ControlPlaneURL:   wsURL,
		ServerID:          "reconnect-test",
		HeartbeatInterval: 100 * time.Millisecond,
	}, collector)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	go func() {
		_ = client.Run(ctx)
	}()

	deadline := time.After(8 * time.Second)
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-deadline:
			mu.Lock()
			fc := heartbeatCount
			mu.Unlock()
			if fc < 3 {
				t.Fatalf("expected at least 3 heartbeats after reconnect, got %d", fc)
			}
			return
		case <-ticker.C:
			mu.Lock()
			fc := heartbeatCount
			mu.Unlock()
			if fc >= 3 {
				return
			}
		}
	}
}

func TestGetStatusHandling(t *testing.T) {
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}

	var statusResp protocol.StatusResponsePayload
	statusCh := make(chan struct{}, 1)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer func() { _ = conn.Close() }()

		_, msg, err := conn.ReadMessage()
		if err != nil {
			return
		}

		var env protocol.Envelope
		if err := json.Unmarshal(msg, &env); err != nil {
			return
		}

		if env.Type == protocol.TypeHeartbeat {
			ackPayload := mustMarshal(t, protocol.HeartbeatAckPayload{
				Timestamp: time.Now().UTC().Format(time.RFC3339),
			})
			_ = conn.WriteJSON(protocol.Envelope{
				Type:      protocol.TypeHeartbeatAck,
				ID:        "ack",
				Timestamp: time.Now().UTC().Format(time.RFC3339),
				Payload:   ackPayload,
			})

			getStatusPayload := mustMarshal(t, struct{}{})
			_ = conn.WriteJSON(protocol.Envelope{
				Type:      protocol.TypeGetStatus,
				ID:        "get-status-1",
				Timestamp: time.Now().UTC().Format(time.RFC3339),
				Payload:   getStatusPayload,
			})
		}

		_, respMsg, err := conn.ReadMessage()
		if err != nil {
			return
		}
		var resp protocol.Envelope
		if err := json.Unmarshal(respMsg, &resp); err != nil {
			return
		}
		if resp.Type == protocol.TypeStatusResp {
			if err := json.Unmarshal(resp.Payload, &statusResp); err != nil {
				t.Logf("unmarshal status_response: %v", err)
				return
			}
			close(statusCh)
		}
	}))
	defer server.Close()

	wsURL := "ws://" + server.Listener.Addr().String()
	collector := health.New()
	client := New(Config{
		ControlPlaneURL:   wsURL,
		ServerID:          "status-test",
		HeartbeatInterval: time.Hour,
	}, collector)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	go func() {
		_ = client.Run(ctx)
	}()

	select {
	case <-statusCh:
		assert.Greater(t, statusResp.MemoryTotal, int64(0))
		assert.Greater(t, statusResp.DiskTotal, int64(0))
	case <-ctx.Done():
		t.Fatal("timeout waiting for status response")
	}
}
