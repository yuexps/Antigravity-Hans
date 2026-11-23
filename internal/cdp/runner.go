package cdp

import (
	"bufio"
	"fmt"
	"sync"
	"time"

	"antigravity-hans/internal/app"
	"antigravity-hans/internal/process"
)

// Run 启动并监视目标应用；attachOnly 为 true 时仅复用已有调试端口。
func Run(cfg app.Config, overlaySource string, interactive, attachOnly bool, input *bufio.Reader) {
	release, ok := process.AcquireMonitorLock(cfg)
	if !ok {
		process.FocusRunningNormalApp(cfg)
		return
	}
	defer release()

	injectedSet := make(map[string]bool)
	var mu sync.Mutex

	if port, found := findCDPPort(cfg); found {
		cfg.Port = port
		fmt.Printf("检测到 %s 调试端口 %d 已开启，直接进入监视模式...\n", cfg.Name, port)
		process.FocusRunningNormalApp(cfg)
		Watch(cfg, overlaySource, injectedSet, &mu)
		return
	}

	if attachOnly {
		fmt.Printf("[提示] 未找到 %s 可复用的调试端口；仅连接模式不会启动或重启应用。\n", cfg.Name)
		return
	}

	detected := app.Detect(cfg)
	if detected.Running {
		fmt.Printf("[提示] 检测到 %s 正在运行，但未开启调试端口。正在重新拉起...\n", detected.Name)
		if !process.KillProcess(cfg, interactive, input) {
			return
		}
		time.Sleep(1500 * time.Millisecond)
	}

	port, ok := selectFreePort(cfg.Port)
	if !ok {
		fmt.Printf("[错误] 候选端口 %v 均被占用，已中止启动。\n", candidatePorts(cfg.Port))
		return
	}
	if port != cfg.Port {
		fmt.Printf("[提示] 首选端口 %d 已被占用，本次改用 %d。\n", cfg.Port, port)
	}
	cfg.Port = port

	detected = app.Detect(cfg)
	targetPath := selectLaunchTarget(detected, interactive, input)
	if targetPath == "" {
		return
	}

	if !app.IsExpectedExecutable(targetPath, cfg) {
		fmt.Printf("[错误] 启动路径校验未通过（期望可执行文件 %s）: %s\n", cfg.Exe, targetPath)
		return
	}

	fmt.Printf("正在以调试模式启动 %s: %s (调试端口 %d) ...\n", detected.Name, targetPath, detected.Port)
	if err := process.LaunchWithDebug(targetPath, detected.Port); err != nil {
		fmt.Printf("[错误] 启动失败: %v\n", err)
		return
	}
	fmt.Printf("正在等待 %s 调试端口就绪并建立监视...\n", detected.Name)
	if WaitForPort(detected.Port, 20000) {
		fmt.Printf("[成功] %s 调试接口已就绪。\n", detected.Name)
	} else {
		fmt.Printf("[警告] 等待 %s 调试端口超时，尝试直接连接...\n", detected.Name)
	}

	Watch(cfg, overlaySource, injectedSet, &mu)
}

func selectLaunchTarget(detected app.Detected, interactive bool, input *bufio.Reader) string {
	if detected.Path != "" {
		return detected.Path
	}
	switch len(detected.AllPaths) {
	case 0:
		fmt.Printf("[错误] 未能在本机找到 %s 的安装路径。\n", detected.Name)
		return ""
	case 1:
		return detected.AllPaths[0]
	default:
		fmt.Printf("\n检测到本机存在多个 %s 安装实例，请选择启动哪一个：\n", detected.Name)
		for i, p := range detected.AllPaths {
			fmt.Printf(" [%d] %s\n", i+1, p)
		}
		if !interactive {
			fmt.Printf("[提示] 非交互模式，自动选择第 1 个安装实例。\n")
			return detected.AllPaths[0]
		}
		var choice int
		fmt.Printf("请选择 (1-%d, 默认 1): ", len(detected.AllPaths))
		if input != nil {
			line, _ := input.ReadString('\n')
			fmt.Sscan(line, &choice)
		}
		if choice < 1 || choice > len(detected.AllPaths) {
			choice = 1
		}
		return detected.AllPaths[choice-1]
	}
}
