package main

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

// LaunchWithDebug 以调试模式后台启动 App
func LaunchWithDebug(appPath string, port int) error {
	args := []string{
		appPath,
		fmt.Sprintf("--remote-debugging-port=%d", port),
		"--remote-debugging-address=127.0.0.1",
	}

	// 默认不再传入 --remote-allow-origins=*：
	// Chromium 仅在 WebSocket 请求携带非白名单 Origin 时才会拒绝，而 gorilla/websocket
	// 默认不发送 Origin 头，所以本工具并不需要该参数；而通配它会关闭浏览器针对
	// DNS rebinding 的保护，使本地调试端口暴露给任意网页或同机其他用户。
	// 仅在排查注入问题时，才用环境变量临时恢复旧行为。
	if os.Getenv("AGY_HANS_ALLOW_ANY_ORIGIN") == "1" {
		fmt.Println("[警告] 已启用 AGY_HANS_ALLOW_ANY_ORIGIN=1，调试端口将接受任意 Origin（存在安全风险）。")
		args = append(args, "--remote-allow-origins=*")
	}
	cmd := exec.Command(args[0], args[1:]...)
	cmd.Dir = filepath.Dir(appPath)
	cmd.Stdout = nil
	cmd.Stderr = nil
	cmd.Stdin = nil

	setSysProcAttr(cmd) // 平台特定的进程属性（detach）

	return cmd.Start()
}

// gracefulQuitTimeout 是等待应用正常退出的最长时间；取消或超时均中止重启。
// 各平台可在自己的 init 中调整（见 quit_windows.go）。
var gracefulQuitTimeout = 8 * time.Second

// KillProcess 先请求正常退出；仅 Windows 交互模式可在用户确认后清理后台残留。
func KillProcess(cfg AppConfig, interactive bool, input *bufio.Reader) bool {
	fmt.Printf("正在请求 %s 正常退出（保存状态）...\n", cfg.Name)
	err := quitOrOfferBackgroundCleanup(interactive, func() error {
		return quitAndWait(cfg, requestGracefulQuit, waitForAppExit)
	}, func() (bool, error) {
		return requestBackgroundCleanup(cfg, input)
	})
	if err != nil {
		fmt.Printf("[提示] 已中止重启: %v。请保存内容并手动退出应用后重试。\n", err)
		return false
	}
	fmt.Printf("[成功] %s 已退出。\n", cfg.Name)
	return true
}

// 只有正常退出失败且允许交互时才提供后台清理；取消或失败都中止重启。
func quitOrOfferBackgroundCleanup(interactive bool, quit func() error, cleanup func() (bool, error)) error {
	err := quit()
	if err == nil || !interactive {
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

func quitAndWait(cfg AppConfig, request func(AppConfig) error, wait func(AppConfig, time.Duration) bool) error {
	if err := request(cfg); err != nil {
		return fmt.Errorf("正常退出请求取消、被拒绝或失败: %w", err)
	}
	if !wait(cfg, gracefulQuitTimeout) {
		return fmt.Errorf("应用未在 %s 内退出", gracefulQuitTimeout)
	}
	return nil
}

// waitForAppExit 在超时时间内轮询等待应用完全退出
func waitForAppExit(cfg AppConfig, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for {
		if !DetectApp(cfg).Running {
			return true
		}
		if time.Now().After(deadline) {
			return false
		}
		time.Sleep(200 * time.Millisecond)
	}
}

// fileExists 判断文件是否存在
func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
