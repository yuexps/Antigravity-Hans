package main

import (
	"encoding/json"
	"fmt"
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
)

func TestIDEAgentFrameCandidates(t *testing.T) {
	tests := []struct {
		name, typ, url string
		want           bool
	}{
		{"local agent iframe", "iframe", "http://127.0.0.1:63517/?session=opaque", true},
		{"standalone settings iframe", "iframe", "http://127.0.0.1:63517/settings-standalone?session=opaque", true},
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
			target := CDPTarget{Type: tt.typ, URL: tt.url}
			port, ok := ideAgentFramePort(target)
			if ok != tt.want || (ok && port != 63517) {
				t.Fatalf("got port=%d, accepted=%v", port, ok)
			}
			candidate, _ := candidateTarget(target, AppIDE)
			if candidate != tt.want {
				t.Fatalf("IDE target candidate = %v", candidate)
			}
		})
	}
}

func TestIDEAgentListenerRequiresExpectedProcessAncestry(t *testing.T) {
	root := t.TempDir()
	cfg := AppIDE
	ideExe := filepath.Join(root, "Antigravity IDE.app", "Contents", "MacOS", cfg.Exe)
	agyName := "agy"
	if IsWindows {
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
	target := CDPTarget{ID: "agent", Type: "iframe", URL: "http://127.0.0.1:63517/?opaque=test-sentinel", DebugPort: debugPort, WebSocketDebuggerURL: fmt.Sprintf("ws://127.0.0.1:%d/devtools/page/agent", debugPort)}
	for _, route := range []string{"/", "/settings-standalone", "/settings-standalone"} {
		target.URL = "http://127.0.0.1:63517" + route + "?opaque=test-sentinel"
		if ok, _, err := ensureTargetInjected(target, string(embeddedOverlayJS), 63517); !ok || err != nil {
			t.Fatalf("frame injection failed: %v %v", ok, err)
		}
		expr := captured.Load().(string)
		if !strings.Contains(expr, "location.pathname !== "+strconv.Quote(route)) {
			t.Fatalf("guard does not match route %q", route)
		}
		installed.Store(false) // Simulate a new document; the watcher must recheck it.
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
	if ok, _, err := ensureTargetInjected(target, string(embeddedOverlayJS), 63517); ok || err == nil {
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
