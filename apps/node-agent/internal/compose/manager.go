package compose

import (
	"os"
	"path/filepath"
)

const DefaultDataDir = "/home/fbenini-/benisploy/compose"

type Manager struct {
	dataDir string
}

func NewManager(dataDir string) *Manager {
	if dataDir == "" {
		dataDir = DefaultDataDir
	}
	return &Manager{dataDir: dataDir}
}

func (m *Manager) composePath(deploymentID string) string {
	return filepath.Join(m.dataDir, deploymentID, "docker-compose.yml")
}

func (m *Manager) projectDir(deploymentID string) string {
	return filepath.Join(m.dataDir, deploymentID)
}

func (m *Manager) ensureDir(deploymentID string) error {
	return os.MkdirAll(m.projectDir(deploymentID), 0750)
}
