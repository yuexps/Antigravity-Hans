package cdp

import (
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"antigravity-hans/internal/app"
	"antigravity-hans/internal/process"
)

func TestIsTargetPageIDEWorkbenches(t *testing.T) {
	tests := []struct {
		name string
		url  string
		want bool
	}{
		{name: "main workbench", url: "file:///Applications/Antigravity%20IDE.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html", want: true},
		{name: "main workbench with query", url: "vscode-file://vscode-app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html?folder=/tmp/project", want: true},
		{name: "jetski workbench", url: "file:///tmp/workbench-jetski-agent.html", want: true},
		{name: "unrelated page", url: "devtools://devtools/bundled/inspector.html", want: false},
		{name: "remote page with workbench in path", url: "https://example.test/workbench.html", want: false},
		{name: "local web preview with workbench in path", url: "http://127.0.0.1:3000/workbench.html", want: false},
		{name: "workbench in query", url: "vscode-file://vscode-app/other.html?next=workbench.html", want: false},
		{name: "foreign vscode-file host", url: "vscode-file://other/workbench.html", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isTargetPage(tt.url, app.DefaultIDE().Name); got != tt.want {
				t.Fatalf("isTargetPage(%q, %q) = %v, want %v", tt.url, app.DefaultIDE().Name, got, tt.want)
			}
		})
	}
}

func TestIsTargetPageAppNormal(t *testing.T) {
	tests := []struct {
		name string
		url  string
		want bool
	}{
		{name: "local internal service url", url: "https://127.0.0.1:49689/c/34edf1e5-b701-4d5a-9db0-a4af67ecd229", want: true},
		{name: "localhost url", url: "http://localhost:3000/app", want: true},
		{name: "splash data url", url: "data:text/html;base64,PGh0bWw+...", want: true},
		{name: "devtools inspector", url: "devtools://devtools/bundled/inspector.html", want: false},
		{name: "external web url", url: "https://google.com", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isTargetPage(tt.url, app.DefaultNormal().Name); got != tt.want {
				t.Fatalf("isTargetPage(%q, %q) = %v, want %v", tt.url, app.DefaultNormal().Name, got, tt.want)
			}
		})
	}
}

func TestTruncateRunes(t *testing.T) {
	short := "Antigravity"
	if got := truncateRunes(short, 100); got != short {
		t.Fatalf("未超长的字符串不应被修改: %q", got)
	}

	long := strings.Repeat("汉", 200)
	got := truncateRunes(long, 100)
	if !utf8.ValidString(got) {
		t.Fatalf("截断结果不是合法的 UTF-8: %q", got)
	}
	if runes := []rune(got); len(runes) != 100 {
		t.Fatalf("截断后应为 100 个字符，实际 %d", len(runes))
	}
	if !strings.HasSuffix(got, "...") {
		t.Fatalf("截断结果应以省略号结尾: %q", got)
	}
}

func TestGetTargetTitleKeepsValidUTF8(t *testing.T) {
	title := strings.Repeat("汉", 150)
	got := getTargetTitle(title, "")
	if !utf8.ValidString(got) {
		t.Fatalf("标题截断后不是合法 UTF-8: %q", got)
	}
}

func TestCDPResponseError(t *testing.T) {
	if err := cdpResponseError(map[string]interface{}{
		"error": map[string]interface{}{"message": "method not found"},
	}, "Page.enable"); err == nil {
		t.Fatal("expected CDP protocol error")
	}

	if err := cdpResponseError(map[string]interface{}{
		"result": map[string]interface{}{
			"exceptionDetails": map[string]interface{}{
				"text": "Uncaught SyntaxError",
			},
		},
	}, "Runtime.evaluate"); err == nil {
		t.Fatal("expected Runtime.evaluate exception")
	}

	if err := cdpResponseError(map[string]interface{}{
		"result": map[string]interface{}{"result": map[string]interface{}{"value": true}},
	}, "Runtime.evaluate"); err != nil {
		t.Fatalf("unexpected response error: %v", err)
	}
}

func TestReconnectBrowserStopsWhenAppNotRunning(t *testing.T) {
	cfg := app.Config{Name: "ReconnectTestApp", Exe: "reconnect-test-app-not-running.exe", Port: 58329}

	start := time.Now()
	conn, ok := reconnectBrowser(cfg, 10*time.Millisecond)
	elapsed := time.Since(start)

	if ok || conn != nil {
		t.Fatalf("应用未运行时应放弃重连，实际 ok=%v", ok)
	}
	if elapsed >= reconnectTimeout {
		t.Fatalf("应用未运行时不应等满 %s，实际耗时 %s", reconnectTimeout, elapsed)
	}
}

func TestReconnectBrowserGivesUpWhenDebugPortGone(t *testing.T) {
	exePath, err := os.Executable()
	if err != nil {
		t.Skipf("无法获取测试进程路径: %v", err)
	}
	cfg := app.Config{Name: "ReconnectTestApp", Exe: filepath.Base(exePath), Port: 58329}
	if !app.Detect(cfg).Running {
		t.Skip("当前测试进程未被识别为目标应用，跳过")
	}

	start := time.Now()
	conn, ok := reconnectBrowser(cfg, 10*time.Millisecond)
	elapsed := time.Since(start)

	if ok || conn != nil {
		t.Fatalf("调试端口消失时应放弃重连，实际 ok=%v", ok)
	}
	if elapsed >= reconnectTimeout {
		t.Fatalf("调试端口消失后不应等满 %s，实际耗时 %s", reconnectTimeout, elapsed)
	}
}

func TestCandidatePorts(t *testing.T) {
	ports := candidatePorts(58321)
	if len(ports) != portFallbackCount+1 {
		t.Fatalf("候选端口数量应为 %d，实际 %d", portFallbackCount+1, len(ports))
	}
	if ports[0] != 58321 || ports[len(ports)-1] != 58321+portFallbackCount {
		t.Fatalf("候选端口范围不对: %v", ports)
	}
}

func TestSelectFreePortSkipsOccupied(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Skipf("无法监听本地端口: %v", err)
	}
	defer ln.Close()
	busy := ln.Addr().(*net.TCPAddr).Port

	got, ok := selectFreePort(busy)
	if !ok {
		t.Fatal("应当能找到可用的备用端口")
	}
	if got == busy {
		t.Fatalf("不应选中已被占用的端口 %d", busy)
	}
	allowed := false
	for _, p := range candidatePorts(busy) {
		if p == got {
			allowed = true
		}
	}
	if !allowed {
		t.Fatalf("选出的端口 %d 不在候选列表内", got)
	}
}

func freeTCPPort(t *testing.T) int {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Skipf("无法获取空闲端口: %v", err)
	}
	defer ln.Close()
	return ln.Addr().(*net.TCPAddr).Port
}

func TestFindCDPPortDetectsEndpoint(t *testing.T) {
	base := freeTCPPort(t)
	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", base))
	if err != nil {
		t.Skipf("无法监听 %d: %v", base, err)
	}
	defer ln.Close()

	go func() {
		_ = http.Serve(ln, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/json/list" {
				http.NotFound(w, r)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = fmt.Fprintf(w, `[{"id":"t1","type":"page","title":"主窗口","url":"https://127.0.0.1:1/app","webSocketDebuggerUrl":"ws://127.0.0.1:%d/devtools/page/t1"}]`, base)
		}))
	}()

	port, found := findCDPPortWithOwner(app.Config{Name: app.DefaultNormal().Name, Port: base}, func(port int) bool { return port == base })
	if !found {
		t.Fatalf("应识别出 %d 上的 CDP 端点", base)
	}
	if port != base {
		t.Fatalf("应返回命中端口 %d，实际 %d", base, port)
	}

	if free, _ := selectFreePort(base); free == base {
		t.Fatalf("已有 CDP 端点占用的端口 %d 不应被当作空闲端口", base)
	}
}

func TestIsPortFreeDetectsListener(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Skipf("无法监听本地端口: %v", err)
	}
	defer ln.Close()
	busy := ln.Addr().(*net.TCPAddr).Port
	if isPortFree(busy) {
		t.Fatalf("已被占用的端口 %d 不应被判定为空闲", busy)
	}
}

func TestAttachOnlyDoesNotLaunchWithoutDebugPort(t *testing.T) {
	process.SetMonitorStateDirForTest(t.TempDir())
	t.Cleanup(func() { process.SetMonitorStateDirForTest("") })

	name := "antigravity-hans-never-launch-test"
	if app.IsWindows {
		name += ".exe"
	}
	fake := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(fake, []byte("not an executable"), 0o700); err != nil {
		t.Fatal(err)
	}
	cfg := app.Config{Name: "attach-only-test", Exe: name, Port: 1, PossiblePaths: []string{fake}}

	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	defer reader.Close()
	previousStdout := os.Stdout
	os.Stdout = writer
	defer func() { os.Stdout = previousStdout }()
	Run(cfg, "", RunOptions{AttachOnly: true}, nil)
	_ = writer.Close()
	os.Stdout = previousStdout
	output, err := io.ReadAll(reader)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(output), "仅连接模式不会启动或重启应用") {
		t.Fatalf("未报告仅连接模式：%s", output)
	}
	if strings.Contains(string(output), "正在以调试模式启动") {
		t.Fatalf("仅连接模式尝试启动应用：%s", output)
	}
}

func TestRunningNormalAppEndpoint(t *testing.T) {
	if os.Getenv("AGY_HANS_TEST_RUNNING_APP") != "1" {
		t.Skip("set AGY_HANS_TEST_RUNNING_APP=1 with the normal app open")
	}
	normal := app.DefaultNormal()
	port, ok := findCDPPort(normal)
	if !ok {
		t.Fatal("cannot identify an owned normal-app CDP listener")
	}
	if _, err := getBrowserWSURL(port); err != nil {
		t.Fatal(err)
	}
	targets := CheckPort(port)
	matched := false
	for _, target := range targets {
		if isTargetPage(target.URL, normal.Name) {
			matched = true
		}
	}
	if !matched {
		t.Fatal("normal app has no matching application page")
	}
	t.Logf("verified owned ordinary-app CDP endpoint on port %d", port)
}
