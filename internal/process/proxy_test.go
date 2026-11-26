package process

import (
	"net"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

func TestSelectLaunchProxy(t *testing.T) {
	for _, tc := range []struct {
		name, manual, pac string
		env               map[string]string
		want              LaunchProxy
		wantError         string
	}{
		{
			name:   "manual before env",
			manual: " 127.0.0.1:8080 ",
			env:    map[string]string{"HTTPS_PROXY": "127.0.0.1:9999"},
			want:   LaunchProxy{source: "Windows 系统手动代理", all: "http://127.0.0.1:8080"},
		},
		{
			name:   "manual protocol mappings",
			manual: "HTTP=proxy.local:80;https=secure.local:8080;socks=socks5h://[::1]:1080;ftp=legacy.local:80",
			want:   LaunchProxy{source: "Windows 系统手动代理", http: "http://proxy.local:80", https: "http://secure.local:8080", all: "socks5://[::1]:1080"},
		},
		{
			name: "env fallback even with pac",
			pac:  "https://proxy.local/config.pac",
			env:  map[string]string{"HTTPS_PROXY": "https://secure.local:8443", "ALL_PROXY": "socks5://local-proxy:1080"},
			want: LaunchProxy{source: "代理环境变量", https: "https://secure.local:8443", all: "socks5://local-proxy:1080"},
		},
		{
			name:      "invalid manual wins over env",
			manual:    "proxy.local",
			env:       map[string]string{"ALL_PROXY": "127.0.0.1:8080"},
			wantError: "Windows 系统手动代理",
		},
		{
			name:      "pac only",
			pac:       "https://proxy.local/config.pac",
			wantError: "PAC",
		},
		{
			name:      "no proxy",
			wantError: "未找到固定代理地址",
		},
		{
			name:      "auth suppressed in errors",
			env:       map[string]string{"HTTPS_PROXY": "http://user:test-secret@localhost:8080"},
			wantError: "HTTPS_PROXY",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := selectLaunchProxy(tc.manual, tc.pac, func(key string) string { return tc.env[key] })
			if tc.wantError != "" {
				if err == nil || !strings.Contains(err.Error(), tc.wantError) || strings.Contains(err.Error(), "test-secret") {
					t.Fatalf("selectLaunchProxy error = %v, want %q with no credentials", err, tc.wantError)
				}
				return
			}
			if err != nil || got != tc.want {
				t.Fatalf("selectLaunchProxy = %#v, %v; want %#v", got, err, tc.want)
			}
		})
	}
}

func TestParseProxyEndpointRejectsInvalidRules(t *testing.T) {
	for _, raw := range []string{
		"", "missing-port", "localhost:0", "localhost:65536", "localhost:not-a-port",
		"localhost:8080,direct://", "host;other:8080", "https://localhost:8080/path",
		"https://localhost:8080?query", "file://localhost:8080", "http://[fe80::1%25eth0]:8080",
	} {
		if got, err := parseProxyEndpoint(raw, "http"); err == nil {
			t.Errorf("parseProxyEndpoint(%q) = %q, want error", raw, got)
		}
	}
}

func TestLaunchProxyPreflight(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = listener.Close() })
	endpoint := "http://" + listener.Addr().String()
	proxy := LaunchProxy{source: "测试代理", http: endpoint, https: endpoint}
	if err := proxy.checkReachable(); err != nil {
		t.Fatalf("listening endpoint: %v", err)
	}
	if err := listener.Close(); err != nil {
		t.Fatal(err)
	}
	if err := proxy.checkReachable(); err == nil || !strings.Contains(err.Error(), endpoint) {
		t.Fatalf("closed endpoint = %v, want an error identifying %s", err, endpoint)
	}
}

func TestDebugCommandProxyScope(t *testing.T) {
	t.Setenv("AGY_HANS_ALLOW_ANY_ORIGIN", "0")
	appPath := filepath.Join(t.TempDir(), "Antigravity.exe")
	environ := []string{"KEEP=1", "http_proxy=old", "HTTPS_PROXY=old", "all_proxy=old", "no_proxy=internal.local", "ELECTRON_RUN_AS_NODE=1"}
	opts := LaunchProxy{source: "测试代理", https: "http://secure.local:8080", all: "http://127.0.0.1:7890"}
	cmd := debugCommand(appPath, 58321, opts, environ)
	wantArgs := []string{appPath, "--remote-debugging-port=58321", "--remote-debugging-address=127.0.0.1", "--proxy-server=https=http://secure.local:8080;socks=http://127.0.0.1:7890"}
	if !slices.Equal(cmd.Args, wantArgs) {
		t.Fatalf("args = %q, want %q", cmd.Args, wantArgs)
	}
	wantEnv := []string{"KEEP=1", "HTTP_PROXY=http://127.0.0.1:7890", "HTTPS_PROXY=http://secure.local:8080", "ALL_PROXY=http://127.0.0.1:7890", "NO_PROXY=internal.local,localhost,127.0.0.1,::1"}
	if !slices.Equal(cmd.Env, wantEnv) {
		t.Fatalf("env = %q, want %q", cmd.Env, wantEnv)
	}
	cmd = debugCommand(appPath, 58321, LaunchProxy{}, environ)
	if !slices.Equal(cmd.Args, wantArgs[:3]) || !slices.Equal(cmd.Env, environ[:5]) {
		t.Fatalf("default launch changed: args = %q, env = %q", cmd.Args, cmd.Env)
	}
}
