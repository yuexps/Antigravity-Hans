package main

import (
	"encoding/json"
	"fmt"
	"net/url"
	"path"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
)

// CDPTarget 调试目标页面
type CDPTarget struct {
	ID                   string `json:"id"`
	Type                 string `json:"type"`
	Title                string `json:"title"`
	URL                  string `json:"url"`
	WebSocketDebuggerURL string `json:"webSocketDebuggerUrl"`
	DebugPort            int    `json:"-"`
}

// cdpIDCounter CDP 消息 ID 计数器
var cdpIDCounter atomic.Int64

// cdpCall 发送 CDP 命令并等待响应
func cdpCall(conn *websocket.Conn, method string, params map[string]interface{}) (map[string]interface{}, error) {
	id := cdpIDCounter.Add(1)
	payload := map[string]interface{}{
		"id":     id,
		"method": method,
		"params": params,
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	if err := conn.SetWriteDeadline(time.Now().Add(5 * time.Second)); err != nil {
		return nil, err
	}
	if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
		return nil, fmt.Errorf("发送 CDP 消息失败: %w", err)
	}

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		conn.SetReadDeadline(deadline)
		_, msg, err := conn.ReadMessage()
		if err != nil {
			return nil, fmt.Errorf("接收 CDP 响应失败: %w", err)
		}
		var resp map[string]interface{}
		if err := json.Unmarshal(msg, &resp); err != nil {
			continue
		}
		if respID, ok := resp["id"]; ok {
			matched := false
			switch v := respID.(type) {
			case float64:
				matched = int64(v) == id
			case string:
				matched = v == strconv.FormatInt(id, 10)
			}
			if matched {
				if err := cdpResponseError(resp, method); err != nil {
					return nil, err
				}
				return resp, nil
			}
		}
	}
	return nil, fmt.Errorf("等待 %s 响应超时", method)
}

// cdpResponseError 将 CDP 协议错误和 Runtime.evaluate 的 JS 异常统一转换为 Go 错误。
// CDP 即使执行脚本抛异常，WebSocket 命令本身通常仍会返回成功，因此不能只检查 cdpCall 的网络错误。
func cdpResponseError(resp map[string]interface{}, method string) error {
	if protocolErr, ok := resp["error"].(map[string]interface{}); ok {
		message, _ := protocolErr["message"].(string)
		if message == "" {
			message = fmt.Sprint(protocolErr)
		}
		return fmt.Errorf("CDP %s 失败: %s", method, message)
	}

	result, ok := resp["result"].(map[string]interface{})
	if !ok {
		return nil
	}
	if exception, ok := result["exceptionDetails"].(map[string]interface{}); ok {
		description, _ := exception["text"].(string)
		if description == "" {
			if value, ok := exception["exception"].(map[string]interface{}); ok {
				description, _ = value["description"].(string)
			}
		}
		if description == "" {
			description = fmt.Sprint(exception)
		}
		return fmt.Errorf("Runtime.evaluate 执行异常: %s", description)
	}
	return nil
}

// isTargetPage 判断目标是否为需汉化页面
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

// candidateTarget only identifies the shape of a target. IDE agent frames
// require an additional process ownership check before any injection.
func candidateTarget(target CDPTarget, cfg AppConfig) (bool, int) {
	if isTargetPage(target.URL, cfg.Name) {
		return true, 0
	}
	if cfg.Name == AppIDE.Name {
		if port, ok := ideAgentFramePort(target); ok {
			return true, port
		}
	}
	return false, 0
}

// truncateRunes 按字符（而非字节）截断，避免把中文标题截断成半个 UTF-8 字符
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

// getTargetTitle 获取页面标题
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

// CheckPort 获取可注入的调试目标列表
func CheckPort(port int) []CDPTarget {
	var targets []CDPTarget
	if err := readCDPJSON(port, "/json/list", &targets); err != nil {
		return nil
	}

	ignoredTypes := map[string]bool{
		"worker": true, "service_worker": true,
		"shared_worker": true, "background_page": true,
	}
	var result []CDPTarget
	for _, t := range targets {
		if validated, err := validateCDPWebSocket(t.WebSocketDebuggerURL, port); !ignoredTypes[t.Type] && err == nil {
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

// checkTargetInjectedOnConn 检查当前连接对应的页面文档是否已注入补丁
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
// 避免为每次操作频繁建立/断开短连接，彻底杜绝 Windows ConnectEx 端口耗尽 (WSAEADDRINUSE 10048) 冲突。
// 返回值：(injected bool, isPermanentErr bool, err error)
func EnsureTargetInjected(target CDPTarget, overlaySource string) (bool, bool, error) {
	return ensureTargetInjected(target, overlaySource, 0)
}

// agentPort is nonzero only for an IDE iframe whose listener ownership was
// verified by the caller. Such frames may navigate to arbitrary web pages.
func ensureTargetInjected(target CDPTarget, overlaySource string, agentPort int) (bool, bool, error) {
	var agentRoute string
	if agentPort != 0 {
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
		// 对端返回 404/500（如 Splash 页面关闭后 No such target id）或明确拒绝，代表目标已销毁，无需重试
		isPermanent := false
		if resp != nil && (resp.StatusCode == 404 || resp.StatusCode == 500) {
			isPermanent = true
		} else if strings.Contains(err.Error(), "refused") || strings.Contains(err.Error(), "No such target") {
			isPermanent = true
		}
		return false, isPermanent, fmt.Errorf("连接 WebSocket 失败: %w", err)
	}
	defer conn.Close()

	// 1. 在同一个连接上先复核是否已完成注入
	fingerprint := overlayFingerprint(overlaySource)
	injected, err := checkTargetInjectedOnConn(conn, fingerprint)
	if err == nil && injected {
		return true, false, nil
	}
	legacyResp, legacyErr := cdpCall(conn, "Runtime.evaluate", map[string]interface{}{
		"expression":    "window.__antigravityZhPatchInstalled === true && window.__observedDocument === document && typeof window.__antigravityZhPatchCleanup !== 'function'",
		"returnByValue": true,
	})
	if legacyErr != nil {
		return false, false, legacyErr
	}
	if result, ok := legacyResp["result"].(map[string]interface{}); ok {
		if value, ok := result["result"].(map[string]interface{}); ok && value["value"] == true {
			return false, true, fmt.Errorf("页面仍运行没有清理入口的旧版汉化脚本，请重新加载此窗口以更新词库")
		}
	}
	injectionSource := fmt.Sprintf("window.__antigravityZhPatchRequestedFingerprint = %q;\n%s", fingerprint, overlaySource)
	if agentPort != 0 {
		// Do not register a persistent new-document script on a webview. The
		// frame could navigate to a different page; the watcher must recheck
		// the new URL and listener owner before each subsequent injection.
		injectionSource = ideAgentInjectionSource(injectionSource, agentPort, agentRoute)
	} else {
		// 2. 启用 Page 域支持并注册主页面刷新后的自动注入。
		_, _ = cdpCall(conn, "Page.enable", nil)
		if _, err := cdpCall(conn, "Page.addScriptToEvaluateOnNewDocument", map[string]interface{}{
			"source": injectionSource,
		}); err != nil {
			return false, false, fmt.Errorf("监听页面刷新失败: %w", err)
		}
	}

	// 4. 当前页面立即执行注入
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

	// 5. 在同一连接上直接复核安装状态
	verified, _ := checkTargetInjectedOnConn(conn, fingerprint)
	if !verified {
		return false, false, fmt.Errorf("注入后页面未确认汉化脚本已安装")
	}

	return true, false, nil
}

// IsTargetInjected 检测页面当前文档是否真正已注入汉化补丁
func IsTargetInjected(target CDPTarget, fingerprint ...string) bool {
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

// InjectTarget 向目标页面注入脚本（兼容包装）
func InjectTarget(target CDPTarget, overlaySource string, injectedSet map[string]bool, mu *sync.Mutex) error {
	injected, _, err := EnsureTargetInjected(target, overlaySource)
	if injected && target.ID != "" && mu != nil {
		mu.Lock()
		injectedSet[target.ID] = true
		mu.Unlock()
	}
	return err
}

// WaitForPort 等待调试端口就绪
func WaitForPort(port int, maxWaitMs int) bool {
	start := time.Now()
	limit := time.Duration(maxWaitMs) * time.Millisecond
	for time.Since(start) < limit {
		targets := CheckPort(port)
		if len(targets) > 0 {
			return true
		}
		time.Sleep(100 * time.Millisecond)
	}
	return false
}

// Run 启动并监视目标应用。
// interactive 为 false 时（--nogui / 后台启动）不会询问安装实例，
// 否则在控制台被隐藏的快捷方式下会永久挂起。
// attachOnly 为 true 时只复用已开启的调试端口，不启动或重启应用。
func Run(cfg AppConfig, overlaySource string, interactive, attachOnly bool) {
	// 单实例保护：重复双击快捷方式会让多个监视器叠加注入
	release, ok := acquireMonitorLock(cfg)
	if !ok {
		focusRunningNormalApp(cfg)
		return
	}
	defer release()

	injectedSet := make(map[string]bool)
	var mu sync.Mutex

	// 候选端口里已有调试端点（多半是上一次由本工具启动、仍在运行的实例）：
	// 直接复用该端口进入监视，不要把它杀掉重启
	if port, found := findCDPPort(cfg); found {
		cfg.Port = port
		fmt.Printf("检测到 %s 调试端口 %d 已开启，直接进入监视模式...\n", cfg.Name, port)
		focusRunningNormalApp(cfg)
		Watch(cfg, overlaySource, injectedSet, &mu)
		return
	}

	if attachOnly {
		fmt.Printf("[提示] 未找到 %s 可复用的调试端口；仅连接模式不会启动或重启应用。\n", cfg.Name)
		return
	}

	app := DetectApp(cfg)

	// 进程未开启调试端口则重启
	if app.Running {
		fmt.Printf("[提示] 检测到 %s 正在运行，但未开启调试端口。正在重新拉起...\n", app.Name)
		if !KillProcess(cfg) {
			return
		}
		time.Sleep(1500 * time.Millisecond)
	}

	// 首选端口落在系统临时端口区间内，可能被别的进程占用，这里挑一个空闲的
	if port, ok := selectFreePort(cfg.Port); ok {
		if port != cfg.Port {
			fmt.Printf("[提示] 首选端口 %d 已被占用，本次改用 %d。\n", cfg.Port, port)
		}
		cfg.Port = port
	} else {
		fmt.Printf("[错误] 候选端口 %v 均被占用，已中止启动。\n", candidatePorts(cfg.Port))
		return
	}

	// 确定启动路径
	app = DetectApp(cfg)
	targetPath := app.Path
	if targetPath == "" {
		switch len(app.AllPaths) {
		case 0:
			fmt.Printf("[错误] 未能在本机找到 %s 的安装路径。\n", app.Name)
			return
		case 1:
			targetPath = app.AllPaths[0]
		default:
			fmt.Printf("\n检测到本机存在多个 %s 安装实例，请选择启动哪一个：\n", app.Name)
			for i, p := range app.AllPaths {
				fmt.Printf(" [%d] %s\n", i+1, p)
			}
			if !interactive {
				// 控制台不可见时绝不能等待输入：直接取第一个实例
				fmt.Printf("[提示] 非交互模式，自动选择第 1 个安装实例。\n")
				targetPath = app.AllPaths[0]
			} else {
				var choice int
				fmt.Printf("请选择 (1-%d, 默认 1): ", len(app.AllPaths))
				fmt.Scan(&choice)
				if choice < 1 || choice > len(app.AllPaths) {
					choice = 1
				}
				targetPath = app.AllPaths[choice-1]
			}
		}
	}

	// 启动前最后一道校验：路径必须确实是目标应用的可执行文件
	if !isExpectedExecutable(targetPath, cfg) {
		fmt.Printf("[错误] 启动路径校验未通过（期望可执行文件 %s）: %s\n", cfg.Exe, targetPath)
		return
	}

	// 启动并监视
	fmt.Printf("正在以调试模式启动 %s: %s (调试端口 %d) ...\n", app.Name, targetPath, app.Port)
	if err := LaunchWithDebug(targetPath, app.Port); err != nil {
		fmt.Printf("[错误] 启动失败: %v\n", err)
		return
	}
	fmt.Printf("正在等待 %s 调试端口就绪并建立监视...\n", app.Name)
	if WaitForPort(app.Port, 20000) {
		fmt.Printf("[成功] %s 调试接口已就绪。\n", app.Name)
	} else {
		fmt.Printf("[警告] 等待 %s 调试端口超时，尝试直接连接...\n", app.Name)
	}

	Watch(cfg, overlaySource, injectedSet, &mu)
}

// getBrowserWSURL 获取浏览器级 WebSocket 调试 URL
func getBrowserWSURL(port int) (string, error) {
	var versionInfo map[string]string
	if err := readCDPJSON(port, "/json/version", &versionInfo); err != nil {
		return "", err
	}
	wsURL := versionInfo["webSocketDebuggerUrl"]
	validated, err := validateCDPWebSocket(wsURL, port)
	if err != nil {
		return "", err
	}
	u, _ := url.Parse(validated)
	if !strings.HasPrefix(u.Path, "/devtools/browser/") {
		return "", fmt.Errorf("不是浏览器级调试地址")
	}
	return validated, nil
}

// Watch 基于 CDP 监听并自动注入
func Watch(cfg AppConfig, overlaySource string, injectedSet map[string]bool, mu *sync.Mutex) {
	fmt.Printf("启动 %s 汉化监视模式 (CDP 事件驱动型)...\n", cfg.Name)

	var wsURL string
	var err error

	// 获取调试地址
	for i := 0; i < 50; i++ {
		wsURL, err = getBrowserWSURL(cfg.Port)
		if err == nil && wsURL != "" {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}

	if err != nil || wsURL == "" {
		fmt.Printf("[错误] 无法连接到 %s 调试接口: %v\n", cfg.Name, err)
		return
	}

	// 建立调试连接
	conn, _, err := dialCDP(wsURL, cfg.Port)
	if err != nil {
		fmt.Printf("[错误] 建立 CDP 事件长连接失败: %v\n", err)
		return
	}
	// 必须用闭包捕获变量：重连后 conn 会被替换，退出时要关闭的是当前那条连接
	defer func() { _ = conn.Close() }()

	// 开启 Target 发现
	if err := enableTargetDiscovery(conn); err != nil {
		fmt.Printf("[错误] 发送 Target.setDiscoverTargets 失败: %v\n", err)
		return
	}

	fmt.Println("[成功] 汉化监视连接已建立，进入事件驱动注入状态。")
	fmt.Println("[提示] 请保持本控制台窗口运行以维持汉化注入；按 Ctrl+C 可随时退出。")

	// 目标注入逻辑
	injectionPending := make(map[string]bool)
	verificationPending := make(map[string]bool)
	permanentWarnings := make(map[string]bool)
	fingerprint := overlayFingerprint(overlaySource)
	injectIfMatch := func(target CDPTarget, rawURL, triggerType string) {
		candidate, agentPort := candidateTarget(target, cfg)
		if target.ID == "" || !candidate {
			return
		}

		// 同一页面可能同时收到 targetCreated、targetInfoChanged 和主动初检，
		// 只允许一个注入任务运行；若已成功注入则无需重复注入。
		mu.Lock()
		if injectedSet[target.ID] || injectionPending[target.ID] {
			mu.Unlock()
			return
		}
		injectionPending[target.ID] = true
		mu.Unlock()

		go func() {
			defer func() {
				mu.Lock()
				delete(injectionPending, target.ID)
				mu.Unlock()
			}()
			const maxAttempts = 3
			var lastErr error
			for attempt := 1; attempt <= maxAttempts; attempt++ {
				// The iframe listener must still belong to this IDE instance on
				// every attempt, including retries after the DOM becomes ready.
				if agentPort != 0 && !isTrustedIDEAgentFrame(target, cfg, agentPort) {
					return
				}
				// 单连接复用，检查当前页面并复核注入状态。
				injected, isPermanent, err := ensureTargetInjected(target, overlaySource, agentPort)
				if injected {
					mu.Lock()
					injectedSet[target.ID] = true
					mu.Unlock()
					title := getTargetTitle(target.Title, rawURL)
					if agentPort != 0 {
						title = "IDE 智能体页面"
					}
					fmt.Printf("[%s] 捕获到目标页面，成功注入汉化: %s (ID: %s)\n", triggerType, title, target.ID)
					return
				}

				// 若目标已被 Electron 销毁（如 Splash 首屏页面关闭），属于永久性状态，直接终止重试
				if isPermanent {
					if err != nil {
						mu.Lock()
						shown := permanentWarnings[target.ID]
						permanentWarnings[target.ID] = true
						mu.Unlock()
						if !shown {
							fmt.Printf("[提示] %v (ID: %s)\n", err, target.ID)
						}
					}
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
		}()
	}

	// 初始目标注入
	initialTargets := CheckPort(cfg.Port)
	for _, it := range initialTargets {
		injectIfMatch(it, it.URL, "主动初检")
	}

	// 启动后台 Watchdog 巡检器（彻底解决启动瞬间竞态、偶发残留英文版、页面重新导航问题）
	stopWatchdog := make(chan struct{})
	defer close(stopWatchdog)

	go func() {
		ticker := time.NewTicker(2000 * time.Millisecond)
		defer ticker.Stop()

		for {
			select {
			case <-stopWatchdog:
				return
			case <-ticker.C:
				targets := CheckPort(cfg.Port)
				for _, t := range targets {
					candidate, agentPort := candidateTarget(t, cfg)
					if !candidate {
						continue
					}

					mu.Lock()
					alreadyInjected := injectedSet[t.ID]
					isPending := injectionPending[t.ID] || verificationPending[t.ID]
					if alreadyInjected && !isPending {
						verificationPending[t.ID] = true
					}
					mu.Unlock()

					// 兜底自愈：若发现符合条件的存活页面尚未注入且未在注入队列中，立即自动补刀
					if !alreadyInjected && !isPending {
						injectIfMatch(t, t.URL, "巡检自愈")
					} else if alreadyInjected && !isPending {
						// 复核已注入页面：若用户刷新导致文档重置（__observedDocument 失效），重新补刀
						go func(target CDPTarget, agentPort int) {
							defer func() { mu.Lock(); delete(verificationPending, target.ID); mu.Unlock() }()
							if agentPort != 0 && !isTrustedIDEAgentFrame(target, cfg, agentPort) {
								mu.Lock()
								delete(injectedSet, target.ID)
								mu.Unlock()
								return
							}
							if !IsTargetInjected(target, fingerprint) {
								mu.Lock()
								delete(injectedSet, target.ID)
								mu.Unlock()
								injectIfMatch(target, target.URL, "巡检自愈")
							}
						}(t, agentPort)
					}
				}
			}
		}
	}()

	// 事件监听
	type TargetInfo struct {
		TargetID string `json:"targetId"`
		Type     string `json:"type"`
		Title    string `json:"title"`
		URL      string `json:"url"`
	}
	type CDPNotification struct {
		Method string `json:"method"`
		Params struct {
			TargetID   string     `json:"targetId"`
			TargetInfo TargetInfo `json:"targetInfo"`
		} `json:"params"`
	}

	ignoredTypes := map[string]bool{
		"worker": true, "service_worker": true,
		"shared_worker": true, "background_page": true,
	}

	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			_ = conn.Close()
			fmt.Printf("与 %s 调试端口的连接断开，正在确认应用状态...\n", cfg.Name)

			// 就地重连，不再递归调用 Watch：
			// 递归会让上一层的 Watchdog 巡检 goroutine 一直存活（defer 要等内层返回才执行），
			// 每断线一次就多一个每 2 秒轮询的巡检器，最终自己把自己的调试端口打成连接风暴。
			newConn, ok := reconnectBrowser(cfg, 1500*time.Millisecond)
			if !ok {
				fmt.Printf("结束 %s 的汉化监视。\n", cfg.Name)
				return
			}
			conn = newConn
			fmt.Println("[成功] 已重新建立汉化监视连接。")

			// 断线期间新开的页面由巡检器兜底，这里再补一次主动初检
			for _, it := range CheckPort(cfg.Port) {
				injectIfMatch(it, it.URL, "主动初检")
			}
			continue
		}

		var notif CDPNotification
		if err := json.Unmarshal(msg, &notif); err != nil {
			continue
		}

		// 监听目标销毁（如 Splash 页面关闭），及时清理状态
		if notif.Method == "Target.targetDestroyed" {
			targetID := notif.Params.TargetID
			if targetID != "" {
				mu.Lock()
				delete(injectedSet, targetID)
				delete(injectionPending, targetID)
				delete(permanentWarnings, targetID)
				mu.Unlock()
			}
			continue
		}

		// 监听目标创建与变更
		if notif.Method == "Target.targetCreated" || notif.Method == "Target.targetInfoChanged" {
			info := notif.Params.TargetInfo
			if info.TargetID == "" || ignoredTypes[info.Type] {
				continue
			}

			t := CDPTarget{
				ID:                   info.TargetID,
				Type:                 info.Type,
				Title:                info.Title,
				URL:                  info.URL,
				WebSocketDebuggerURL: fmt.Sprintf("ws://127.0.0.1:%d/devtools/page/%s", cfg.Port, info.TargetID),
				DebugPort:            cfg.Port,
			}

			injectIfMatch(t, info.URL, "事件驱动")
		}
	}
}

// reconnectTimeout 是断线后持续重连的最长时间，超过则认为应用已不再处于调试模式
const reconnectTimeout = 30 * time.Second

// enableTargetDiscovery 开启 Target 事件发现
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

// nextBackoff 逐步放大重连间隔，避免密集重试
func nextBackoff(d time.Duration) time.Duration {
	d *= 2
	if d > 5*time.Second {
		return 5 * time.Second
	}
	return d
}

// reconnectBrowser 在长连接断开后重新建立浏览器级连接。
// 应用已退出或超过 reconnectTimeout 仍未成功时返回 false，由调用方结束监视。
func reconnectBrowser(cfg AppConfig, delay time.Duration) (*websocket.Conn, bool) {
	deadline := time.Now().Add(reconnectTimeout)
	backoff := delay

	for {
		time.Sleep(backoff)
		if !DetectApp(cfg).Running {
			fmt.Printf("检测到 %s 已退出。\n", cfg.Name)
			return nil, false
		}
		if time.Now().After(deadline) {
			fmt.Printf("[提示] 已重连 %s 超过 %s 仍未成功，应用可能不再以调试模式运行，请重新用本工具启动。\n", cfg.Name, reconnectTimeout)
			return nil, false
		}
		if port, found := findCDPPort(cfg); !found || port != cfg.Port {
			backoff = nextBackoff(backoff)
			continue
		}

		wsURL, err := getBrowserWSURL(cfg.Port)
		if err != nil || wsURL == "" {
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
			fmt.Printf("[警告] 重新开启 Target 发现失败: %v\n", err)
			backoff = nextBackoff(backoff)
			continue
		}
		return conn, true
	}
}
