//go:build !windows

package process

import (
	"bufio"
	"os/exec"
	"syscall"

	"antigravity-hans/internal/app"
)

// HideConsole 在 Unix 平台上为空实现。
func HideConsole() {}

// SetSysProcAttr 配置子进程创建新会话与父进程分离。
func SetSysProcAttr(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setsid: true,
	}
}

func requestBackgroundCleanup(_ app.Config, _ *bufio.Reader) (bool, error) {
	return false, nil
}

func autoTerminateBackgroundProcesses(_ app.Config) (bool, error) {
	return false, nil
}
