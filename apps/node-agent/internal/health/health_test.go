package health

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewCollector(t *testing.T) {
	c := New()
	require.NotNil(t, c)
	assert.NotEmpty(t, c.hostname, "hostname should not be empty")
	assert.Greater(t, c.cpuCount, 0, "CPU count should be positive")
}

func TestGather(t *testing.T) {
	c := New()
	p := c.Gather("test-server-1")

	assert.Equal(t, "test-server-1", p.ServerID)
	assert.NotEmpty(t, p.Hostname)
	assert.GreaterOrEqual(t, p.CPUPercent, 0.0)
	assert.LessOrEqual(t, p.CPUPercent, 100.0)
	assert.Greater(t, p.MemoryTotal, int64(0), "total memory should be positive")
	assert.Greater(t, p.DiskTotal, int64(0), "total disk should be positive")
	assert.GreaterOrEqual(t, p.UptimeSeconds, int64(0))
}
