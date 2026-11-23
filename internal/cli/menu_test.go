package cli

import "testing"

func TestShortcutTypeLabelForOS(t *testing.T) {
	if got := shortcutTypeLabelForOS("linux"); got != "桌面/应用菜单" {
		t.Fatalf("shortcutTypeLabelForOS(linux) = %q, want 桌面/应用菜单", got)
	}
	if got := shortcutTypeLabelForOS("darwin"); got != "应用程序" {
		t.Fatalf("shortcutTypeLabelForOS(darwin) = %q, want 应用程序", got)
	}
	if got := shortcutTypeLabelForOS("windows"); got != "桌面" {
		t.Fatalf("shortcutTypeLabelForOS(windows) = %q, want 桌面", got)
	}
}
