package main

import (
	"context"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	procnet "github.com/shirou/gopsutil/v4/net"
	"github.com/shirou/gopsutil/v4/process"
)

// ideAgentFramePort recognizes only observed IDE agent and settings iframe
// routes. A matching URL alone is not sufficient to trust or inject a page.
func ideAgentFramePort(target CDPTarget) (int, bool) {
	if target.Type != "iframe" {
		return 0, false
	}
	u, err := url.Parse(target.URL)
	if err != nil || u.Scheme != "http" || u.Hostname() != "127.0.0.1" || u.User != nil ||
		!isIDEAgentRoute(u.Path) || u.RawPath != "" || u.Fragment != "" {
		return 0, false
	}
	port, err := strconv.Atoi(u.Port())
	return port, err == nil && port > 0 && port <= 65535
}

func isIDEAgentRoute(path string) bool {
	return path == "/" || path == "/settings-standalone"
}

type ideAgentProcess struct {
	parent int32
	name   string
	exe    string
}

// trustedIDEAgentOwner checks both listener owners and the process ancestry.
// It must fail closed: a user's local preview can also be a loopback iframe.
func trustedIDEAgentOwner(connections []procnet.ConnectionStat, agentPort, debugPort int, agentExe string, cfg AppConfig, lookup func(int32) (ideAgentProcess, bool)) bool {
	if agentPort <= 0 || debugPort <= 0 || agentPort == debugPort || agentExe == "" {
		return false
	}
	debugOwners := make(map[int32]bool)
	var agentOwners []int32
	for _, conn := range connections {
		if conn.Status != "LISTEN" || conn.Laddr.IP != "127.0.0.1" || conn.Pid <= 0 {
			continue
		}
		switch int(conn.Laddr.Port) {
		case debugPort:
			p, ok := lookup(conn.Pid)
			if ok && isProcessMatch(p.name, p.exe, cfg) && isExpectedExecutable(p.exe, cfg) && (!IsMac || isMacMainExe(p.exe, cfg)) {
				debugOwners[conn.Pid] = true
			}
		case agentPort:
			p, ok := lookup(conn.Pid)
			if ok && p.exe != "" && samePath(p.exe, agentExe) {
				agentOwners = append(agentOwners, conn.Pid)
			}
		}
	}
	for _, pid := range agentOwners {
		seen := make(map[int32]bool)
		for depth := 0; depth < 32 && pid > 0 && !seen[pid]; depth++ {
			if debugOwners[pid] {
				return true
			}
			seen[pid] = true
			p, ok := lookup(pid)
			if !ok {
				break
			}
			pid = p.parent
		}
	}
	return false
}

func isTrustedIDEAgentFrame(target CDPTarget, cfg AppConfig, agentPort int) bool {
	port, ok := ideAgentFramePort(target)
	if cfg.Name != AppIDE.Name || !ok || port != agentPort {
		return false
	}
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return false
	}
	agyName := "agy"
	if IsWindows {
		agyName += ".exe"
	}
	agentExe := filepath.Join(home, ".gemini", "bin", agyName)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	connections, err := procnet.ConnectionsWithContext(ctx, "tcp")
	if err != nil {
		return false
	}
	cache := make(map[int32]ideAgentProcess)
	failed := make(map[int32]bool)
	lookup := func(pid int32) (ideAgentProcess, bool) {
		if p, ok := cache[pid]; ok {
			return p, true
		}
		if failed[pid] {
			return ideAgentProcess{}, false
		}
		p, err := process.NewProcessWithContext(ctx, pid)
		if err != nil {
			failed[pid] = true
			return ideAgentProcess{}, false
		}
		name, _ := p.NameWithContext(ctx)
		exe, _ := p.ExeWithContext(ctx)
		parent, _ := p.PpidWithContext(ctx)
		info := ideAgentProcess{parent: parent, name: name, exe: exe}
		cache[pid] = info
		return info, true
	}
	return trustedIDEAgentOwner(connections, agentPort, target.DebugPort, agentExe, cfg, lookup)
}

// Guard the current document again in the renderer in case it navigated after
// the process check. Never include the URL query, which may contain secrets.
func ideAgentInjectionSource(source string, port int, route string) string {
	return "(() => { if (location.protocol !== 'http:' || location.hostname !== '127.0.0.1' || " +
		"location.port !== " + strconv.Quote(strconv.Itoa(port)) + " || location.pathname !== " + strconv.Quote(route) + " || " +
		"!document.getElementById('root')) return;\n" + strings.TrimSpace(source) + "\n})()"
}
