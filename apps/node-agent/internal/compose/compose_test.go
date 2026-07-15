package compose

import (
	"os"
	"path/filepath"
	"testing"

	protocol "github.com/benisploy/agent-protocol/go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGenerateComposeFile_Minimal(t *testing.T) {
	dir := t.TempDir()
	m := NewManager(dir)

	spec := &protocol.AppSpec{
		Name:    "nginx-test",
		Image:   "nginx:alpine",
		EnvVars: map[string]string{"FOO": "bar"},
		Ports: []protocol.PortMapping{
			{Container: 80, Protocol: "tcp"},
		},
	}

	path, err := m.GenerateComposeFile("deploy-001", spec, "")
	require.NoError(t, err)
	assert.FileExists(t, path)

	//nolint:gosec // test file
	data, err := os.ReadFile(path)
	require.NoError(t, err)
	content := string(data)

	assert.Contains(t, content, "nginx-test")
	assert.Contains(t, content, "nginx:alpine")
	assert.Contains(t, content, "FOO: bar")
	assert.Contains(t, content, "80")
}

func TestGenerateComposeFile_WithResourceLimits(t *testing.T) {
	dir := t.TempDir()
	m := NewManager(dir)

	spec := &protocol.AppSpec{
		Name:  "resource-test",
		Image: "redis:7",
		ResourceLimits: &protocol.ResourceLimits{
			CPUs:     "0.5",
			MemoryMB: 256,
		},
	}

	path, err := m.GenerateComposeFile("deploy-002", spec, "")
	require.NoError(t, err)

	//nolint:gosec // test file
	data, err := os.ReadFile(path)
	require.NoError(t, err)
	content := string(data)

	assert.Contains(t, content, "cpus:")
	assert.Contains(t, content, "memory: 256M")
}

func TestGenerateComposeFile_WithHealthCheck(t *testing.T) {
	dir := t.TempDir()
	m := NewManager(dir)

	spec := &protocol.AppSpec{
		Name:  "health-test",
		Image: "nginx:alpine",
		HealthCheck: &protocol.HealthCheck{
			Test:        []string{"CMD", "curl", "-f", "http://localhost"},
			Interval:    30,
			Timeout:     10,
			Retries:     3,
			StartPeriod: 5,
		},
	}

	path, err := m.GenerateComposeFile("deploy-003", spec, "")
	require.NoError(t, err)

	//nolint:gosec // test file
	data, err := os.ReadFile(path)
	require.NoError(t, err)
	content := string(data)

	assert.Contains(t, content, "curl")
	assert.Contains(t, content, "interval: 30s")
	assert.Contains(t, content, "timeout: 10s")
	assert.Contains(t, content, "retries: 3")
	assert.Contains(t, content, "start_period: 5s")
}

func TestGenerateComposeFile_WithVolumeMounts(t *testing.T) {
	dir := t.TempDir()
	m := NewManager(dir)

	spec := &protocol.AppSpec{
		Name:  "volume-test",
		Image: "postgres:16",
		VolumeMounts: []protocol.VolumeMount{
			{Source: "pgdata", Target: "/var/lib/postgresql/data", Mode: "rw"},
		},
	}

	path, err := m.GenerateComposeFile("deploy-004", spec, "")
	require.NoError(t, err)

	//nolint:gosec // test file
	data, err := os.ReadFile(path)
	require.NoError(t, err)
	content := string(data)

	assert.Contains(t, content, "pgdata:/var/lib/postgresql/data")
}

func TestGenerateComposeFile_WithComposeOverrides(t *testing.T) {
	dir := t.TempDir()
	m := NewManager(dir)

	spec := &protocol.AppSpec{
		Name:    "override-test",
		Image:   "nginx:alpine",
		EnvVars: map[string]string{"BASE": "val"},
		ComposeOverrides: `
services:
  override-test:
    environment:
      OVERRIDDEN: "yes"
`,
	}

	path, err := m.GenerateComposeFile("deploy-005", spec, "")
	require.NoError(t, err)

	//nolint:gosec // test file
	data, err := os.ReadFile(path)
	require.NoError(t, err)
	content := string(data)

	assert.Contains(t, content, "OVERRIDDEN")
	assert.Contains(t, content, "BASE: val")
}

func TestGenerateComposeFile_WithComposeContent(t *testing.T) {
	dir := t.TempDir()
	m := NewManager(dir)

	spec := &protocol.AppSpec{
		Name:  "raw-test",
		Image: "nginx:alpine",
	}

	composeContent := `
services:
  web:
    image: nginx:alpine
    ports:
      - "8080:80"
`

	path, err := m.GenerateComposeFile("deploy-006", spec, composeContent)
	require.NoError(t, err)

	//nolint:gosec // test file
	data, err := os.ReadFile(path)
	require.NoError(t, err)
	content := string(data)

	assert.Contains(t, content, "8080:80")
	assert.NotContains(t, content, "raw-test")
}

func TestSanitize(t *testing.T) {
	assert.Equal(t, "my-app", sanitize("my-app"))
	assert.Equal(t, "my-app", sanitize("my app"))
	assert.Equal(t, "hello-world-", sanitize("hello world!"))
	assert.Equal(t, "test123", sanitize("test123"))
}

func TestDeepMerge(t *testing.T) {
	dst := map[string]any{
		"services": map[string]any{
			"web": map[string]any{
				"image": "nginx",
				"ports": []any{"80"},
			},
		},
	}

	src := map[string]any{
		"services": map[string]any{
			"web": map[string]any{
				"environment": map[string]any{"FOO": "bar"},
			},
		},
	}

	deepMerge(dst, src)

	svcs := dst["services"].(map[string]any)
	web := svcs["web"].(map[string]any)
	assert.Equal(t, "nginx", web["image"])
	assert.Equal(t, "bar", web["environment"].(map[string]any)["FOO"])
}

func TestComposePath(t *testing.T) {
	dir := t.TempDir()
	m := NewManager(dir)
	path := m.composePath("test-123")
	assert.True(t, filepath.IsAbs(path))
	assert.Contains(t, path, "test-123")
	assert.Contains(t, path, "docker-compose.yml")
}
