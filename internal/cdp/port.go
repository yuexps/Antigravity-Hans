package cdp

import (
	"context"
	"fmt"
	"net"
	"sort"
	"time"

	procnet "github.com/shirou/gopsutil/v4/net"
	goprocess "github.com/shirou/gopsutil/v4/process"

	"antigravity-hans/internal/app"
)

const portFallbackCount = 4

// candidatePorts 返回首选端口及其备用端口。
func candidatePorts(preferred int) []int {
	ports := make([]int, 0, portFallbackCount+1)
	for i := 0; i <= portFallbackCount; i++ {
		ports = append(ports, preferred+i)
	}
	return ports
}

func isPortFree(port int) bool {
	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		return false
	}
	_ = ln.Close()
	return true
}

// findCDPPort 在候选端口与本进程监听端口中寻找已提供 CDP 服务的端口。
func findCDPPort(cfg app.Config) (int, bool) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	connections, err := procnet.ConnectionsWithContext(ctx, "tcp")
	if err != nil {
		return 0, false
	}
	owners := make(map[int]bool)
	for _, connection := range connections {
		port := int(connection.Laddr.Port)
		if connection.Status != "LISTEN" || !isLoopbackHost(connection.Laddr.IP) {
			continue
		}
		p, err := goprocess.NewProcess(connection.Pid)
		if err != nil {
			continue
		}
		name, _ := p.Name()
		exe, _ := p.Exe()
		if app.IsProcessMatch(name, exe, cfg) && app.IsExpectedExecutable(exe, cfg) && (!app.IsMac || app.IsMacMainExe(exe, cfg)) {
			owners[port] = true
		}
	}
	var additional []int
	if !cfg.IsIDE() && cfg.Name == app.DefaultNormal().Name {
		for port := range owners {
			additional = append(additional, port)
		}
		sort.Ints(additional)
	}
	return findCDPPortWithOwner(cfg, func(port int) bool { return owners[port] }, additional...)
}

func findCDPPortWithOwner(cfg app.Config, belongsToApp func(int) bool, additional ...int) (int, bool) {
	ports := append(candidatePorts(cfg.Port), additional...)
	seen := make(map[int]bool)
	for _, port := range ports {
		if seen[port] {
			continue
		}
		seen[port] = true
		if !belongsToApp(port) {
			continue
		}
		for _, target := range CheckPort(port) {
			if isTargetPage(target.URL, cfg.Name) {
				return port, true
			}
		}
		if !cfg.IsIDE() && cfg.Name == app.DefaultNormal().Name {
			if _, err := getBrowserWSURL(port); err == nil {
				return port, true
			}
		}
	}
	return 0, false
}

// selectFreePort 返回第一个可绑定的候选端口；全部被占用时返回 (preferred, false)。
func selectFreePort(preferred int) (int, bool) {
	for _, port := range candidatePorts(preferred) {
		if isPortFree(port) {
			return port, true
		}
	}
	return preferred, false
}
