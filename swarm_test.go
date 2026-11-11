package main

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os/exec"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/gorilla/websocket"
)

func TestSwarmBoardTargetRequiresExpectedPluginFrame(t *testing.T) {
	tests := []struct {
		name, kind, address string
		want                bool
	}{
		{"built-in frame", "iframe", "plugin://swarm--swarm_board-ab12c/?opaque=example", true},
		{"top-level page", "page", "plugin://swarm--swarm_board-ab12c/", false},
		{"other scheme", "iframe", "https://swarm--swarm_board-ab12c/", false},
		{"other plugin", "iframe", "plugin://other--swarm_board-ab12c/", false},
		{"spoofed suffix", "iframe", "plugin://swarm--swarm_board-ab12c.example/", false},
		{"malformed id", "iframe", "plugin://swarm--swarm_board-ab12/", false},
		{"credentials", "iframe", "plugin://user@swarm--swarm_board-ab12c/", false},
		{"explicit port", "iframe", "plugin://swarm--swarm_board-ab12c:1234/", false},
		{"other path", "iframe", "plugin://swarm--swarm_board-ab12c/preview", false},
		{"encoded path", "iframe", "plugin://swarm--swarm_board-ab12c/%2f", false},
		{"fragment", "iframe", "plugin://swarm--swarm_board-ab12c/#other", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			target := CDPTarget{Type: tt.kind, URL: tt.address}
			if got := isSwarmBoardTarget(target); got != tt.want {
				t.Fatalf("isSwarmBoardTarget = %v, want %v", got, tt.want)
			}
			if tt.want {
				for _, cfg := range []AppConfig{AppNormal, AppIDE} {
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
	target := CDPTarget{ID: "swarm", Type: "iframe", URL: "plugin://swarm--swarm_board-ab12c/?opaque=private-query-sentinel",
		DebugPort: port, WebSocketDebuggerURL: fmt.Sprintf("ws://127.0.0.1:%d/devtools/page/swarm", port)}
	for i := 0; i < 2; i++ {
		if ok, _, err := ensureTargetInjected(target, "CUSTOM_TRANSLATION_SENTINEL", swarmFrame); !ok || err != nil {
			t.Fatalf("Swarm injection failed: %v %v", ok, err)
		}
		installed.Store(false) // Simulate navigation to a fresh document.
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
