//go:build windows

package process

import (
	"context"
	"os/exec"
	"syscall"
	"time"

	"antigravity-hans/internal/app"
)

var (
	user32           = syscall.NewLazyDLL("user32.dll")
	kernel32         = syscall.NewLazyDLL("kernel32.dll")
	getConsoleWindow = kernel32.NewProc("GetConsoleWindow")
	showWindow       = user32.NewProc("ShowWindow")
)

// HideConsole 在 Windows 无交互启动时隐藏当前控制台窗口。
func HideConsole() {
	hwnd, _, _ := getConsoleWindow.Call()
	if hwnd != 0 {
		showWindow.Call(hwnd, 0) // SW_HIDE = 0
	}
}

// SetSysProcAttr 配置子进程脱离当前控制台与进程组运行。
func SetSysProcAttr(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: syscall.CREATE_NEW_PROCESS_GROUP | 0x00000008, // DETACHED_PROCESS
	}
}

func gracefulQuitTimeout() time.Duration {
	return 5 * time.Second
}

// requestGracefulQuit 通过不带 /F 的 taskkill 向应用主窗口发送关闭请求。
func requestGracefulQuit(cfg app.Config) error {
	if _, err := exec.LookPath("taskkill"); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), gracefulQuitTimeout())
	defer cancel()
	return exec.CommandContext(ctx, "taskkill", "/IM", cfg.Exe).Run()
}

// FocusRunningNormalApp 在 Windows 平台上为空实现。
func FocusRunningNormalApp(_ app.Config) {}
