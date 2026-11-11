package main

import (
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAttachOnlyDoesNotLaunchWithoutDebugPort(t *testing.T) {
	previousDir := monitorStateDirOverride
	monitorStateDirOverride = t.TempDir()
	t.Cleanup(func() { monitorStateDirOverride = previousDir })

	// A fake installed executable makes an accidental launch observable without
	// starting a real application or touching its processes.
	name := "antigravity-hans-never-launch-test"
	if IsWindows {
		name += ".exe"
	}
	fake := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(fake, []byte("not an executable"), 0o700); err != nil {
		t.Fatal(err)
	}
	cfg := AppConfig{Name: "attach-only-test", Exe: name, Port: 1, PossiblePaths: []string{fake}}

	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	defer reader.Close()
	previousStdout := os.Stdout
	os.Stdout = writer
	defer func() { os.Stdout = previousStdout }()
	Run(cfg, "", false, true, nil)
	_ = writer.Close()
	os.Stdout = previousStdout
	output, err := io.ReadAll(reader)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(output), "仅连接模式不会启动或重启应用") {
		t.Fatalf("未报告仅连接模式：%s", output)
	}
	if strings.Contains(string(output), "正在以调试模式启动") {
		t.Fatalf("仅连接模式尝试启动应用：%s", output)
	}
}
