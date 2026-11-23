package cdp

import (
	"fmt"
	"net/url"
	"path"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"antigravity-hans/internal/overlay"
	"antigravity-hans/resources"
)

// CheckPort 获取可注入的调试目标列表。
func CheckPort(port int) []Target {
	var targets []Target
	if err := readCDPJSON(port, "/json/list", &targets); err != nil {
		return nil
	}

	var result []Target
	for _, t := range targets {
		if validated, err := validateCDPWebSocket(t.WebSocketDebuggerURL, port); !ignoredTargetTypes[t.Type] && err == nil {
			ws, _ := url.Parse(validated)
			if !strings.HasPrefix(ws.Path, "/devtools/page/") || path.Base(ws.Path) != t.ID {
				continue
			}
			t.WebSocketDebuggerURL = validated
			t.DebugPort = port
			result = append(result, t)
		}
	}
	return result
}

func checkTargetInjectedOnConn(conn *websocket.Conn, fingerprint ...string) (bool, error) {
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	expression := "window.__antigravityZhPatchInstalled === true && window.__observedDocument === document"
	if len(fingerprint) > 0 {
		expression += fmt.Sprintf(" && window.__antigravityZhPatchFingerprint === %q", fingerprint[0])
	}
	resp, err := cdpCall(conn, "Runtime.evaluate", map[string]interface{}{
		"expression":    expression,
		"returnByValue": true,
	})
	if err != nil {
		return false, err
	}
	if result, ok := resp["result"].(map[string]interface{}); ok {
		if valObj, ok := result["result"].(map[string]interface{}); ok {
			if val, ok := valObj["value"].(bool); ok {
				return val, nil
			}
		}
	}
	return false, nil
}

// EnsureTargetInjected 在单条 WebSocket 连接中完成检测、脚本注入与复核。
func EnsureTargetInjected(target Target, overlaySource string) (bool, bool, error) {
	return ensureTargetInjected(target, overlaySource, 0)
}

func ensureTargetInjected(target Target, overlaySource string, agentPort int) (bool, bool, error) {
	var agentRoute string
	var swarmHost string
	if agentPort == swarmFrame {
		var err error
		swarmHost, err = swarmBoardHostForTarget(target)
		if err != nil {
			return false, true, err
		}
		overlaySource = resources.SwarmOverlayJS
	} else if agentPort != 0 {
		port, ok := ideAgentFramePort(target)
		if !ok || port != agentPort {
			return false, true, fmt.Errorf("IDE 内嵌页面地址校验失败")
		}
		u, _ := url.Parse(target.URL)
		agentRoute = u.Path
	}
	if target.WebSocketDebuggerURL == "" {
		return false, true, fmt.Errorf("webSocketDebuggerUrl 为空")
	}

	conn, resp, err := dialCDP(target.WebSocketDebuggerURL, target.DebugPort)
	if err != nil {
		isPermanent := (resp != nil && (resp.StatusCode == 404 || resp.StatusCode == 500)) ||
			strings.Contains(err.Error(), "refused") || strings.Contains(err.Error(), "No such target")
		return false, isPermanent, fmt.Errorf("连接 WebSocket 失败: %w", err)
	}
	defer conn.Close()

	fingerprint := overlay.Fingerprint(overlaySource)
	if injected, err := checkTargetInjectedOnConn(conn, fingerprint); err == nil && injected {
		return true, false, nil
	}

	if err := rejectLegacyOverlay(conn); err != nil {
		return false, true, err
	}

	injectionSource := buildInjectionSource(overlaySource, fingerprint, agentPort, swarmHost, agentRoute)
	if agentPort == 0 {
		_, _ = cdpCall(conn, "Page.enable", nil)
		if _, err := cdpCall(conn, "Page.addScriptToEvaluateOnNewDocument", map[string]interface{}{
			"source": injectionSource,
		}); err != nil {
			return false, false, fmt.Errorf("监听页面刷新失败: %w", err)
		}
	}

	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	evalResp, err := cdpCall(conn, "Runtime.evaluate", map[string]interface{}{
		"expression":   injectionSource,
		"awaitPromise": false,
	})
	if err != nil {
		return false, false, fmt.Errorf("Runtime.evaluate 失败: %w", err)
	}
	if err := cdpResponseError(evalResp, "Runtime.evaluate"); err != nil {
		return false, false, err
	}

	verified, _ := checkTargetInjectedOnConn(conn, fingerprint)
	if !verified {
		return false, false, fmt.Errorf("注入后页面未确认汉化脚本已安装")
	}
	return true, false, nil
}

func rejectLegacyOverlay(conn *websocket.Conn) error {
	legacyResp, legacyErr := cdpCall(conn, "Runtime.evaluate", map[string]interface{}{
		"expression":    "window.__antigravityZhPatchInstalled === true && window.__observedDocument === document && typeof window.__antigravityZhPatchCleanup !== 'function'",
		"returnByValue": true,
	})
	if legacyErr != nil {
		return legacyErr
	}
	if result, ok := legacyResp["result"].(map[string]interface{}); ok {
		if value, ok := result["result"].(map[string]interface{}); ok && value["value"] == true {
			return fmt.Errorf("页面仍运行没有清理入口的旧版汉化脚本，请重新加载此窗口以更新词库")
		}
	}
	return nil
}

func buildInjectionSource(overlaySource, fingerprint string, agentPort int, swarmHost, agentRoute string) string {
	source := fmt.Sprintf("window.__antigravityZhPatchRequestedFingerprint = %q;\n%s", fingerprint, overlaySource)
	if agentPort == swarmFrame {
		return swarmBoardInjectionSource(source, swarmHost)
	}
	if agentPort != 0 {
		return ideAgentInjectionSource(source, agentPort, agentRoute)
	}
	return source
}

// IsTargetInjected 检测页面当前文档是否已注入指定版本的汉化补丁。
func IsTargetInjected(target Target, fingerprint ...string) bool {
	if target.WebSocketDebuggerURL == "" {
		return false
	}
	conn, _, err := dialCDP(target.WebSocketDebuggerURL, target.DebugPort)
	if err != nil {
		return false
	}
	defer conn.Close()

	injected, _ := checkTargetInjectedOnConn(conn, fingerprint...)
	return injected
}

// InjectTarget 向目标页面注入脚本并记录已注入状态。
func InjectTarget(target Target, overlaySource string, injectedSet map[string]bool, mu *sync.Mutex) error {
	injected, _, err := EnsureTargetInjected(target, overlaySource)
	if injected && target.ID != "" && mu != nil {
		mu.Lock()
		injectedSet[target.ID] = true
		mu.Unlock()
	}
	return err
}

// WaitForPort 等待调试端口就绪。
func WaitForPort(port int, maxWaitMs int) bool {
	start := time.Now()
	limit := time.Duration(maxWaitMs) * time.Millisecond
	for time.Since(start) < limit {
		if len(CheckPort(port)) > 0 {
			return true
		}
		time.Sleep(100 * time.Millisecond)
	}
	return false
}
