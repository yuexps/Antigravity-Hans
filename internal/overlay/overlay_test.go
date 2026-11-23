package overlay

import (
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"

	"antigravity-hans/resources"
)

func TestVerifyExternalOverlay(t *testing.T) {
	isWindows := runtime.GOOS == "windows"
	dir := t.TempDir()
	content := []byte("window." + overlaySentinel + " = true;\n")

	write := func(name string, data []byte, perm os.FileMode) string {
		t.Helper()
		p := filepath.Join(dir, name)
		if err := os.WriteFile(p, data, perm); err != nil {
			t.Fatalf("写入测试文件失败: %v", err)
		}
		if err := os.Chmod(p, perm); err != nil {
			t.Fatalf("设置测试文件权限失败: %v", err)
		}
		return p
	}

	good := write("good.js", content, 0o600)
	if err := verifyExternalOverlay(good, content); !isWindows && err != nil {
		t.Fatalf("合规脚本不应被拒绝: %v", err)
	} else if isWindows && err == nil {
		t.Fatal("Windows 必须显式信任外部脚本，不能依赖 Unix 权限位")
	}

	worldWritable := write("world.js", content, 0o666)
	if err := verifyExternalOverlay(worldWritable, content); err == nil {
		t.Fatal("同组/其他用户可写的脚本应被拒绝")
	}

	noSentinel := write("other.js", []byte("console.log(1);"), 0o600)
	if err := verifyExternalOverlay(noSentinel, []byte("console.log(1);")); err == nil {
		t.Fatal("缺少汉化标记的文件应被拒绝")
	}

	linkTarget := write("target.js", content, 0o600)
	link := filepath.Join(dir, "link.js")
	if err := os.Symlink(linkTarget, link); err != nil {
		t.Skipf("当前环境不支持符号链接: %v", err)
	}
	if err := verifyExternalOverlay(link, content); err == nil {
		t.Fatal("符号链接应被拒绝")
	}

	big := filepath.Join(dir, "big.js")
	if err := os.WriteFile(big, append(content, make([]byte, maxExternalOverlaySize)...), 0o600); err != nil {
		t.Fatalf("写入大文件失败: %v", err)
	}
	if err := verifyExternalOverlay(big, content); err == nil {
		t.Fatal("超出体积上限的文件应被拒绝")
	}
}

func TestOverlayFingerprint(t *testing.T) {
	got := Fingerprint("hello")
	if len(got) != 16 {
		t.Fatalf("指纹长度应为 16，实际 %d", len(got))
	}
	if got != Fingerprint("hello") {
		t.Fatal("相同内容应得到相同指纹")
	}
	if got == Fingerprint("hello!") {
		t.Fatal("不同内容不应得到相同指纹")
	}
	if !strings.Contains(string(resources.OverlayJS), overlaySentinel) {
		t.Fatal("内嵌脚本应当包含汉化标记")
	}
}

func TestExternalOverlayReadSafety(t *testing.T) {
	isWindows := runtime.GOOS == "windows"
	dir := t.TempDir()
	good := filepath.Join(dir, "good.js")
	data := []byte("window." + overlaySentinel + " = true;")
	if err := os.WriteFile(good, data, 0600); err != nil {
		t.Fatal(err)
	}
	if got, err := readExternalOverlay(good, true); err != nil || got != string(data) {
		t.Fatalf("trusted regular script: %q %v", got, err)
	}
	if _, err := readExternalOverlay(good, false); (err != nil) != isWindows {
		t.Fatalf("automatic trust differs from platform policy: %v", err)
	}
	large := filepath.Join(dir, "large.js")
	if err := os.WriteFile(large, make([]byte, maxExternalOverlaySize+1), 0600); err != nil {
		t.Fatal(err)
	}
	for _, trust := range []bool{false, true} {
		if _, err := readExternalOverlay(large, trust); err == nil {
			t.Fatal("size limit must apply even when explicitly trusted")
		}
		if _, err := readExternalOverlay(dir, trust); err == nil {
			t.Fatal("directory accepted as executable JS")
		}
	}
	link := filepath.Join(dir, "link.js")
	if err := os.Symlink(good, link); err == nil {
		for _, trust := range []bool{false, true} {
			if _, err := readExternalOverlay(link, trust); err == nil {
				t.Fatal("symlink accepted")
			}
		}
	}
}

func TestCustomTranslationFileRequiresTrustedOrigin(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, CustomTranslationsFileName)
	if err := os.WriteFile(path, []byte("Allow = 自定义\n"), 0600); err != nil {
		t.Fatal(err)
	}
	entries, err := readCustomTranslationsFile(path, true)
	if err != nil || len(entries) != 1 || entries[0].Target != "自定义" {
		t.Fatalf("explicit trust failed: %v %v", entries, err)
	}
	_, err = readCustomTranslationsFile(path, false)
	if runtime.GOOS == "windows" {
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
	path := filepath.Join(dir, CustomTranslationsFileName)
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
	got := ParseCustomTranslations([]byte(input))
	want := []CustomTranslation{
		{"This Conversation", ""},
		{"Turbo", "快速模式"},
		{"Request Review", "逐条审核"},
		{"default", "默认值"},
		{"Auto", ""},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestCustomTranslationsPreludeCannotBreakOut(t *testing.T) {
	if got := CustomTranslationsPrelude(nil); !strings.Contains(got, "= [];") {
		t.Fatalf("empty list must still reset the page list: %s", got)
	}
	hostile := []CustomTranslation{
		{`"]]; alert(1); //`, "</script><script>alert(1)</script>"},
		{"line\u2028break", ""},
	}
	prelude := CustomTranslationsPrelude(hostile)
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
