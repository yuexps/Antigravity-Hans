//go:build windows

package main

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"

	"github.com/shirou/gopsutil/v4/process"
	"golang.org/x/sys/windows"
)

type backgroundProcessIdentity struct {
	pid       uint32
	exe       string
	created   windows.Filetime
	sessionID uint32
}

var (
	enumWindowsProc              = user32.NewProc("EnumWindows")
	isWindowVisibleProc          = user32.NewProc("IsWindowVisible")
	getWindowThreadProcessIDProc = user32.NewProc("GetWindowThreadProcessId")
	windowEnumMu                 sync.Mutex
	windowEnumTargets            map[uint32]struct{}
	windowEnumVisible            bool
	windowEnumFailed             bool
	windowEnumCallback           = syscall.NewCallback(func(hwnd, _ uintptr) uintptr {
		visible, _, _ := isWindowVisibleProc.Call(hwnd)
		if visible == 0 {
			return 1
		}
		var pid uint32
		thread, _, _ := getWindowThreadProcessIDProc.Call(hwnd, uintptr(unsafe.Pointer(&pid)))
		if thread == 0 {
			windowEnumFailed = true
			return 0
		}
		if _, found := windowEnumTargets[pid]; found {
			windowEnumVisible = true
			return 0
		}
		return 1
	})
)

// EnumWindows is synchronous. A shared callback and mutex avoid allocating a
// new, permanently registered Windows callback on every retry.
func hasVisibleAppWindow(targets []backgroundProcessIdentity) (bool, error) {
	windowEnumMu.Lock()
	defer windowEnumMu.Unlock()
	windowEnumTargets = make(map[uint32]struct{}, len(targets))
	for _, target := range targets {
		windowEnumTargets[target.pid] = struct{}{}
	}
	defer func() { windowEnumTargets = nil }()
	windowEnumVisible, windowEnumFailed = false, false
	result, _, callErr := enumWindowsProc.Call(windowEnumCallback, 0)
	if windowEnumFailed {
		return false, fmt.Errorf("无法确认窗口所属进程")
	}
	if windowEnumVisible {
		return true, nil
	}
	if result == 0 {
		return false, fmt.Errorf("无法枚举应用窗口: %v", callErr)
	}
	return false, nil
}

func readBackgroundProcessIdentity(handle windows.Handle, pid uint32) (backgroundProcessIdentity, error) {
	state, err := windows.WaitForSingleObject(handle, 0)
	if err != nil || state != uint32(windows.WAIT_TIMEOUT) {
		return backgroundProcessIdentity{}, fmt.Errorf("进程 %d 已退出或无法检查", pid)
	}
	name := make([]uint16, 32768)
	size := uint32(len(name))
	if err := windows.QueryFullProcessImageName(handle, 0, &name[0], &size); err != nil {
		return backgroundProcessIdentity{}, err
	}
	var created, exited, kernel, user windows.Filetime
	if err := windows.GetProcessTimes(handle, &created, &exited, &kernel, &user); err != nil {
		return backgroundProcessIdentity{}, err
	}
	var session uint32
	if err := windows.ProcessIdToSessionId(pid, &session); err != nil {
		return backgroundProcessIdentity{}, err
	}
	return backgroundProcessIdentity{pid: pid, exe: windows.UTF16ToString(name[:size]), created: created, sessionID: session}, nil
}

func sameBackgroundIdentity(a, b backgroundProcessIdentity) bool {
	return a.pid == b.pid && a.created == b.created && a.sessionID == b.sessionID &&
		strings.EqualFold(filepath.Clean(a.exe), filepath.Clean(b.exe))
}

func isKnownBackgroundExecutable(path string, cfg AppConfig, paths []string) bool {
	if !isExpectedExecutable(path, cfg) {
		return false
	}
	for _, candidate := range paths {
		if isExpectedExecutable(candidate, cfg) && samePath(candidate, path) {
			return true
		}
	}
	return false
}

// Snapshot only same-session processes whose actual executable can be verified.
// If any matching process is inaccessible or has a visible window, abort.
func snapshotBackgroundProcesses(cfg AppConfig) ([]backgroundProcessIdentity, error) {
	var session uint32
	if err := windows.ProcessIdToSessionId(windows.GetCurrentProcessId(), &session); err != nil {
		return nil, fmt.Errorf("无法确认当前会话: %w", err)
	}
	procs, err := process.Processes()
	if err != nil {
		return nil, fmt.Errorf("无法枚举进程: %w", err)
	}
	knownPaths := append([]string(nil), cfg.PossiblePaths...)
	registryChecked := false
	var targets []backgroundProcessIdentity
	for _, p := range procs {
		name, _ := p.Name()
		exe, _ := p.Exe()
		if !isProcessMatch(name, exe, cfg) {
			continue
		}
		if exe == "" || !isExpectedExecutable(exe, cfg) {
			return nil, fmt.Errorf("无法确认进程 %d 的可执行文件", p.Pid)
		}
		if !isKnownBackgroundExecutable(exe, cfg, knownPaths) && !registryChecked {
			knownPaths = append(knownPaths, GetPathsFromRegistry(cfg.Name, cfg.Exe)...)
			registryChecked = true
		}
		if !isKnownBackgroundExecutable(exe, cfg, knownPaths) {
			return nil, fmt.Errorf("进程 %d 不属于已确认的安装位置", p.Pid)
		}
		handle, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION|windows.SYNCHRONIZE, false, uint32(p.Pid))
		if err != nil {
			return nil, fmt.Errorf("无法检查进程 %d: %w", p.Pid, err)
		}
		identity, err := readBackgroundProcessIdentity(handle, uint32(p.Pid))
		_ = windows.CloseHandle(handle)
		if err != nil {
			return nil, fmt.Errorf("无法确认进程 %d: %w", p.Pid, err)
		}
		if identity.sessionID != session || !strings.EqualFold(filepath.Clean(identity.exe), filepath.Clean(exe)) {
			return nil, fmt.Errorf("进程 %d 的会话或可执行文件不匹配", p.Pid)
		}
		targets = append(targets, identity)
	}
	sort.Slice(targets, func(i, j int) bool { return targets[i].pid < targets[j].pid })
	if len(targets) == 0 {
		return targets, nil
	}
	visible, err := hasVisibleAppWindow(targets)
	if err != nil {
		return nil, err
	}
	if visible {
		return nil, fmt.Errorf("应用仍有可见窗口，请先保存并关闭")
	}
	return targets, nil
}

func backgroundSnapshotsEqual(a, b []backgroundProcessIdentity) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if !sameBackgroundIdentity(a[i], b[i]) {
			return false
		}
	}
	return true
}

func confirmBackgroundCleanup(input *bufio.Reader, output io.Writer) bool {
	fmt.Fprint(output, "强制结束可能丢失未保存的后台工作。是否结束以上后台进程并重新启动？[Y/n]: ")
	if input == nil {
		return false
	}
	line, err := input.ReadString('\n')
	if err != nil { // EOF is not an Enter key or consent.
		return false
	}
	answer := strings.TrimSpace(strings.ToLower(line))
	return answer == "" || answer == "y" || answer == "yes"
}

func discardBufferedConfirmationInput(input *bufio.Reader) error {
	if count := input.Buffered(); count != 0 {
		_, err := input.Discard(count)
		return err
	}
	return nil
}

func terminateOrConfirmExited(handle windows.Handle, pid uint32) error {
	if err := windows.TerminateProcess(handle, 1); err != nil {
		// Closing the main process may already have stopped a helper.
		state, waitErr := windows.WaitForSingleObject(handle, 0)
		if waitErr != nil || state != windows.WAIT_OBJECT_0 {
			return fmt.Errorf("无法结束进程 %d: %w", pid, err)
		}
	}
	return nil
}

func terminateBackgroundProcesses(cfg AppConfig, original []backgroundProcessIdentity) error {
	current, err := snapshotBackgroundProcesses(cfg)
	if err != nil {
		return err
	}
	if len(current) == 0 {
		return nil
	}
	if !backgroundSnapshotsEqual(original, current) {
		return fmt.Errorf("后台进程已发生变化，请重新确认")
	}
	var handles []windows.Handle
	defer func() {
		for _, handle := range handles {
			_ = windows.CloseHandle(handle)
		}
	}()
	for _, target := range current {
		handle, err := windows.OpenProcess(windows.PROCESS_TERMINATE|windows.PROCESS_QUERY_LIMITED_INFORMATION|windows.SYNCHRONIZE, false, target.pid)
		if err != nil {
			return fmt.Errorf("无法打开进程 %d: %w", target.pid, err)
		}
		handles = append(handles, handle)
		identity, err := readBackgroundProcessIdentity(handle, target.pid)
		if err != nil || !sameBackgroundIdentity(target, identity) {
			return fmt.Errorf("进程 %d 已发生变化，请重新确认", target.pid)
		}
	}
	// Recheck the entire process set after opening the handles: an application
	// may have been reopened or acquired a visible window during confirmation.
	latest, err := snapshotBackgroundProcesses(cfg)
	if err != nil {
		return err
	}
	if !backgroundSnapshotsEqual(current, latest) {
		return fmt.Errorf("后台进程已发生变化，请重新确认")
	}
	for i, handle := range handles {
		if err := terminateOrConfirmExited(handle, current[i].pid); err != nil {
			return err
		}
	}
	deadline := time.Now().Add(gracefulQuitTimeout)
	for i, handle := range handles {
		remaining := time.Until(deadline)
		if remaining <= 0 {
			return fmt.Errorf("等待进程 %d 退出超时", current[i].pid)
		}
		state, err := windows.WaitForSingleObject(handle, uint32(remaining.Milliseconds())+1)
		if err != nil || state != windows.WAIT_OBJECT_0 {
			return fmt.Errorf("无法确认进程 %d 已退出", current[i].pid)
		}
	}
	if !waitForAppExit(cfg, gracefulQuitTimeout) {
		return fmt.Errorf("后台进程未完全退出")
	}
	return nil
}

func requestBackgroundCleanup(cfg AppConfig, input *bufio.Reader) (bool, error) {
	var mode uint32
	if input == nil || windows.GetConsoleMode(windows.Handle(os.Stdin.Fd()), &mode) != nil {
		return false, nil // Do not interpret redirected input or EOF as approval.
	}
	targets, err := snapshotBackgroundProcesses(cfg)
	if err != nil {
		return false, err
	}
	if len(targets) == 0 {
		return true, nil
	}
	ids := make([]string, 0, len(targets))
	for _, target := range targets {
		ids = append(ids, fmt.Sprint(target.pid))
	}
	// Do not let an Enter queued before the question count as consent.
	if err := discardBufferedConfirmationInput(input); err != nil {
		return false, fmt.Errorf("无法清理待处理输入: %w", err)
	}
	if err := windows.FlushConsoleInputBuffer(windows.Handle(os.Stdin.Fd())); err != nil {
		return false, fmt.Errorf("无法清理控制台输入: %w", err)
	}
	fmt.Printf("[提示] 检测到 %s 的无可见窗口进程（PID: %s）。\n", cfg.Name, strings.Join(ids, ", "))
	if !confirmBackgroundCleanup(input, os.Stdout) {
		fmt.Println("[提示] 已取消结束后台进程。")
		return false, nil
	}
	if err := terminateBackgroundProcesses(cfg, targets); err != nil {
		return false, err
	}
	fmt.Printf("[成功] %s 的后台进程已退出。\n", cfg.Name)
	return true, nil
}
