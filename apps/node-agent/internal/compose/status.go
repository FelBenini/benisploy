package compose

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"

	protocol "github.com/benisploy/agent-protocol/go"
)

type composePSRow struct {
	ID     string `json:"ID"`
	Name   string `json:"Name"`
	Image  string `json:"Image"`
	State  string `json:"State"`
	Ports  string `json:"Publishers"`
	Status string `json:"Status"`
}

func (m *Manager) ListAllContainers(ctx context.Context) ([]protocol.ContainerInfo, error) {
	entries, err := os.ReadDir(m.dataDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("read data dir: %w", err)
	}

	var all []protocol.ContainerInfo
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		containers, err := m.GetContainers(ctx, entry.Name())
		if err != nil {
			continue
		}
		all = append(all, containers...)
	}
	return all, nil
}

func (m *Manager) GetContainers(ctx context.Context, deploymentID string) ([]protocol.ContainerInfo, error) {
	path := m.composePath(deploymentID)
	if _, err := os.Stat(path); err != nil {
		return nil, nil
	}

	cmd := exec.CommandContext(ctx, "docker", "compose", "-f", path, "ps", "--format", "json")
	cmd.Dir = m.projectDir(deploymentID)

	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("docker compose ps: %w", err)
	}

	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	if len(lines) == 0 || lines[0] == "" {
		return []protocol.ContainerInfo{}, nil
	}

	containers := make([]protocol.ContainerInfo, 0, len(lines))
	for _, line := range lines {
		var row composePSRow
		if err := json.Unmarshal([]byte(line), &row); err != nil {
			continue
		}

		ci := protocol.ContainerInfo{
			ID:    row.ID,
			Name:  row.Name,
			Image: row.Image,
			State: row.State,
		}

		containers = append(containers, ci)
	}

	return containers, nil
}
