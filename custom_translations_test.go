package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestCustomTranslationFileRequiresTrustedOrigin(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, customTranslationsFileName)
	if err := os.WriteFile(path, []byte("Allow = 自定义\n"), 0600); err != nil {
		t.Fatal(err)
	}
	entries, err := readCustomTranslationsFile(path, true)
	if err != nil || len(entries) != 1 || entries[0].Target != "自定义" {
		t.Fatalf("explicit trust failed: %v %v", entries, err)
	}
	_, err = readCustomTranslationsFile(path, false)
	if IsWindows {
		if err == nil {
			t.Fatal("Windows must require explicit trust when ACLs are not verified")
		}
		return
	}
	if err != nil {
		t.Fatalf("private user-owned file rejected: %v", err)
	}
	if err := os.Chmod(path, 0666); err != nil {
		t.Fatal(err)
	}
	if _, err := readCustomTranslationsFile(path, false); err == nil {
		t.Fatal("accepted a group/other writable file")
	}
	if err := os.Chmod(path, 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(dir, 0777); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(dir, 0700) })
	if _, err := readCustomTranslationsFile(path, false); err == nil {
		t.Fatal("accepted a group/other writable directory")
	}
}

func TestExplicitCustomTrustDoesNotBypassFileSafety(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, customTranslationsFileName)
	if err := os.WriteFile(path, make([]byte, maxCustomTranslationsSize+1), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := readCustomTranslationsFile(path, true); err == nil {
		t.Fatal("explicit trust bypassed the file size limit")
	}
	if _, err := readCustomTranslationsFile(dir, true); err == nil {
		t.Fatal("explicit trust accepted a directory")
	}
}

func TestParseCustomTranslations(t *testing.T) {
	input := "\uFEFF# 注释\n\n  This Conversation  \r\nTurbo = 快速模式\nRequest Review＝逐条审核\n default \nDefault = 默认值\nAuto =\n= 无原文\n" + strings.Repeat("x", maxCustomTranslationRunes+1) + "\n"
	got := parseCustomTranslations([]byte(input))
	want := []customTranslation{
		{"This Conversation", ""},
		{"Turbo", "快速模式"},
		{"Request Review", "逐条审核"},
		{"default", "默认值"}, // 后出现的规则覆盖先出现的
		{"Auto", ""},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestCustomTranslationsPreludeCannotBreakOut(t *testing.T) {
	if got := customTranslationsPrelude(nil); !strings.Contains(got, "= [];") {
		t.Fatalf("empty list must still reset the page list: %s", got)
	}
	hostile := []customTranslation{
		{`"]]; alert(1); //`, "</script><script>alert(1)</script>"},
		{"line\u2028break", ""},
	}
	prelude := customTranslationsPrelude(hostile)
	if strings.Contains(prelude, "</script>") || strings.Contains(prelude, "\u2028") {
		t.Fatalf("unsafe characters not escaped: %s", prelude)
	}
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node not available")
	}
	script := "globalThis.window = {}; " + prelude + "const v = window.__antigravityZhCustom; process.stdout.write(String(v.length) + '|' + v[0][0] + '|' + v[0][1]);"
	out, err := exec.Command(node, "-e", script).Output()
	if err != nil {
		t.Fatalf("prelude is not valid JavaScript: %v", err)
	}
	if string(out) != `2|"]]; alert(1); //|</script><script>alert(1)</script>` {
		t.Fatalf("entries did not round-trip as plain strings: %s", out)
	}
}
