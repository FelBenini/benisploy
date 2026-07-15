package compose

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"math"
	"os"
	"os/exec"
	"time"
)

const (
	maxPullRetries = 3
	pullRetryBase  = 2 * time.Second
	pullTimeout    = 120 * time.Second
)

type LineOutput struct {
	Line   string
	Stream string
}

func (m *Manager) Deploy(ctx context.Context, deploymentID string, output chan<- LineOutput) error {
	path := m.composePath(deploymentID)
	if _, err := os.Stat(path); err != nil {
		return fmt.Errorf("compose file not found for deployment %s: %w", deploymentID, err)
	}

	output <- LineOutput{Line: "Pulling images...", Stream: "stdout"}
	if err := m.tryPullImages(ctx, path, deploymentID, output); err != nil {
		output <- LineOutput{Line: fmt.Sprintf("Image pull failed (continuing): %v", err), Stream: "stderr"}
	}

	output <- LineOutput{Line: "Starting containers...", Stream: "stdout"}

	cmd := exec.CommandContext(ctx, "docker", "compose", "-f", path, "up", "-d")
	cmd.Dir = m.projectDir(deploymentID)

	var stderr bytes.Buffer
	cmd.Stdout = &stderr
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("docker compose up failed: %w", err)
	}

	scanner := bufio.NewScanner(&stderr)
	for scanner.Scan() {
		output <- LineOutput{Line: scanner.Text(), Stream: "stdout"}
	}

	return nil
}

func (m *Manager) tryPullImages(ctx context.Context, composePath, deploymentID string, output chan<- LineOutput) error {
	pullCtx, cancel := context.WithTimeout(ctx, pullTimeout)
	defer cancel()

	var lastErr error
	for attempt := 0; attempt < maxPullRetries; attempt++ {
		if attempt > 0 {
			backoff := time.Duration(math.Pow(2, float64(attempt))) * pullRetryBase
			output <- LineOutput{Line: fmt.Sprintf("Pull attempt %d/%d in %v...", attempt+1, maxPullRetries, backoff), Stream: "stdout"}
			select {
			case <-pullCtx.Done():
				return pullCtx.Err()
			case <-time.After(backoff):
			}
		}

		cmd := exec.CommandContext(pullCtx, "docker", "compose", "-f", composePath, "pull")
		cmd.Dir = m.projectDir(deploymentID)

		stdout, _ := cmd.StdoutPipe()
		stderr, _ := cmd.StderrPipe()

		if err := cmd.Start(); err != nil {
			lastErr = err
			continue
		}

		done := make(chan struct{})
		go func() {
			scanner := bufio.NewScanner(stdout)
			for scanner.Scan() {
				output <- LineOutput{Line: scanner.Text(), Stream: "stdout"}
			}
			close(done)
		}()

		go func() {
			scanner := bufio.NewScanner(stderr)
			for scanner.Scan() {
				output <- LineOutput{Line: scanner.Text(), Stream: "stderr"}
			}
		}()

		if err := cmd.Wait(); err != nil {
			<-done
			lastErr = fmt.Errorf("attempt %d/%d: %w", attempt+1, maxPullRetries, err)
			continue
		}

		<-done
		return nil
	}

	return lastErr
}

func (m *Manager) Remove(ctx context.Context, deploymentID string, removeVolumes bool) error {
	path := m.composePath(deploymentID)
	if _, err := os.Stat(path); err != nil {
		return nil
	}

	args := []string{"compose", "-f", path, "down"}
	if removeVolumes {
		args = append(args, "-v")
	}

	cmd := exec.CommandContext(ctx, "docker", args...)
	cmd.Dir = m.projectDir(deploymentID)

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("docker compose down failed: %w\nstderr: %s", err, stderr.String())
	}

	return nil
}
