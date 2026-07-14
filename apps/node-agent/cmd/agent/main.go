package main

import (
	"context"
	"crypto/tls"
	"log"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/benisploy/node-agent/internal/health"
	"github.com/benisploy/node-agent/internal/wsclient"
)

func main() {
	log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)

	serverID := os.Getenv("SERVER_ID")
	if serverID == "" {
		log.Fatal("SERVER_ID environment variable is required")
	}

	wsURL := os.Getenv("CONTROL_PLANE_WS_URL")
	if wsURL == "" {
		wsURL = "wss://localhost:3001"
	}

	interval := 10 * time.Second
	if s := os.Getenv("HEARTBEAT_INTERVAL"); s != "" {
		if d, err := strconv.Atoi(s); err == nil && d > 0 {
			interval = time.Duration(d) * time.Second
		}
	}

	skipTLS := os.Getenv("SKIP_TLS_VERIFY") == "1"

	var tlsConfig *tls.Config
	if skipTLS {
		tlsConfig = &tls.Config{InsecureSkipVerify: true} //nolint:gosec
	}

	collector := health.New()

	client := wsclient.New(wsclient.Config{
		ControlPlaneURL:   wsURL,
		ServerID:          serverID,
		HeartbeatInterval: interval,
		TLSConfig:         tlsConfig,
	}, collector)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		sig := <-sigCh
		log.Printf("received signal %v, shutting down", sig)
		cancel()
	}()

	log.Printf("starting node agent (server %s, control plane %s)", serverID, wsURL) //nolint:gosec
	if err := client.Run(ctx); err != nil && err != context.Canceled {
		log.Fatalf("agent exited: %v", err)
	}
	log.Println("node agent stopped")
}
