package cdp

import (
	"context"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	procnet "github.com/shirou/gopsutil/v4/net"
	goprocess "github.com/shirou/gopsutil/v4/process"

	"antigravity-hans/internal/app"
	"antigravity-hans/internal/safeio"
)

// ideAgentFramePort 仅识别已观察到的 IDE 智能体及独立设置 iframe 路由。
func ideAgentFramePort(target Target) (int, bool) {
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

var ideAgentDynamicRoutes = regexp.MustCompile(
	`^(?:/c/[A-Za-z0-9_-]+|/forked/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+|/view/[A-Za-z0-9_-]+|/battle/[A-Za-z0-9_-]+|/sidecars/(?:triggers/)?[A-Za-z0-9._-]+|/customizations(?:/browse|/(?:plugins|sidecars)/[A-Za-z0-9._-]+|/marketplaces/[A-Za-z0-9._-]+/(?:plugins|skills|bundles)/[A-Za-z0-9._-]+)?)$`,
)

func isIDEAgentRoute(p string) bool {
	switch p {
	case "/", "/settings-standalone", "/terminal-standalone", "/history", "/multi", "/new-project", "/artifact":
		return true
	}
	return !strings.Contains(p, "..") && ideAgentDynamicRoutes.MatchString(p)
}

type ideAgentProcess struct {
	parent int32
	name   string
	exe    string
}

// trustedIDEAgentOwner 校验监听端口归属与进程祖先链，默认拒绝非本 IDE 派生的回环页面。
func trustedIDEAgentOwner(connections []procnet.ConnectionStat, agentPort, debugPort int, agentExe string, cfg app.Config, lookup func(int32) (ideAgentProcess, bool)) bool {
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
			if ok && app.IsProcessMatch(p.name, p.exe, cfg) && app.IsExpectedExecutable(p.exe, cfg) && (!app.IsMac || app.IsMacMainExe(p.exe, cfg)) {
				debugOwners[conn.Pid] = true
			}
		case agentPort:
			p, ok := lookup(conn.Pid)
			if ok && p.exe != "" && safeio.SamePath(p.exe, agentExe) {
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

func isTrustedIDEAgentFrame(target Target, cfg app.Config, agentPort int) bool {
	port, ok := ideAgentFramePort(target)
	if cfg.Name != app.DefaultIDE().Name || !ok || port != agentPort {
		return false
	}
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return false
	}
	agyName := "agy"
	if app.IsWindows {
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
		p, err := goprocess.NewProcessWithContext(ctx, pid)
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

// ideAgentInjectionSource 为 IDE 智能体 iframe 脚本附加执行期地址与根节点二次校验。
func ideAgentInjectionSource(source string, port int, route string) string {
	return "(() => { if (location.protocol !== 'http:' || location.hostname !== '127.0.0.1' || " +
		"location.port !== " + strconv.Quote(strconv.Itoa(port)) + " || location.pathname !== " + strconv.Quote(route) + " || " +
		"!document.getElementById('root')) return;\n" + strings.TrimSpace(source) + "\n})()"
}
