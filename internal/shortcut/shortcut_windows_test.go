//go:build windows

package shortcut

import (
	"strings"
	"testing"

	"antigravity-hans/internal/app"
	"antigravity-hans/internal/overlay"
)

func TestShortcutArgumentsRequireExplicitCustomTrust(t *testing.T) {
	for _, cfg := range []app.Config{app.DefaultNormal(), app.DefaultIDE()} {
		if strings.Contains(shortcutArguments(cfg, false), overlay.TrustCustomTranslationsArg) {
			t.Fatal("unrequested trust included in shortcut")
		}
		if !strings.Contains(shortcutArguments(cfg, true), overlay.TrustCustomTranslationsArg) {
			t.Fatal("explicit custom trust missing from shortcut")
		}
	}
}

func TestShortcutTargetAndArgs(t *testing.T) {
	conhost := `C:\Windows\System32\conhost.exe`
	exe := `C:\Users\Admin\My Tools\antigravity-hans.exe`
	args := "--app --nogui"

	target, gotArgs := shortcutTargetAndArgs(exe, args, conhost)
	if target != conhost {
		t.Fatalf("target = %q, want %q", target, conhost)
	}
	wantArgs := `--headless "C:\Users\Admin\My Tools\antigravity-hans.exe" --app --nogui`
	if gotArgs != wantArgs {
		t.Fatalf("args = %q, want %q", gotArgs, wantArgs)
	}

	fallbackTarget, fallbackArgs := shortcutTargetAndArgs(exe, args, "")
	if fallbackTarget != exe || fallbackArgs != args {
		t.Fatalf("fallback = (%q, %q), want (%q, %q)", fallbackTarget, fallbackArgs, exe, args)
	}
}

func TestSupportsHeadlessConhost(t *testing.T) {
	cases := []struct {
		major uint32
		build uint32
		want  bool
	}{
		{6, 7601, false},
		{10, 17134, false},
		{10, 17763, true},
		{10, 0xf0000000 | 22631, true},
		{11, 0, true},
	}
	for _, tc := range cases {
		if got := supportsHeadlessConhost(tc.major, tc.build); got != tc.want {
			t.Fatalf("supportsHeadlessConhost(%d, %d) = %v, want %v", tc.major, tc.build, got, tc.want)
		}
	}
}

func TestQuoteWindowsArg(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"", `""`},
		{`C:\Tools\antigravity-hans.exe`, `"C:\Tools\antigravity-hans.exe"`},
		{`C:\Users\Admin\Antigravity 中文\antigravity-hans.exe`, `"C:\Users\Admin\Antigravity 中文\antigravity-hans.exe"`},
		{`C:\Users\a$b\it's here\x.exe`, `"C:\Users\a$b\it's here\x.exe"`},
		{`C:\trailing\`, `"C:\trailing\\"`},
		{`a\"b`, `"a\\\"b"`},
	}
	for _, tc := range cases {
		if got := quoteWindowsArg(tc.in); got != tc.want {
			t.Fatalf("quoteWindowsArg(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}
