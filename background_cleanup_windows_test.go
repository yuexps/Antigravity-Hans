//go:build windows

package main

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"testing"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

func TestConfirmBackgroundCleanup(t *testing.T) {
	for _, tt := range []struct {
		input string
		want  bool
	}{
		{"\n", true}, {"y\n", true}, {" Y \r\n", true}, {"yes\n", true},
		{"n\n", false}, {"anything\n", false}, {"", false}, {"y", false},
	} {
		t.Run(fmt.Sprintf("%q", tt.input), func(t *testing.T) {
			if got := confirmBackgroundCleanup(bufio.NewReader(strings.NewReader(tt.input)), io.Discard); got != tt.want {
				t.Fatalf("confirmation=%v, want %v", got, tt.want)
			}
		})
	}
	if confirmBackgroundCleanup(nil, io.Discard) {
		t.Fatal("missing input must not approve termination")
	}
	// A line typed before the confirmation question must not count as consent.
	reader := bufio.NewReader(strings.NewReader("1\n\n"))
	_, _ = reader.ReadString('\n')
	if reader.Buffered() == 0 {
		t.Fatal("fixture did not buffer the queued Enter")
	}
	if err := discardBufferedConfirmationInput(reader); err != nil {
		t.Fatal(err)
	}
	if confirmBackgroundCleanup(reader, io.Discard) {
		t.Fatal("queued Enter must not approve termination")
	}
}

func TestVisibleAppWindowDetection(t *testing.T) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	class, err := syscall.UTF16PtrFromString("STATIC")
	if err != nil {
		t.Fatal(err)
	}
	title, _ := syscall.UTF16PtrFromString("")
	// An off-screen tool window exercises visible-window detection without
	// opening a user-facing application or adding a taskbar button.
	createWindow := user32.NewProc("CreateWindowExW")
	hwnd, _, callErr := createWindow.Call(0x80, uintptr(unsafe.Pointer(class)), uintptr(unsafe.Pointer(title)),
		0x80000000|0x10000000, uintptr(uint32(0xffff8300)), uintptr(uint32(0xffff8300)), 1, 1, 0, 0, 0, 0)
	if hwnd == 0 {
		t.Skipf("cannot create test window: %v", callErr)
	}
	defer user32.NewProc("DestroyWindow").Call(hwnd)
	visible, err := hasVisibleAppWindow([]backgroundProcessIdentity{{pid: uint32(os.Getpid())}})
	if err != nil || !visible {
		t.Fatalf("visible window not detected: visible=%v error=%v", visible, err)
	}
	self, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := snapshotBackgroundProcesses(AppConfig{Name: "test", Exe: filepath.Base(self), PossiblePaths: []string{self}}); err == nil ||
		!strings.Contains(err.Error(), "可见窗口") {
		t.Fatalf("visible application must not be offered for termination: %v", err)
	}
	showWindow.Call(hwnd, 0)
	visible, err = hasVisibleAppWindow([]backgroundProcessIdentity{{pid: uint32(os.Getpid())}})
	if err != nil || visible {
		t.Fatalf("hidden window counted as visible: visible=%v error=%v", visible, err)
	}
}

func TestBackgroundCleanupHelper(t *testing.T) {
	if os.Getenv("AGY_HANS_BACKGROUND_HELPER") != "1" {
		return
	}
	fmt.Println("background-helper-ready")
	_, _ = bufio.NewReader(os.Stdin).ReadByte()
}

func startBackgroundFixture(t *testing.T) (AppConfig, *exec.Cmd, <-chan struct{}) {
	t.Helper()
	self, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	input, err := os.Open(self)
	if err != nil {
		t.Fatal(err)
	}
	defer input.Close()
	copyPath := filepath.Join(t.TempDir(), "antigravity-hans-background-fixture.exe")
	output, err := os.Create(copyPath)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = io.Copy(output, input); err != nil {
		_ = output.Close()
		t.Fatal(err)
	}
	if err = output.Close(); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command(copyPath, "-test.run=^TestBackgroundCleanupHelper$")
	cmd.Env = append(os.Environ(), "AGY_HANS_BACKGROUND_HELPER=1")
	stdin, err := cmd.StdinPipe()
	if err != nil {
		t.Fatal(err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err = cmd.Start(); err != nil {
		t.Fatal(err)
	}
	done := make(chan struct{})
	go func() { _ = cmd.Wait(); close(done) }()
	t.Cleanup(func() {
		_ = stdin.Close()
		select {
		case <-done:
		case <-time.After(2 * time.Second):
			_ = cmd.Process.Kill()
			<-done
		}
	})
	ready, err := bufio.NewReader(stdout).ReadString('\n')
	if err != nil || strings.TrimSpace(ready) != "background-helper-ready" {
		t.Fatalf("fixture did not start: %v", err)
	}
	cfg := AppConfig{Name: "background fixture", Exe: filepath.Base(copyPath), PossiblePaths: []string{copyPath}}
	return cfg, cmd, done
}

func TestBackgroundCleanupOnlyTerminatesVerifiedProcess(t *testing.T) {
	cfg, cmd, done := startBackgroundFixture(t)
	unknown := cfg
	unknown.PossiblePaths = nil
	if _, err := snapshotBackgroundProcesses(unknown); err == nil || !strings.Contains(err.Error(), "安装位置") {
		t.Fatalf("unrecognized installation path accepted: %v", err)
	}
	targets, err := snapshotBackgroundProcesses(cfg)
	if err != nil || len(targets) != 1 || targets[0].pid != uint32(cmd.Process.Pid) {
		t.Fatalf("unexpected background inventory: count=%d error=%v", len(targets), err)
	}
	handle, err := windows.OpenProcess(windows.PROCESS_TERMINATE|windows.SYNCHRONIZE, false, targets[0].pid)
	if err != nil {
		t.Fatal(err)
	}
	defer windows.CloseHandle(handle)
	changed := append([]backgroundProcessIdentity(nil), targets...)
	changed[0].created.LowDateTime++
	if err := terminateBackgroundProcesses(cfg, changed); err == nil {
		t.Fatal("reused or changed PID was accepted")
	}
	select {
	case <-done:
		t.Fatal("identity mismatch terminated the fixture")
	default:
	}
	if err := terminateBackgroundProcesses(cfg, targets); err != nil {
		t.Fatal(err)
	}
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("verified fixture process was not terminated")
	}
	if err := terminateOrConfirmExited(handle, targets[0].pid); err != nil {
		t.Fatalf("already exited helper should be accepted: %v", err)
	}
}

func TestBackgroundCleanupInteractive(t *testing.T) {
	expected := os.Getenv("AGY_HANS_TEST_BACKGROUND_PROMPT")
	if expected != "accept" && expected != "decline" {
		t.Skip("explicit interactive test opt-in required")
	}
	var mode uint32
	if err := windows.GetConsoleMode(windows.Handle(os.Stdin.Fd()), &mode); err != nil {
		t.Fatal("interactive test requires a real console")
	}
	cfg, _, done := startBackgroundFixture(t)
	ok := KillProcess(cfg, true, bufio.NewReader(os.Stdin))
	if ok != (expected == "accept") {
		t.Fatalf("unexpected cleanup result: %v", ok)
	}
	select {
	case <-done:
		if expected == "decline" {
			t.Fatal("declined cleanup terminated the fixture")
		}
	case <-time.After(500 * time.Millisecond):
		if expected == "accept" {
			t.Fatal("accepted cleanup did not terminate the fixture")
		}
	}
}

func TestInspectRunningBackgroundApp(t *testing.T) {
	if os.Getenv("AGY_HANS_TEST_BACKGROUND_INVENTORY") != "1" {
		t.Skip("explicit opt-in required for read-only inspection of the running app")
	}
	targets, err := snapshotBackgroundProcesses(AppNormal)
	if err != nil {
		t.Fatal(err)
	}
	if len(targets) == 0 {
		t.Fatal("no background app process found")
	}
	t.Logf("read-only check verified %d background app process(es)", len(targets))
}
