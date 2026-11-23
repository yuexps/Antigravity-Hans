package cdp

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/gorilla/websocket"
	procnet "github.com/shirou/gopsutil/v4/net"

	"antigravity-hans/internal/app"
	"antigravity-hans/resources"
)

func serverPort(s *httptest.Server) int { return s.Listener.Addr().(*net.TCPAddr).Port }

func TestNormalAppURLRequiresLoopbackHost(t *testing.T) {
	for _, raw := range []string{"https://localhost.example.invalid/", "https://example.invalid/?next=http://localhost:3000", "file:///tmp/localhost.html", "https://127.0.0.1@example.invalid/"} {
		if isTargetPage(raw, app.DefaultNormal().Name) {
			t.Errorf("remote or non-app page accepted: %s", raw)
		}
	}
}

func TestCDPWebSocketBoundary(t *testing.T) {
	for _, raw := range []string{"ws://example.invalid:58321/devtools/page/a", "ws://localhost.example.invalid:58321/devtools/page/a", "ws://127.0.0.1:58322/devtools/page/a", "ws://user@127.0.0.1:58321/devtools/page/a", "ws://127.0.0.1:58321/unrelated", "ws://127.0.0.1:58321/devtools/page/a?redirect=1", "wss://127.0.0.1:58321/devtools/page/a"} {
		if _, err := validateCDPWebSocket(raw, 58321); err == nil {
			t.Errorf("unsafe URL accepted: %s", raw)
		}
	}
	if got, err := validateCDPWebSocket("ws://localhost:58321/devtools/page/a", 58321); err != nil || !strings.Contains(got, "127.0.0.1:58321") {
		t.Fatalf("localhost not pinned to loopback: %s %v", got, err)
	}
	if _, err := validateCDPWebSocket("ws://127.0.0.2:58321/devtools/page/a", 58321); err == nil {
		t.Fatal("different loopback host accepted")
	}
}

func TestCDPJSONRejectsRedirectsAndOversizedResponses(t *testing.T) {
	var followed atomic.Int32
	foreign := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { followed.Add(1); _, _ = fmt.Fprint(w, `[]`) }))
	defer foreign.Close()
	redirect := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, foreign.URL, http.StatusFound) }))
	defer redirect.Close()
	var dst interface{}
	if err := readCDPJSON(serverPort(redirect), "/json/list", &dst); err == nil || followed.Load() != 0 {
		t.Fatal("CDP followed a redirect")
	}
	large := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = fmt.Fprint(w, strings.Repeat(" ", maxCDPJSONSize+1))
	}))
	defer large.Close()
	if err := readCDPJSON(serverPort(large), "/json/list", &dst); err == nil {
		t.Fatal("oversized response accepted")
	}
}

func TestCheckPortRejectsForeignWebsocket(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode([]Target{{ID: "a", Type: "page", URL: "https://127.0.0.1/app", WebSocketDebuggerURL: "ws://example.invalid:58321/devtools/page/a"}})
	}))
	defer s.Close()
	if got := CheckPort(serverPort(s)); len(got) != 0 {
		t.Fatal("foreign WebSocket target accepted")
	}
}

func TestFindPortRequiresOwnerAndMatchingApp(t *testing.T) {
	var s *httptest.Server
	var pageURL atomic.Value
	pageURL.Store("https://127.0.0.1:3000/app")
	s = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode([]Target{{ID: "a", Type: "page", URL: pageURL.Load().(string), WebSocketDebuggerURL: fmt.Sprintf("ws://127.0.0.1:%d/devtools/page/a", serverPort(s))}})
	}))
	defer s.Close()
	port := serverPort(s)
	cfg := app.Config{Name: app.DefaultNormal().Name, Port: port}
	if _, ok := findCDPPortWithOwner(cfg, func(int) bool { return false }); ok {
		t.Fatal("unowned endpoint reused")
	}
	if got, ok := findCDPPortWithOwner(cfg, func(p int) bool { return p == port }); !ok || got != port {
		t.Fatal("owned normal app not reused")
	}
	pageURL.Store("file:///Applications/Antigravity IDE.app/out/workbench.html")
	if _, ok := findCDPPortWithOwner(cfg, func(p int) bool { return p == port }); ok {
		t.Fatal("IDE endpoint accepted for normal app")
	}
}

func TestNormalAppCanReuseOwnedRandomPort(t *testing.T) {
	var s *httptest.Server
	s = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode([]Target{{ID: "a", Type: "page", URL: "http://127.0.0.1/app", WebSocketDebuggerURL: fmt.Sprintf("ws://127.0.0.1:%d/devtools/page/a", serverPort(s))}})
	}))
	defer s.Close()
	port := serverPort(s)
	if got, ok := findCDPPortWithOwner(app.DefaultNormal(), func(p int) bool { return p == port }, port); !ok || got != port {
		t.Fatal("normal app native random port not reused")
	}
}

func TestBrowserWSURLRejectsOffHostAddress(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]string{"webSocketDebuggerUrl": "ws://example.invalid/devtools/browser/foreign"})
	}))
	defer s.Close()
	if _, err := getBrowserWSURL(serverPort(s)); err == nil {
		t.Fatal("foreign browser address accepted")
	}
}

func TestNormalAppReusesOwnedBrowserWithNoOpenWindows(t *testing.T) {
	var s *httptest.Server
	s = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/json/list" {
			_, _ = fmt.Fprint(w, "[]")
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]string{"webSocketDebuggerUrl": fmt.Sprintf("ws://127.0.0.1:%d/devtools/browser/live", serverPort(s))})
	}))
	defer s.Close()
	port := serverPort(s)
	if got, ok := findCDPPortWithOwner(app.DefaultNormal(), func(p int) bool { return p == port }, port); !ok || got != port {
		t.Fatal("background normal app would be unnecessarily restarted")
	}
}

func TestEnsureTargetInjectedProtocolAndVerification(t *testing.T) {
	var installed atomic.Bool
	var registrations atomic.Int32
	var legacy atomic.Bool
	var fingerprint atomic.Value
	fingerprint.Store("")
	upgrader := websocket.Upgrader{}
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		for {
			var cmd struct {
				ID     int64                  `json:"id"`
				Method string                 `json:"method"`
				Params map[string]interface{} `json:"params"`
			}
			if conn.ReadJSON(&cmd) != nil {
				return
			}
			result := map[string]interface{}{}
			switch cmd.Method {
			case "Page.addScriptToEvaluateOnNewDocument":
				registrations.Add(1)
			case "Runtime.evaluate":
				expression, _ := cmd.Params["expression"].(string)
				if cmd.Params["returnByValue"] == true {
					matched := installed.Load()
					if strings.Contains(expression, "Cleanup") {
						matched = matched && legacy.Load()
					} else if strings.Contains(expression, "PatchFingerprint") {
						matched = matched && fingerprint.Load().(string) != "" && strings.Contains(expression, fmt.Sprintf("%q", fingerprint.Load().(string)))
					}
					result["result"] = map[string]interface{}{"value": matched}
				} else {
					installed.Store(true)
					prefix, _, _ := strings.Cut(expression, ";\n")
					_, raw, _ := strings.Cut(prefix, " = ")
					var value string
					_ = json.Unmarshal([]byte(raw), &value)
					fingerprint.Store(value)
				}
			}
			if conn.WriteJSON(map[string]interface{}{"id": cmd.ID, "result": result}) != nil {
				return
			}
		}
	}))
	defer s.Close()
	target := Target{ID: "a", DebugPort: serverPort(s), WebSocketDebuggerURL: fmt.Sprintf("ws://127.0.0.1:%d/devtools/page/a", serverPort(s))}
	if ok, _, err := EnsureTargetInjected(target, string(resources.OverlayJS)); !ok || err != nil {
		t.Fatalf("injection not verified: %v %v", ok, err)
	}
	if ok, _, err := EnsureTargetInjected(target, string(resources.OverlayJS)); !ok || err != nil {
		t.Fatal("installed document not recognized")
	}
	if registrations.Load() != 1 {
		t.Fatalf("duplicate registration: %d", registrations.Load())
	}
	if ok, _, err := EnsureTargetInjected(target, string(resources.OverlayJS)+"\n// dictionary update"); !ok || err != nil {
		t.Fatalf("new dictionary not reinstalled: %v", err)
	}
	if registrations.Load() != 2 {
		t.Fatal("new fingerprint did not replace the old dictionary")
	}
	legacy.Store(true)
	fingerprint.Store("")
	if ok, permanent, err := EnsureTargetInjected(target, string(resources.OverlayJS)); ok || !permanent || err == nil || !strings.Contains(err.Error(), "重新加载") {
		t.Fatalf("legacy observer must require reload: %v %v %v", ok, permanent, err)
	}
}

func TestSwarmBoardTargetRequiresExpectedPluginFrame(t *testing.T) {
	tests := []struct {
		name, kind, address string
		want                bool
	}{
		{"built-in frame", "iframe", "plugin://swarm--swarm_board-ab12c/?opaque=example", true},
		{"built-in frame 4-digit port", "iframe", "plugin://swarm--swarm_board-7192/?token=opaque", true},
		{"top-level page", "page", "plugin://swarm--swarm_board-ab12c/", false},
		{"other scheme", "iframe", "https://swarm--swarm_board-ab12c/", false},
		{"other plugin", "iframe", "plugin://other--swarm_board-ab12c/", false},
		{"spoofed suffix", "iframe", "plugin://swarm--swarm_board-ab12c.example/", false},
		{"empty id", "iframe", "plugin://swarm--swarm_board-/", false},
		{"malformed id", "iframe", "plugin://swarm--swarm_board-ab_12/", false},
		{"credentials", "iframe", "plugin://user@swarm--swarm_board-ab12c/", false},
		{"explicit port", "iframe", "plugin://swarm--swarm_board-ab12c:1234/", false},
		{"other path", "iframe", "plugin://swarm--swarm_board-ab12c/preview", false},
		{"encoded path", "iframe", "plugin://swarm--swarm_board-ab12c/%2f", false},
		{"fragment", "iframe", "plugin://swarm--swarm_board-ab12c/#other", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			target := Target{Type: tt.kind, URL: tt.address}
			if got := isSwarmBoardTarget(target); got != tt.want {
				t.Fatalf("isSwarmBoardTarget = %v, want %v", got, tt.want)
			}
			if tt.want {
				for _, cfg := range []app.Config{app.DefaultNormal(), app.DefaultIDE()} {
					if ok, kind := candidateTarget(target, cfg); !ok || kind != swarmFrame {
						t.Fatalf("%s did not recognize its Swarm frame: %v %d", cfg.Name, ok, kind)
					}
				}
			}
		})
	}
}

func TestSwarmRendererGuardRejectsDifferentDocuments(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("Node.js is needed to exercise the renderer guard")
	}
	const harness = `
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = process.argv[1];
const valid = { protocol: 'plugin:', hostname: 'swarm--swarm_board-ab12c', pathname: '/' };
for (const [location, markers, expected] of [
  [valid, true, true],
  [{...valid, protocol: 'https:'}, true, false],
  [{...valid, hostname: 'swarm--swarm_board-zz999'}, true, false],
  [{...valid, pathname: '/preview'}, true, false],
  [valid, false, false],
]) {
  const context = {location, document: {querySelector: () => markers ? {} : null}};
  vm.runInNewContext(source, context);
  assert.equal(context.patched === true, expected);
}`
	cmd := exec.Command(node, "-e", harness, swarmBoardInjectionSource("globalThis.patched = true;", "swarm--swarm_board-ab12c"))
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("Swarm renderer guard failed: %v\n%s", err, output)
	}
}

func TestSwarmInjectionIsGuardedAndDoesNotPersistOrIncludeCustomData(t *testing.T) {
	var installed atomic.Bool
	var executions, registrations atomic.Int32
	var captured atomic.Value
	upgrader := websocket.Upgrader{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		for {
			var cmd struct {
				ID     int64                  `json:"id"`
				Method string                 `json:"method"`
				Params map[string]interface{} `json:"params"`
			}
			if conn.ReadJSON(&cmd) != nil {
				return
			}
			result := map[string]interface{}{}
			switch cmd.Method {
			case "Page.addScriptToEvaluateOnNewDocument":
				registrations.Add(1)
			case "Runtime.evaluate":
				expr, _ := cmd.Params["expression"].(string)
				if cmd.Params["returnByValue"] == true {
					value := installed.Load()
					if strings.Contains(expr, "Cleanup") {
						value = false
					}
					result["result"] = map[string]interface{}{"value": value}
				} else {
					captured.Store(expr)
					executions.Add(1)
					installed.Store(true)
				}
			}
			if conn.WriteJSON(map[string]interface{}{"id": cmd.ID, "result": result}) != nil {
				return
			}
		}
	}))
	defer server.Close()
	port := serverPort(server)
	target := Target{ID: "swarm", Type: "iframe", URL: "plugin://swarm--swarm_board-ab12c/?opaque=private-query-sentinel",
		DebugPort: port, WebSocketDebuggerURL: fmt.Sprintf("ws://127.0.0.1:%d/devtools/page/swarm", port)}
	for i := 0; i < 2; i++ {
		if ok, _, err := ensureTargetInjected(target, "CUSTOM_TRANSLATION_SENTINEL", swarmFrame); !ok || err != nil {
			t.Fatalf("Swarm injection failed: %v %v", ok, err)
		}
		installed.Store(false)
	}
	if executions.Load() != 2 || registrations.Load() != 0 {
		t.Fatalf("got %d executions and %d persistent registrations", executions.Load(), registrations.Load())
	}
	expr := captured.Load().(string)
	for _, want := range []string{"location.protocol !== 'plugin:'", `location.hostname !== "swarm--swarm_board-ab12c"`,
		"swarm-tabs", "swarm-empty-state", "No swarm in this conversation"} {
		if !strings.Contains(expr, want) {
			t.Errorf("missing renderer guard or script content %q", want)
		}
	}
	for _, forbidden := range []string{"private-query-sentinel", "CUSTOM_TRANSLATION_SENTINEL"} {
		if strings.Contains(expr, forbidden) {
			t.Fatalf("injected an unrelated value: %s", forbidden)
		}
	}
	target.URL = "plugin://swarm--swarm_board-ab12c/preview"
	if ok, _, err := ensureTargetInjected(target, "", swarmFrame); ok || err == nil {
		t.Fatal("untrusted navigation was accepted")
	}
}

func TestIDEAgentFrameCandidates(t *testing.T) {
	tests := []struct {
		name, typ, url string
		want           bool
	}{
		{"local agent iframe", "iframe", "http://127.0.0.1:63517/?session=opaque", true},
		{"standalone settings iframe", "iframe", "http://127.0.0.1:63517/settings-standalone?session=opaque", true},
		{"conversation route iframe", "iframe", "http://127.0.0.1:63517/c/00000000-0000-4000-8000-000000000001?extensionView=true", true},
		{"customizations browse iframe", "iframe", "http://127.0.0.1:63517/customizations/browse?extensionView=true", true},
		{"history route iframe", "iframe", "http://127.0.0.1:63517/history", true},
		{"conversation traversal rejected", "iframe", "http://127.0.0.1:63517/c/a/b", false},
		{"sidecar dotdot rejected", "iframe", "http://127.0.0.1:63517/sidecars/..", false},
		{"top-level preview", "page", "http://127.0.0.1:63517/", false},
		{"remote host", "iframe", "http://example.test:63517/", false},
		{"spoofed host", "iframe", "http://127.0.0.1.example.test:63517/", false},
		{"username", "iframe", "http://user@127.0.0.1:63517/", false},
		{"other loopback", "iframe", "http://127.0.0.2:63517/", false},
		{"no explicit port", "iframe", "http://127.0.0.1/", false},
		{"invalid port", "iframe", "http://127.0.0.1:65536/", false},
		{"https", "iframe", "https://127.0.0.1:63517/", false},
		{"different route", "iframe", "http://127.0.0.1:63517/preview", false},
		{"settings route prefix", "iframe", "http://127.0.0.1:63517/settings-standalone/preview", false},
		{"encoded route", "iframe", "http://127.0.0.1:63517/%2f", false},
		{"fragment", "iframe", "http://127.0.0.1:63517/#route", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			target := Target{Type: tt.typ, URL: tt.url}
			port, ok := ideAgentFramePort(target)
			if ok != tt.want || (ok && port != 63517) {
				t.Fatalf("got port=%d, accepted=%v", port, ok)
			}
			candidate, _ := candidateTarget(target, app.DefaultIDE())
			if candidate != tt.want {
				t.Fatalf("IDE target candidate = %v", candidate)
			}
		})
	}
}

func TestIDEAgentListenerRequiresExpectedProcessAncestry(t *testing.T) {
	root := t.TempDir()
	cfg := app.DefaultIDE()
	ideExe := filepath.Join(root, "Antigravity IDE.app", "Contents", "MacOS", cfg.Exe)
	agyName := "agy"
	if app.IsWindows {
		agyName += ".exe"
	}
	agentExe := filepath.Join(root, ".gemini", "bin", agyName)
	for _, p := range []string{ideExe, agentExe} {
		if err := os.MkdirAll(filepath.Dir(p), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte("test executable"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	const debugPort, agentPort = 58322, 63517
	baseConnections := []procnet.ConnectionStat{
		{Status: "LISTEN", Laddr: procnet.Addr{IP: "127.0.0.1", Port: debugPort}, Pid: 100},
		{Status: "LISTEN", Laddr: procnet.Addr{IP: "127.0.0.1", Port: agentPort}, Pid: 300},
	}
	baseProcesses := map[int32]ideAgentProcess{
		100: {name: cfg.Exe, exe: ideExe},
		200: {parent: 100, name: cfg.Exe, exe: ideExe},
		300: {parent: 200, name: agyName, exe: agentExe},
	}
	tests := []struct {
		name   string
		change func([]procnet.ConnectionStat, map[int32]ideAgentProcess)
		want   bool
	}{
		{"IDE child agent", nil, true},
		{"different executable", func(_ []procnet.ConnectionStat, ps map[int32]ideAgentProcess) {
			p := ps[300]
			p.exe = ideExe
			ps[300] = p
		}, false},
		{"different IDE instance", func(_ []procnet.ConnectionStat, ps map[int32]ideAgentProcess) {
			p := ps[200]
			p.parent = 999
			ps[200] = p
		}, false},
		{"missing parent", func(_ []procnet.ConnectionStat, ps map[int32]ideAgentProcess) { delete(ps, 200) }, false},
		{"cyclic ancestry", func(_ []procnet.ConnectionStat, ps map[int32]ideAgentProcess) {
			p := ps[200]
			p.parent = 300
			ps[200] = p
		}, false},
		{"other debug owner", func(_ []procnet.ConnectionStat, ps map[int32]ideAgentProcess) {
			p := ps[100]
			p.exe = agentExe
			ps[100] = p
		}, false},
		{"nonloopback agent listener", func(cs []procnet.ConnectionStat, _ map[int32]ideAgentProcess) { cs[1].Laddr.IP = "0.0.0.0" }, false},
		{"other loopback listener", func(cs []procnet.ConnectionStat, _ map[int32]ideAgentProcess) { cs[1].Laddr.IP = "127.0.0.2" }, false},
		{"not listening", func(cs []procnet.ConnectionStat, _ map[int32]ideAgentProcess) { cs[1].Status = "ESTABLISHED" }, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			connections := append([]procnet.ConnectionStat(nil), baseConnections...)
			processes := make(map[int32]ideAgentProcess)
			for pid, p := range baseProcesses {
				processes[pid] = p
			}
			if tt.change != nil {
				tt.change(connections, processes)
			}
			lookup := func(pid int32) (ideAgentProcess, bool) { p, ok := processes[pid]; return p, ok }
			if got := trustedIDEAgentOwner(connections, agentPort, debugPort, agentExe, cfg, lookup); got != tt.want {
				t.Fatalf("trustedIDEAgentOwner = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestIDEAgentInjectionDoesNotPersistAcrossNavigation(t *testing.T) {
	var installed atomic.Bool
	var executions, registrations atomic.Int32
	var captured atomic.Value
	upgrader := websocket.Upgrader{}
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		for {
			var cmd struct {
				ID     int64                  `json:"id"`
				Method string                 `json:"method"`
				Params map[string]interface{} `json:"params"`
			}
			if conn.ReadJSON(&cmd) != nil {
				return
			}
			result := map[string]interface{}{}
			switch cmd.Method {
			case "Page.addScriptToEvaluateOnNewDocument":
				registrations.Add(1)
			case "Runtime.evaluate":
				expr, _ := cmd.Params["expression"].(string)
				if cmd.Params["returnByValue"] == true {
					value := installed.Load()
					if strings.Contains(expr, "Cleanup") {
						value = false
					}
					result["result"] = map[string]interface{}{"value": value}
				} else {
					captured.Store(expr)
					executions.Add(1)
					installed.Store(true)
				}
			}
			if conn.WriteJSON(map[string]interface{}{"id": cmd.ID, "result": result}) != nil {
				return
			}
		}
	}))
	defer s.Close()
	debugPort := serverPort(s)
	target := Target{ID: "agent", Type: "iframe", URL: "http://127.0.0.1:63517/?opaque=test-sentinel", DebugPort: debugPort, WebSocketDebuggerURL: fmt.Sprintf("ws://127.0.0.1:%d/devtools/page/agent", debugPort)}
	for _, route := range []string{"/", "/settings-standalone", "/settings-standalone"} {
		target.URL = "http://127.0.0.1:63517" + route + "?opaque=test-sentinel"
		if ok, _, err := ensureTargetInjected(target, string(resources.OverlayJS), 63517); !ok || err != nil {
			t.Fatalf("frame injection failed: %v %v", ok, err)
		}
		expr := captured.Load().(string)
		if !strings.Contains(expr, "location.pathname !== "+strconv.Quote(route)) {
			t.Fatalf("guard does not match route %q", route)
		}
		installed.Store(false)
	}
	if executions.Load() != 3 || registrations.Load() != 0 {
		t.Fatalf("got %d executions and %d persistent registrations", executions.Load(), registrations.Load())
	}
	expr := captured.Load().(string)
	for _, want := range []string{"location.hostname !== '127.0.0.1'", `location.port !== "63517"`, `location.pathname !== "/settings-standalone"`, "document.getElementById('root')"} {
		if !strings.Contains(expr, want) {
			t.Errorf("missing renderer guard %q", want)
		}
	}
	if strings.Contains(expr, "test-sentinel") {
		t.Fatal("the target query leaked into the injected script")
	}
	target.URL = "http://127.0.0.1:63517/preview"
	if ok, _, err := ensureTargetInjected(target, string(resources.OverlayJS), 63517); ok || err == nil {
		t.Fatal("untrusted frame route was accepted")
	}
}

func TestIDEAgentRendererGuardRejectsOtherDocuments(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("Node.js is needed to exercise the JavaScript guard")
	}
	const harness = `
const vm = require('node:vm');
const assert = require('node:assert/strict');
const sources = JSON.parse(require('node:fs').readFileSync(0, 'utf8'));
const good = { protocol: 'http:', hostname: '127.0.0.1', port: '63517', pathname: '/' };
for (const [source, location, root, expected] of [
  [sources.root, good, true, true],
  [sources.root, {...good, hostname: 'example.test'}, true, false],
  [sources.root, {...good, protocol: 'https:'}, true, false],
  [sources.root, {...good, port: '63518'}, true, false],
  [sources.root, {...good, pathname: '/preview'}, true, false],
  [sources.root, {...good, pathname: '/settings-standalone'}, true, false],
  [sources.root, good, false, false],
  [sources.settings, {...good, pathname: '/settings-standalone'}, true, true],
  [sources.settings, good, true, false],
  [sources.settings, {...good, pathname: '/settings-standalone/preview'}, true, false],
]) {
  const context = { location, document: { getElementById: () => root ? {} : null } };
  vm.runInNewContext(source, context);
  assert.equal(context.patched === true, expected);
}`
	cmd := exec.Command(node, "-e", harness)
	sources, err := json.Marshal(map[string]string{
		"root":     ideAgentInjectionSource("globalThis.patched = true;", 63517, "/"),
		"settings": ideAgentInjectionSource("globalThis.patched = true;", 63517, "/settings-standalone"),
	})
	if err != nil {
		t.Fatal(err)
	}
	cmd.Stdin = strings.NewReader(string(sources))
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("renderer guard failed: %v\n%s", err, output)
	}
}
