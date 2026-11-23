package cdp

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"antigravity-hans/internal/app"
	"antigravity-hans/internal/overlay"
	"antigravity-hans/resources"
)

const (
	reconnectTimeout    = 30 * time.Second
	reconnectProbeDelay = 500 * time.Millisecond
	cdpPortGoneLimit    = 2
)

type targetNotification struct {
	Method string `json:"method"`
	Params struct {
		TargetID   string `json:"targetId"`
		TargetInfo struct {
			TargetID string `json:"targetId"`
			Type     string `json:"type"`
			Title    string `json:"title"`
			URL      string `json:"url"`
		} `json:"targetInfo"`
	} `json:"params"`
}

type sessionWatcher struct {
	cfg                 app.Config
	overlaySource       string
	mu                  *sync.Mutex
	injectedSet         map[string]bool
	injectionPending    map[string]bool
	verificationPending map[string]bool
	permanentWarnings   map[string]bool
}

func newSessionWatcher(cfg app.Config, overlaySource string, injectedSet map[string]bool, mu *sync.Mutex) *sessionWatcher {
	return &sessionWatcher{
		cfg:                 cfg,
		overlaySource:       overlaySource,
		mu:                  mu,
		injectedSet:         injectedSet,
		injectionPending:    make(map[string]bool),
		verificationPending: make(map[string]bool),
		permanentWarnings:   make(map[string]bool),
	}
}

func getBrowserWSURL(port int) (string, error) {
	var versionInfo map[string]string
	if err := readCDPJSON(port, "/json/version", &versionInfo); err != nil {
		return "", err
	}
	validated, err := validateCDPWebSocket(versionInfo["webSocketDebuggerUrl"], port)
	if err != nil {
		return "", err
	}
	u, _ := url.Parse(validated)
	if !strings.HasPrefix(u.Path, "/devtools/browser/") {
		return "", fmt.Errorf("不是浏览器级调试地址")
	}
	return validated, nil
}

// Watch 基于 CDP 监听应用页面事件并自动维持汉化注入。
func Watch(cfg app.Config, overlaySource string, injectedSet map[string]bool, mu *sync.Mutex) {
	fmt.Printf("启动 %s 汉化监视模式 (CDP 事件驱动型)...\n", cfg.Name)

	wsURL, err := waitForBrowserWSURL(cfg.Port)
	if err != nil || wsURL == "" {
		fmt.Printf("[错误] 无法连接到 %s 调试接口: %v\n", cfg.Name, err)
		return
	}

	conn, _, err := dialCDP(wsURL, cfg.Port)
	if err != nil {
		fmt.Printf("[错误] 建立 CDP 事件长连接失败: %v\n", err)
		return
	}
	defer func() { _ = conn.Close() }()

	if err := enableTargetDiscovery(conn); err != nil {
		fmt.Printf("[错误] 发送 Target.setDiscoverTargets 失败: %v\n", err)
		return
	}

	fmt.Println("[成功] 汉化监视连接已建立，进入事件驱动注入状态。")
	fmt.Println("[提示] 请保持本控制台窗口运行以维持汉化注入；按 Ctrl+C 可随时退出。")

	w := newSessionWatcher(cfg, overlaySource, injectedSet, mu)
	w.scanInitial("主动初检")

	stopWatchdog := make(chan struct{})
	defer close(stopWatchdog)
	go w.runWatchdog(stopWatchdog)

	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			_ = conn.Close()
			fmt.Printf("与 %s 调试端口的连接断开，正在确认应用状态...\n", cfg.Name)
			newConn, ok := reconnectBrowser(cfg, reconnectProbeDelay)
			if !ok {
				fmt.Printf("[提示] %s 的汉化监视已结束，之后新开的页面将恢复英文。\n", cfg.Name)
				return
			}
			conn = newConn
			fmt.Println("[成功] 已重新建立汉化监视连接。")
			w.scanInitial("主动初检")
			continue
		}
		w.handleNotification(msg)
	}
}

func waitForBrowserWSURL(port int) (string, error) {
	var wsURL string
	var err error
	for i := 0; i < 50; i++ {
		wsURL, err = getBrowserWSURL(port)
		if err == nil && wsURL != "" {
			return wsURL, nil
		}
		time.Sleep(100 * time.Millisecond)
	}
	return wsURL, err
}

func (w *sessionWatcher) scanInitial(triggerType string) {
	for _, target := range CheckPort(w.cfg.Port) {
		w.injectIfMatch(target, target.URL, triggerType)
	}
}

func (w *sessionWatcher) injectIfMatch(target Target, rawURL, triggerType string) {
	candidate, agentPort := candidateTarget(target, w.cfg)
	if target.ID == "" || !candidate {
		return
	}

	w.mu.Lock()
	if w.injectedSet[target.ID] || w.injectionPending[target.ID] {
		w.mu.Unlock()
		return
	}
	w.injectionPending[target.ID] = true
	w.mu.Unlock()

	go w.executeInjection(target, rawURL, triggerType, agentPort)
}

func (w *sessionWatcher) executeInjection(target Target, rawURL, triggerType string, agentPort int) {
	defer func() {
		w.mu.Lock()
		delete(w.injectionPending, target.ID)
		w.mu.Unlock()
	}()

	const maxAttempts = 3
	var lastErr error
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		if agentPort > 0 && !isTrustedIDEAgentFrame(target, w.cfg, agentPort) {
			return
		}
		injected, isPermanent, err := ensureTargetInjected(target, w.overlaySource, agentPort)
		if injected {
			w.mu.Lock()
			w.injectedSet[target.ID] = true
			w.mu.Unlock()
			fmt.Printf("[%s] 捕获到目标页面，成功注入汉化: %s (ID: %s)\n", triggerType, formatTargetLabel(target, rawURL, agentPort), target.ID)
			return
		}
		if isPermanent {
			w.warnOnce(target.ID, err)
			return
		}
		lastErr = err
		if attempt < maxAttempts {
			time.Sleep(time.Duration(attempt) * 200 * time.Millisecond)
		}
	}
	if lastErr != nil {
		fmt.Printf("[警告] 页面注入失败（已重试 %d 次，后续页面事件或后台巡检将自动补刀）: %v (ID: %s)\n", maxAttempts, lastErr, target.ID)
	}
}

func formatTargetLabel(target Target, rawURL string, agentPort int) string {
	if agentPort == swarmFrame {
		return "Swarm 面板"
	}
	if agentPort != 0 {
		return "IDE 智能体页面"
	}
	return getTargetTitle(target.Title, rawURL)
}

func (w *sessionWatcher) warnOnce(targetID string, err error) {
	if err == nil {
		return
	}
	w.mu.Lock()
	shown := w.permanentWarnings[targetID]
	w.permanentWarnings[targetID] = true
	w.mu.Unlock()
	if !shown {
		fmt.Printf("[提示] %v (ID: %s)\n", err, targetID)
	}
}

func (w *sessionWatcher) runWatchdog(stop <-chan struct{}) {
	ticker := time.NewTicker(2000 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
			w.inspectTargets()
		}
	}
}

func (w *sessionWatcher) inspectTargets() {
	for _, t := range CheckPort(w.cfg.Port) {
		candidate, agentPort := candidateTarget(t, w.cfg)
		if !candidate {
			continue
		}

		w.mu.Lock()
		alreadyInjected := w.injectedSet[t.ID]
		isPending := w.injectionPending[t.ID] || w.verificationPending[t.ID]
		if alreadyInjected && !isPending {
			w.verificationPending[t.ID] = true
		}
		w.mu.Unlock()

		if !alreadyInjected && !isPending {
			w.injectIfMatch(t, t.URL, "巡检自愈")
		} else if alreadyInjected && !isPending {
			go w.verifyInjectedTarget(t, agentPort)
		}
	}
}

func (w *sessionWatcher) verifyInjectedTarget(target Target, agentPort int) {
	defer func() {
		w.mu.Lock()
		delete(w.verificationPending, target.ID)
		w.mu.Unlock()
	}()
	if agentPort > 0 && !isTrustedIDEAgentFrame(target, w.cfg, agentPort) {
		w.mu.Lock()
		delete(w.injectedSet, target.ID)
		w.mu.Unlock()
		return
	}
	fingerprint := overlay.Fingerprint(w.overlaySource)
	if agentPort == swarmFrame {
		fingerprint = overlay.Fingerprint(resources.SwarmOverlayJS)
	}
	if !IsTargetInjected(target, fingerprint) {
		w.mu.Lock()
		delete(w.injectedSet, target.ID)
		w.mu.Unlock()
		w.injectIfMatch(target, target.URL, "巡检自愈")
	}
}

func (w *sessionWatcher) handleNotification(msg []byte) {
	var notif targetNotification
	if err := json.Unmarshal(msg, &notif); err != nil {
		return
	}

	if notif.Method == "Target.targetDestroyed" {
		if targetID := notif.Params.TargetID; targetID != "" {
			w.mu.Lock()
			delete(w.injectedSet, targetID)
			delete(w.injectionPending, targetID)
			delete(w.permanentWarnings, targetID)
			w.mu.Unlock()
		}
		return
	}

	if notif.Method == "Target.targetCreated" || notif.Method == "Target.targetInfoChanged" {
		info := notif.Params.TargetInfo
		if info.TargetID == "" || ignoredTargetTypes[info.Type] {
			return
		}
		t := Target{
			ID:                   info.TargetID,
			Type:                 info.Type,
			Title:                info.Title,
			URL:                  info.URL,
			WebSocketDebuggerURL: fmt.Sprintf("ws://127.0.0.1:%d/devtools/page/%s", w.cfg.Port, info.TargetID),
			DebugPort:            w.cfg.Port,
		}
		w.injectIfMatch(t, info.URL, "事件驱动")
	}
}

func enableTargetDiscovery(conn *websocket.Conn) error {
	discoverCmd := map[string]interface{}{
		"id":     1,
		"method": "Target.setDiscoverTargets",
		"params": map[string]bool{
			"discover": true,
		},
	}
	discoverJSON, _ := json.Marshal(discoverCmd)
	if err := conn.SetWriteDeadline(time.Now().Add(5 * time.Second)); err != nil {
		return err
	}
	return conn.WriteMessage(websocket.TextMessage, discoverJSON)
}

func nextBackoff(d time.Duration) time.Duration {
	d *= 2
	if d > 5*time.Second {
		return 5 * time.Second
	}
	return d
}

// reconnectBrowser 在长连接断开后尝试重新建立浏览器级 CDP 连接。
func reconnectBrowser(cfg app.Config, delay time.Duration) (*websocket.Conn, bool) {
	deadline := time.Now().Add(reconnectTimeout)
	backoff := delay
	portGoneCount := 0

	for attempt := 1; ; attempt++ {
		time.Sleep(backoff)
		if !app.Detect(cfg).Running {
			fmt.Printf("检测到 %s 已退出。\n", cfg.Name)
			return nil, false
		}
		if time.Now().After(deadline) {
			fmt.Printf("[提示] 已重连 %s 超过 %s 仍未成功，应用可能不再以调试模式运行，请重新用本工具启动。\n", cfg.Name, reconnectTimeout)
			return nil, false
		}

		port, found := findCDPPort(cfg)
		if found && port != cfg.Port {
			fmt.Printf("[提示] %s 的调试端口已从 %d 变为 %d，请重新用本工具启动以继续汉化。\n", cfg.Name, cfg.Port, port)
			return nil, false
		}
		if !found {
			portGoneCount++
			fmt.Printf("[重连] 第 %d 次尝试：未发现 %s 的调试端口（连续 %d/%d 次）\n", attempt, cfg.Name, portGoneCount, cdpPortGoneLimit)
			if portGoneCount >= cdpPortGoneLimit {
				fmt.Printf("[提示] %s 的调试接口已关闭（应用可能已退出或不再以调试模式运行），请重新用本工具启动。\n", cfg.Name)
				return nil, false
			}
			backoff = nextBackoff(backoff)
			continue
		}
		portGoneCount = 0

		wsURL, err := getBrowserWSURL(cfg.Port)
		if err != nil || wsURL == "" {
			fmt.Printf("[重连] 第 %d 次尝试：调试接口暂不可用（%s 后重试）\n", attempt, nextBackoff(backoff))
			backoff = nextBackoff(backoff)
			continue
		}
		conn, _, err := dialCDP(wsURL, cfg.Port)
		if err != nil {
			fmt.Printf("[警告] 重新连接 CDP 失败: %v（%s 后重试）\n", err, nextBackoff(backoff))
			backoff = nextBackoff(backoff)
			continue
		}
		if err := enableTargetDiscovery(conn); err != nil {
			_ = conn.Close()
			fmt.Printf("[警告] 重新开启 Target 发现失败: %v（%s 后重试）\n", err, nextBackoff(backoff))
			backoff = nextBackoff(backoff)
			continue
		}
		fmt.Printf("[成功] 已重新建立汉化监视连接（第 %d 次尝试）。\n", attempt)
		return conn, true
	}
}
