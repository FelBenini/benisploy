package compose

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"

	protocol "github.com/benisploy/agent-protocol/go"
)

func (m *Manager) StreamLogs(ctx context.Context, deploymentID string, opts protocol.StreamLogsPayload, logCh chan<- protocol.LogEntryPayload) error {
	path := m.composePath(deploymentID)
	if _, err := os.Stat(path); err != nil {
		return fmt.Errorf("compose file not found for deployment %s: %w", deploymentID, err)
	}

	args := []string{"compose", "-f", path, "logs", "--no-color", "--no-log-prefix"}
	if opts.Lines > 0 {
		args = append(args, "--tail", fmt.Sprintf("%d", opts.Lines))
	}

	cmd := exec.CommandContext(ctx, "docker", args...)
	cmd.Dir = m.projectDir(deploymentID)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return fmt.Errorf("docker compose logs: %w", err)
	}

	ts := time.Now().UTC().Format(time.RFC3339)

	scanner := bufio.NewScanner(&stdout)
	for scanner.Scan() {
		line := scanner.Text()
		logCh <- protocol.LogEntryPayload{
			Timestamp: ts,
			Stream:    "stdout",
			Message:   line,
		}
	}

	if stderr.Len() > 0 {
		for _, line := range strings.Split(strings.TrimRight(stderr.String(), "\n"), "\n") {
			logCh <- protocol.LogEntryPayload{
				Timestamp: ts,
				Stream:    "stderr",
				Message:   line,
			}
		}
	}

	return nil
}
