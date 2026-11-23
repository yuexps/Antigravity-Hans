package safeio

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
)

func TestAtomicShortcutFileDoesNotOverwriteLinkedVictim(t *testing.T) {
	dir := t.TempDir()
	root, err := os.OpenRoot(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer root.Close()
	victim := filepath.Join(t.TempDir(), "victim")
	if err := os.WriteFile(victim, []byte("keep"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(victim, filepath.Join(dir, "launcher")); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}
	if err := WriteRootFileAtomic(root, "launcher", []byte("new"), 0755); err == nil {
		t.Fatal("symlink destination accepted")
	}
	got, err := os.ReadFile(victim)
	if err != nil || string(got) != "keep" {
		t.Fatalf("victim altered: %q %v", got, err)
	}
	if err := os.Symlink(filepath.Dir(victim), filepath.Join(dir, "linked-dir")); err != nil {
		t.Fatal(err)
	}
	if err := WriteRootFileAtomic(root, "linked-dir/new-file", []byte("new"), 0600); err == nil {
		t.Fatal("symlink parent accepted")
	}
}

func TestAtomicShortcutFileReplacesRegularFile(t *testing.T) {
	dir := t.TempDir()
	root, err := os.OpenRoot(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer root.Close()
	if err := root.WriteFile("launcher", []byte("old"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := WriteRootFileAtomic(root, "launcher", []byte("new"), 0755); err != nil {
		t.Fatal(err)
	}
	got, err := root.ReadFile("launcher")
	if err != nil || string(got) != "new" {
		t.Fatalf("replacement failed: %q %v", got, err)
	}
	entries, err := os.ReadDir(dir)
	if err != nil || len(entries) != 1 {
		t.Fatalf("temporary files leaked: %v %v", entries, err)
	}
}

func TestShellQuotePreservesLiteralPaths(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX launcher is macOS-specific")
	}
	for _, s := range []string{"simple path", "dollar$HOME", "$(touch DO_NOT_EXECUTE)", "back`tick`", "a'b\"c", "line\nbreak", ""} {
		cmd := exec.Command("/bin/sh", "-c", "printf '%s' "+ShellQuote(s))
		cmd.Dir = t.TempDir()
		out, err := cmd.Output()
		if err != nil || string(out) != s {
			t.Fatalf("quote changed %q into %q: %v", s, out, err)
		}
		entries, _ := os.ReadDir(cmd.Dir)
		if len(entries) != 0 {
			t.Fatal("path executed a command")
		}
	}
}

func TestPowerShellQuote(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"含空格与中文", "C:/Users/Admin/Desktop/Antigravity 中文.lnk", "'C:/Users/Admin/Desktop/Antigravity 中文.lnk'"},
		{"含美元符号（双引号串会被当变量展开）", "C:/Users/a$b/x.lnk", "'C:/Users/a$b/x.lnk'"},
		{"含反引号（双引号串会被当转义符）", "C:/Users/a`b/x.lnk", "'C:/Users/a`b/x.lnk'"},
		{"含单引号（需翻倍）", "C:/it's here/x.lnk", "'C:/it''s here/x.lnk'"},
		{"真实 Windows 路径形状", `C:\Users\Admin\Desktop\Antigravity 中文.lnk`, `'C:\Users\Admin\Desktop\Antigravity 中文.lnk'`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := PowerShellQuote(tc.in); got != tc.want {
				t.Fatalf("PowerShellQuote(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}
