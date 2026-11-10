package main

import (
	"os/exec"
	"reflect"
	"strings"
	"testing"
)

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
