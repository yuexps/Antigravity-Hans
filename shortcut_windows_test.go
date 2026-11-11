//go:build windows

package main

import (
	"strings"
	"testing"
)

func TestShortcutArgumentsRequireExplicitCustomTrust(t *testing.T) {
	for _, cfg := range []AppConfig{AppNormal, AppIDE} {
		if strings.Contains(shortcutArguments(cfg, false), trustCustomTranslationsArg) {
			t.Fatal("unrequested trust included in shortcut")
		}
		if !strings.Contains(shortcutArguments(cfg, true), trustCustomTranslationsArg) {
			t.Fatal("explicit custom trust missing from shortcut")
		}
	}
}
