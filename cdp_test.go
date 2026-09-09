package main

import "testing"

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
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isTargetPage(tt.url, AppIDE.Name); got != tt.want {
				t.Fatalf("isTargetPage(%q, %q) = %v, want %v", tt.url, AppIDE.Name, got, tt.want)
			}
		})
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
