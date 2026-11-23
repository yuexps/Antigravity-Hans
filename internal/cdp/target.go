package cdp

import (
	"fmt"
	"net/url"
	"path"
	"regexp"
	"strconv"
	"strings"

	"antigravity-hans/internal/app"
)

// Target 表示单个 CDP 调试目标页面。
type Target struct {
	ID                   string `json:"id"`
	Type                 string `json:"type"`
	Title                string `json:"title"`
	URL                  string `json:"url"`
	WebSocketDebuggerURL string `json:"webSocketDebuggerUrl"`
	DebugPort            int    `json:"-"`
}

// swarmFrame 用负值区分内置 Swarm 插件 iframe 与 IDE agent 监听端口。
const swarmFrame = -1

var (
	swarmBoardHost = regexp.MustCompile(`^swarm--swarm_board-[a-z0-9]{1,16}$`)

	// ignoredTargetTypes 列出无需注入汉化脚本的后台目标类型。
	ignoredTargetTypes = map[string]bool{
		"worker":          true,
		"service_worker":  true,
		"shared_worker":   true,
		"background_page": true,
	}
)

// isTargetPage 判断目标 URL 是否为需要汉化的应用页面。
func isTargetPage(rawURL, appName string) bool {
	urlLower := strings.ToLower(rawURL)
	if strings.Contains(strings.ToLower(appName), "ide") {
		u, err := url.Parse(rawURL)
		if err != nil || u.User != nil {
			return false
		}
		localFile := u.Scheme == "file" && (u.Host == "" || strings.EqualFold(u.Host, "localhost"))
		vscodeFile := u.Scheme == "vscode-file" && strings.EqualFold(u.Host, "vscode-app")
		if !localFile && !vscodeFile {
			return false
		}
		name := strings.ToLower(path.Base(u.Path))
		return name == "workbench.html" || name == "workbench-jetski-agent.html"
	}
	if strings.HasPrefix(urlLower, "data:text/html") {
		return true
	}
	u, err := url.Parse(rawURL)
	return err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.User == nil && isLoopbackHost(u.Hostname())
}

// candidateTarget 仅识别目标形态；IDE agent iframe 注入前仍需额外校验进程归属。
func candidateTarget(target Target, cfg app.Config) (bool, int) {
	if isTargetPage(target.URL, cfg.Name) {
		return true, 0
	}
	normalName := app.DefaultNormal().Name
	ideName := app.DefaultIDE().Name
	if (cfg.Name == normalName || cfg.Name == ideName) && isSwarmBoardTarget(target) {
		return true, swarmFrame
	}
	if cfg.Name == ideName {
		if port, ok := ideAgentFramePort(target); ok {
			return true, port
		}
	}
	return false, 0
}

// isSwarmBoardTarget 仅匹配内置 Swarm 面板 authority，忽略并隐藏可能含会话凭据的 query。
func isSwarmBoardTarget(target Target) bool {
	if target.Type != "iframe" {
		return false
	}
	u, err := url.Parse(target.URL)
	if err != nil || u.Scheme != "plugin" || u.User != nil || u.Port() != "" ||
		(u.Path != "" && u.Path != "/") || u.RawPath != "" || u.Fragment != "" {
		return false
	}
	return swarmBoardHost.MatchString(strings.ToLower(u.Hostname()))
}

// swarmBoardInjectionSource 为 Swarm 面板脚本附加执行期地址与 DOM 标记二次校验。
func swarmBoardInjectionSource(source, host string) string {
	return "(() => { if (location.protocol !== 'plugin:' || location.hostname !== " + strconv.Quote(host) +
		" || (location.pathname !== '/' && location.pathname !== '') || " +
		"!document.querySelector('[data-testid=\"swarm-tabs\"]') || " +
		"!document.querySelector('[data-testid=\"swarm-empty-state\"]')) return;\n" +
		strings.TrimSpace(source) + "\n})()"
}

func swarmBoardHostForTarget(target Target) (string, error) {
	if !isSwarmBoardTarget(target) {
		return "", fmt.Errorf("Swarm 面板地址校验失败")
	}
	u, _ := url.Parse(target.URL)
	return u.Hostname(), nil
}

// truncateRunes 按 Unicode 字符数截断字符串，避免截断半个 UTF-8 字符。
func truncateRunes(s string, max int) string {
	runes := []rune(s)
	if len(runes) <= max {
		return s
	}
	if max <= 3 {
		return string(runes[:max])
	}
	return string(runes[:max-3]) + "..."
}

// getTargetTitle 生成用于终端日志显示的页面标题。
func getTargetTitle(title, rawURL string) string {
	if title != "" {
		return truncateRunes(title, 100)
	}
	urlLower := strings.ToLower(rawURL)
	if strings.HasPrefix(urlLower, "data:text/html") {
		return "首屏加载页"
	}
	if strings.Contains(urlLower, "workbench-jetski-agent.html") {
		return "Jetski Agent 面板"
	}
	if strings.Contains(urlLower, "workbench.html") {
		return "主窗口"
	}
	if strings.Contains(urlLower, "127.0.0.1") || strings.Contains(urlLower, "localhost") {
		return "应用主页面"
	}
	if rawURL != "" {
		return truncateRunes(rawURL, 100)
	}
	return "主窗口"
}
