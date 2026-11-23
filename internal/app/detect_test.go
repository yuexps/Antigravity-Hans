package app

import (
	"os"
	"path/filepath"
	"testing"
)

func TestIsExpectedExecutable(t *testing.T) {
	dir := t.TempDir()
	cfg := Config{Kind: KindNormal, Name: "Antigravity", Exe: "Antigravity"}

	good := filepath.Join(dir, "Antigravity")
	if err := os.WriteFile(good, []byte("bin"), 0o755); err != nil {
		t.Fatal(err)
	}
	other := filepath.Join(dir, "evil")
	if err := os.WriteFile(other, []byte("bin"), 0o755); err != nil {
		t.Fatal(err)
	}

	if !IsExpectedExecutable(good, cfg) {
		t.Fatal("同名普通文件应通过校验")
	}
	if IsExpectedExecutable(other, cfg) {
		t.Fatal("文件名与目标不一致的路径应被拒绝")
	}
	if IsExpectedExecutable(dir, cfg) {
		t.Fatal("目录应被拒绝")
	}
	if IsExpectedExecutable("", cfg) {
		t.Fatal("空路径应被拒绝")
	}
	if IsExpectedExecutable(filepath.Join(dir, "missing"), cfg) {
		t.Fatal("不存在的路径应被拒绝")
	}

	sub := filepath.Join(dir, "sub")
	if err := os.MkdirAll(sub, 0o755); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(sub, "Antigravity")
	if err := os.Symlink(good, link); err != nil {
		t.Skipf("当前环境不支持符号链接: %v", err)
	}
	if IsExpectedExecutable(link, cfg) {
		t.Fatal("符号链接应被拒绝")
	}

	winCfg := Config{Kind: KindIDE, Name: "Antigravity IDE", Exe: "Antigravity IDE.exe"}
	winExe := filepath.Join(dir, "Antigravity IDE.exe")
	if err := os.WriteFile(winExe, []byte("bin"), 0o755); err != nil {
		t.Fatal(err)
	}
	if !IsExpectedExecutable(winExe, winCfg) {
		t.Fatal("Windows 可执行文件名应通过校验")
	}
}
