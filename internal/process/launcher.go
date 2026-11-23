package process

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"antigravity-hans/internal/app"
)

// LaunchWithDebug 以调试模式后台启动应用。
func LaunchWithDebug(appPath string, port int) error {
	args := []string{
		appPath,
		fmt.Sprintf("--remote-debugging-port=%d", port),
		"--remote-debugging-address=127.0.0.1",
	}

	// 默认不传入 --remote-allow-origins=*，仅在排查问题时通过环境变量临时放开。
	if os.Getenv("AGY_HANS_ALLOW_ANY_ORIGIN") == "1" {
		fmt.Println("[警告] 已启用 AGY_HANS_ALLOW_ANY_ORIGIN=1，调试端口将接受任意 Origin（存在安全风险）。")
		args = append(args, "--remote-allow-origins=*")
	}
	cmd := exec.Command(args[0], args[1:]...)
	cmd.Dir = filepath.Dir(appPath)
	cmd.Env = envWithoutElectronRunAsNode(os.Environ())
	cmd.Stdout = nil
	cmd.Stderr = nil
	cmd.Stdin = nil

	SetSysProcAttr(cmd)
	return cmd.Start()
}

func envWithoutElectronRunAsNode(environ []string) []string {
	filtered := make([]string, 0, len(environ))
	for _, kv := range environ {
		if len(kv) >= len("ELECTRON_RUN_AS_NODE=") &&
			(kv[:len("ELECTRON_RUN_AS_NODE=")] == "ELECTRON_RUN_AS_NODE=" ||
				(app.IsWindows && equalFoldPrefix(kv, "ELECTRON_RUN_AS_NODE="))) {
			continue
		}
		filtered = append(filtered, kv)
	}
	return filtered
}

func equalFoldPrefix(s, prefix string) bool {
	if len(s) < len(prefix) {
		return false
	}
	for i := 0; i < len(prefix); i++ {
		a, b := s[i], prefix[i]
		if a == b {
			continue
		}
		if a >= 'a' && a <= 'z' {
			a -= 'a' - 'A'
		}
		if b >= 'a' && b <= 'z' {
			b -= 'a' - 'A'
		}
		if a != b {
			return false
		}
	}
	return true
}

// KillProcess 先请求应用正常退出；失败时清理无可见窗口的后台残留进程。
// 交互模式征求用户确认，无交互模式（--nogui）自动清理已校验的残留进程。
func KillProcess(cfg app.Config, interactive bool, input *bufio.Reader) bool {
	fmt.Printf("正在请求 %s 正常退出（保存状态）...\n", cfg.Name)
	err := quitOrOfferBackgroundCleanup(interactive, func() error {
		return quitAndWait(cfg, requestGracefulQuit, WaitForAppExit)
	}, func() (bool, error) {
		return requestBackgroundCleanup(cfg, input)
	}, func() (bool, error) {
		return autoTerminateBackgroundProcesses(cfg)
	})
	if err != nil {
		fmt.Printf("[提示] 已中止重启: %v。请保存内容并手动退出应用后重试。\n", err)
		return false
	}
	fmt.Printf("[成功] %s 已退出。\n", cfg.Name)
	return true
}

func quitOrOfferBackgroundCleanup(interactive bool, quit func() error, cleanup, autoCleanup func() (bool, error)) error {
	err := quit()
	if err == nil {
		return nil
	}
	if !interactive {
		completed, autoErr := autoCleanup()
		if autoErr != nil {
			return fmt.Errorf("%v；自动清理后台进程失败: %w", err, autoErr)
		}
		if completed {
			return nil
		}
		return err
	}
	completed, cleanupErr := cleanup()
	if cleanupErr != nil {
		return fmt.Errorf("%v；后台进程处理失败: %w", err, cleanupErr)
	}
	if completed {
		return nil
	}
	return err
}

func quitAndWait(cfg app.Config, request func(app.Config) error, wait func(app.Config, time.Duration) bool) error {
	if err := request(cfg); err != nil {
		return fmt.Errorf("正常退出请求取消、被拒绝或失败: %w", err)
	}
	timeout := gracefulQuitTimeout()
	if !wait(cfg, timeout) {
		return fmt.Errorf("应用未在 %s 内退出", timeout)
	}
	return nil
}

// WaitForAppExit 在超时时间内轮询等待应用完全退出。
func WaitForAppExit(cfg app.Config, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for {
		if !app.Detect(cfg).Running {
			return true
		}
		if time.Now().After(deadline) {
			return false
		}
		time.Sleep(200 * time.Millisecond)
	}
}
