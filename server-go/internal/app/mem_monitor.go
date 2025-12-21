package app

import (
	"os"
	"strconv"
	"strings"
)

func parseUint(s string) (uint64, bool) {
	s = strings.TrimSpace(s)
	if s == "" || s == "max" {
		return 0, false
	}
	v, err := strconv.ParseUint(s, 10, 64)
	if err != nil {
		return 0, false
	}
	return v, true
}

func readHostMemory() (used, total uint64) {
	data, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return 0, 0
	}
	var memTotal, memAvailable uint64
	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		if strings.HasPrefix(line, "MemTotal:") {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				if v, err := strconv.ParseUint(fields[1], 10, 64); err == nil {
					memTotal = v * 1024
				}
			}
		} else if strings.HasPrefix(line, "MemAvailable:") {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				if v, err := strconv.ParseUint(fields[1], 10, 64); err == nil {
					memAvailable = v * 1024
				}
			}
		}
	}
	if memTotal == 0 {
		return 0, 0
	}
	if memAvailable > memTotal {
		memAvailable = 0
	}
	return memTotal - memAvailable, memTotal
}

func readCgroupMemory() (used, limit uint64) {
	usageBytes, errU := os.ReadFile("/sys/fs/cgroup/memory/memory.usage_in_bytes")
	limitBytes, errL := os.ReadFile("/sys/fs/cgroup/memory/memory.limit_in_bytes")
	if errU == nil && errL == nil {
		u, okU := parseUint(string(usageBytes))
		l, okL := parseUint(string(limitBytes))
		if okU && okL && l > 0 {
			return u, l
		}
	}

	usageBytes, errU = os.ReadFile("/sys/fs/cgroup/memory.current")
	limitBytes, errL = os.ReadFile("/sys/fs/cgroup/memory.max")
	if errU == nil && errL == nil {
		u, okU := parseUint(string(usageBytes))
		l, okL := parseUint(string(limitBytes))
		if okU && okL && l > 0 {
			return u, l
		}
	}
	return 0, 0
}

