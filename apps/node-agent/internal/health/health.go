package health

import (
	"math"
	"os"
	"runtime"
	"time"

	protocol "github.com/benisploy/agent-protocol/go"
	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"
)

func u64ToI64(v uint64) int64 {
	if v > uint64(math.MaxInt64) {
		return math.MaxInt64
	}
	return int64(v)
}

type Collector struct {
	hostname string
	cpuCount int
}

func New() *Collector {
	h := ""
	if hostname, err := os.Hostname(); err == nil {
		h = hostname
	}
	return &Collector{
		hostname: h,
		cpuCount: runtime.NumCPU(),
	}
}

func (c *Collector) Gather(serverID string) protocol.HeartbeatPayload {
	var cpuPct float64
	if pcts, err := cpu.Percent(time.Second, false); err == nil && len(pcts) > 0 {
		cpuPct = pcts[0]
	}

	var memUsed, memTotal int64
	if v, err := mem.VirtualMemory(); err == nil {
		memUsed = u64ToI64(v.Used)
		memTotal = u64ToI64(v.Total)
	}

	var diskUsed, diskTotal int64
	if d, err := disk.Usage("/"); err == nil {
		diskUsed = u64ToI64(d.Used)
		diskTotal = u64ToI64(d.Total)
	}

	uptime := int64(0)
	if u, err := host.Uptime(); err == nil {
		uptime = u64ToI64(u)
	}

	return protocol.HeartbeatPayload{
		ServerID:      serverID,
		Hostname:      c.hostname,
		CPUPercent:    cpuPct,
		MemoryUsed:    memUsed,
		MemoryTotal:   memTotal,
		DiskUsed:      diskUsed,
		DiskTotal:     diskTotal,
		UptimeSeconds: uptime,
	}
}
