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
	"github.com/benisploy/node-agent/internal/compose"
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
	ComposeMgr        *compose.Manager
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

	case protocol.TypeDeploy:
		if c.config.ComposeMgr == nil {
			return c.sendError(ctx, env.ID, "compose_manager_unavailable", "compose manager not configured")
		}
		go c.handleDeploy(ctx, env)

	case protocol.TypeStreamLogs:
		if c.config.ComposeMgr == nil {
			return c.sendError(ctx, env.ID, "compose_manager_unavailable", "compose manager not configured")
		}
		go c.handleStreamLogs(ctx, env)

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

func (c *Client) handleDeploy(ctx context.Context, env protocol.Envelope) {
	var deploy protocol.DeployPayload
	if err := json.Unmarshal(env.Payload, &deploy); err != nil {
		log.Printf("deploy: failed to unmarshal payload: %v", err)
		_ = c.sendError(ctx, env.ID, "invalid_payload", "failed to parse deploy request")
		return
	}

	log.Printf("deploy: processing deployment %s (app: %s)", deploy.DeploymentID, deploy.AppSpec.Name)

	if _, err := c.config.ComposeMgr.GenerateComposeFile(deploy.DeploymentID, &deploy.AppSpec, deploy.ComposeContent); err != nil {
		log.Printf("deploy: failed to generate compose file: %v", err)
		_ = c.sendError(ctx, env.ID, "compose_generation_failed", err.Error())
		return
	}

	c.sendLogEntry(ctx, deploy.DeploymentID, "stdout", "Generated compose file, starting deploy...")

	lineCh := make(chan compose.LineOutput, 100)
	errCh := make(chan error, 1)

	go func() {
		errCh <- c.config.ComposeMgr.Deploy(ctx, deploy.DeploymentID, lineCh)
		close(lineCh)
	}()

	for line := range lineCh {
		c.sendLogEntry(ctx, deploy.DeploymentID, line.Stream, line.Line)
	}

	err := <-errCh
	if err != nil {
		log.Printf("deploy: failed to deploy %s: %v", deploy.DeploymentID, err)
		c.sendLogEntry(ctx, deploy.DeploymentID, "stderr", fmt.Sprintf("Deploy failed: %v", err))
		_ = c.sendError(ctx, env.ID, "deploy_failed", err.Error())
		return
	}

	c.sendLogEntry(ctx, deploy.DeploymentID, "stdout", "Deploy succeeded")

	respPayload, err := json.Marshal(protocol.DeployResponsePayload{
		Accepted:     true,
		DeploymentID: deploy.DeploymentID,
	})
	if err != nil {
		log.Printf("deploy: failed to marshal response: %v", err)
		return
	}

	resp := protocol.Envelope{
		Type:      protocol.TypeDeployResp,
		ID:        env.ID,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Payload:   respPayload,
	}

	if err := c.send(ctx, resp); err != nil {
		log.Printf("deploy: failed to send response: %v", err)
	}
}

func (c *Client) sendLogEntry(ctx context.Context, deploymentID, stream, message string) {
	entry := protocol.LogEntryPayload{
		Timestamp:    time.Now().UTC().Format(time.RFC3339),
		Stream:       stream,
		Message:      message,
		DeploymentID: deploymentID,
	}

	raw, err := json.Marshal(entry)
	if err != nil {
		log.Printf("send log entry: marshal: %v", err)
		return
	}

	env := protocol.Envelope{
		Type:      protocol.TypeLogEntry,
		ID:        fmt.Sprintf("deploy-%s", deploymentID),
		Timestamp: entry.Timestamp,
		Payload:   raw,
	}

	if err := c.send(ctx, env); err != nil {
		log.Printf("send log entry: %v", err)
	}
}

func (c *Client) handleStreamLogs(ctx context.Context, env protocol.Envelope) {
	var opts protocol.StreamLogsPayload
	if err := json.Unmarshal(env.Payload, &opts); err != nil {
		log.Printf("stream_logs: failed to unmarshal payload: %v", err)
		_ = c.sendError(ctx, env.ID, "invalid_payload", "failed to parse stream_logs request")
		return
	}

	log.Printf("stream_logs: streaming logs for app %s", opts.AppID)

	logCh := make(chan protocol.LogEntryPayload, 100)

	go func() {
		if err := c.config.ComposeMgr.StreamLogs(ctx, opts.AppID, opts, logCh); err != nil {
			if ctx.Err() == nil {
				log.Printf("stream_logs: error streaming logs: %v", err)
			}
		}
		close(logCh)
	}()

	for entry := range logCh {
		entryPayload, err := json.Marshal(entry)
		if err != nil {
			log.Printf("stream_logs: failed to marshal log entry: %v", err)
			continue
		}

		msg := protocol.Envelope{
			Type:      protocol.TypeLogEntry,
			ID:        env.ID,
			Timestamp: entry.Timestamp,
			Payload:   entryPayload,
		}

		if err := c.send(ctx, msg); err != nil {
			log.Printf("stream_logs: failed to send log entry: %v", err)
			return
		}
	}
}

func (c *Client) sendError(ctx context.Context, originalID string, code string, message string) error {
	errPayload, err := json.Marshal(protocol.ErrorPayload{
		Code:              code,
		Message:           message,
		OriginalMessageID: originalID,
	})
	if err != nil {
		return fmt.Errorf("marshal error payload: %w", err)
	}

	return c.send(ctx, protocol.Envelope{
		Type:      protocol.TypeError,
		ID:        originalID,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Payload:   errPayload,
	})
}

func (c *Client) handleGetStatus(ctx context.Context, originalID string) error {
	hb := c.health.Gather(c.config.ServerID)

	var containers []protocol.ContainerInfo
	if c.config.ComposeMgr != nil {
		var err error
		containers, err = c.config.ComposeMgr.ListAllContainers(ctx)
		if err != nil {
			log.Printf("get_status: failed to list containers: %v", err)
		}
	}
	if containers == nil {
		containers = []protocol.ContainerInfo{}
	}

	statusPayload := protocol.StatusResponsePayload{
		CPUPercent:    hb.CPUPercent,
		MemoryUsed:    hb.MemoryUsed,
		MemoryTotal:   hb.MemoryTotal,
		DiskUsed:      hb.DiskUsed,
		DiskTotal:     hb.DiskTotal,
		Containers:    containers,
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
