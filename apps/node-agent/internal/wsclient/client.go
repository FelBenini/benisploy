package wsclient

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"sync"
	"time"

	protocol "github.com/benisploy/agent-protocol/go"
	"github.com/benisploy/node-agent/internal/health"
	"github.com/gorilla/websocket"
)

const (
	defaultHeartbeatInterval = 10 * time.Second
	defaultInitialBackoff    = 1 * time.Second
	defaultMaxBackoff        = 60 * time.Second
	defaultWriteTimeout      = 10 * time.Second
)

type Config struct {
	ControlPlaneURL   string
	ServerID          string
	HeartbeatInterval time.Duration
	TLSConfig         *tls.Config
}

func (c *Config) heartbeatInterval() time.Duration {
	if c.HeartbeatInterval <= 0 {
		return defaultHeartbeatInterval
	}
	return c.HeartbeatInterval
}

type Client struct {
	config  Config
	health  *health.Collector
	conn    *websocket.Conn
	connMu  sync.Mutex
	writeMu sync.Mutex
	msgID   int64
	msgIDMu sync.Mutex
}

func New(config Config, collector *health.Collector) *Client {
	return &Client{
		config: config,
		health: collector,
	}
}

func (c *Client) nextID() string {
	c.msgIDMu.Lock()
	defer c.msgIDMu.Unlock()
	c.msgID++
	return fmt.Sprintf("%s-%d", c.config.ServerID, c.msgID)
}

func (c *Client) setConn(conn *websocket.Conn) {
	c.connMu.Lock()
	defer c.connMu.Unlock()
	c.conn = conn
}

func (c *Client) getConn() *websocket.Conn {
	c.connMu.Lock()
	defer c.connMu.Unlock()
	return c.conn
}

func (c *Client) send(ctx context.Context, env protocol.Envelope) error {
	conn := c.getConn()
	if conn == nil {
		return fmt.Errorf("not connected")
	}

	deadline := time.Now().Add(defaultWriteTimeout)
	if d, ok := ctx.Deadline(); ok && d.Before(deadline) {
		deadline = d
	}

	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	_ = conn.SetWriteDeadline(deadline)
	return conn.WriteJSON(&env)
}

func (c *Client) connect(ctx context.Context) (*websocket.Conn, error) {
	dialer := &websocket.Dialer{
		TLSClientConfig:  c.config.TLSConfig,
		HandshakeTimeout: 10 * time.Second,
	}
	conn, resp, err := dialer.DialContext(ctx, c.config.ControlPlaneURL, nil)
	if err != nil {
		return nil, fmt.Errorf("dial %s: %w", c.config.ControlPlaneURL, err)
	}
	if resp != nil {
		_, _ = io.Copy(io.Discard, resp.Body)
		_ = resp.Body.Close()
	}
	return conn, nil
}

// Run connects to the control plane and runs the heartbeat + dispatch loop.
// It blocks until ctx is cancelled or a permanent error occurs.
// On disconnect it reconnects with exponential backoff.
func (c *Client) Run(ctx context.Context) error {
	backoff := defaultInitialBackoff

	for {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		log.Printf("connecting to %s (server %s)", c.config.ControlPlaneURL, c.config.ServerID)
		conn, err := c.connect(ctx)
		if err != nil {
			log.Printf("connection failed: %v (retry in %v)", err, backoff)
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(backoff):
			}
			backoff *= 2
			if backoff > defaultMaxBackoff {
				backoff = defaultMaxBackoff
			}
			continue
		}

		backoff = defaultInitialBackoff
		c.setConn(conn)
		log.Printf("connected to %s", c.config.ControlPlaneURL)

		sessionErr := c.runSession(ctx)

		_ = conn.Close()
		c.setConn(nil)

		if ctx.Err() != nil {
			return ctx.Err()
		}

		log.Printf("disconnected: %v (reconnecting)", sessionErr)
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(defaultInitialBackoff):
		}
	}
}

func (c *Client) runSession(ctx context.Context) error {
	heartbeatCtx, heartbeatCancel := context.WithCancel(ctx)
	defer heartbeatCancel()

	go c.heartbeatLoop(heartbeatCtx)

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			return fmt.Errorf("read: %w", err)
		}

		var env protocol.Envelope
		if err := json.Unmarshal(message, &env); err != nil {
			log.Printf("failed to unmarshal envelope: %v", err)
			continue
		}

		if err := c.dispatch(ctx, env); err != nil {
			log.Printf("dispatch error: %v", err)
		}
	}
}

func (c *Client) heartbeatLoop(ctx context.Context) {
	ticker := time.NewTicker(c.config.heartbeatInterval())
	defer ticker.Stop()

	c.sendHeartbeat(ctx)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			c.sendHeartbeat(ctx)
		}
	}
}

func (c *Client) sendHeartbeat(ctx context.Context) {
	payload := c.health.Gather(c.config.ServerID)
	raw, err := json.Marshal(payload)
	if err != nil {
		log.Printf("marshal heartbeat: %v", err)
		return
	}

	env := protocol.Envelope{
		Type:      protocol.TypeHeartbeat,
		ID:        c.nextID(),
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Payload:   raw,
	}

	if err := c.send(ctx, env); err != nil {
		log.Printf("send heartbeat: %v", err)
	}
}

func (c *Client) dispatch(ctx context.Context, env protocol.Envelope) error {
	switch env.Type {
	case protocol.TypeHeartbeatAck:
		var ack protocol.HeartbeatAckPayload
		if err := json.Unmarshal(env.Payload, &ack); err != nil {
			return fmt.Errorf("unmarshal heartbeat_ack: %w", err)
		}
		log.Printf("heartbeat acknowledged at %s", ack.Timestamp)

	case protocol.TypeGetStatus:
		return c.handleGetStatus(ctx, env.ID)

	case protocol.TypeError:
		var errPayload protocol.ErrorPayload
		if err := json.Unmarshal(env.Payload, &errPayload); err != nil {
			return fmt.Errorf("unmarshal error: %w", err)
		}
		log.Printf("control-plane error: [%s] %s (msg %s)", errPayload.Code, errPayload.Message, errPayload.OriginalMessageID)

	default:
		log.Printf("unhandled message type: %s", env.Type)
	}
	return nil
}

func (c *Client) handleGetStatus(ctx context.Context, originalID string) error {
	hb := c.health.Gather(c.config.ServerID)

	statusPayload := protocol.StatusResponsePayload{
		CPUPercent:    hb.CPUPercent,
		MemoryUsed:    hb.MemoryUsed,
		MemoryTotal:   hb.MemoryTotal,
		DiskUsed:      hb.DiskUsed,
		DiskTotal:     hb.DiskTotal,
		Containers:    []protocol.ContainerInfo{},
		UptimeSeconds: hb.UptimeSeconds,
	}

	raw, err := json.Marshal(statusPayload)
	if err != nil {
		return fmt.Errorf("marshal status_response: %w", err)
	}

	resp := protocol.Envelope{
		Type:      protocol.TypeStatusResp,
		ID:        originalID,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Payload:   raw,
	}

	return c.send(ctx, resp)
}
