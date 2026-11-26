package main

import (
	"bufio"
	"fmt"
	"os"
	"os/signal"
	"slices"
	"syscall"

	"antigravity-hans/internal/app"
	"antigravity-hans/internal/cdp"
	"antigravity-hans/internal/cli"
	"antigravity-hans/internal/overlay"
	"antigravity-hans/internal/process"
	"antigravity-hans/internal/shortcut"
)

// Version 由编译时通过 -ldflags "-X main.Version=v1.0.0" 注入。
var Version = "dev"

func main() {
	args := os.Args[1:]
	// --nogui（快捷方式 / 后台启动）时控制台不可见，禁止等待标准输入。
	interactive := !slices.Contains(args, "--nogui")
	if !interactive {
		process.HideConsole()
	}

	setupSignalHandler()

	if slices.Contains(args, "--stop") {
		process.StopMonitors(process.MonitorTargets(args))
		return
	}

	overlaySource := overlay.LoadSource(slices.Contains(args, "--trust-external-overlay"))
	trustCustom := slices.Contains(args, overlay.TrustCustomTranslationsArg)
	overlaySource = overlay.CustomTranslationsPrelude(overlay.LoadCustomTranslations(trustCustom)) + overlaySource

	if len(args) > 0 {
		dispatchCLI(args, overlaySource, interactive, trustCustom)
		return
	}

	cli.RunMainMenu(Version, overlaySource, trustCustom)
}

func setupSignalHandler() {
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-sigCh
		fmt.Println("\n\n[提示] 汉化监视已由用户终止退出。")
		os.Exit(0)
	}()
}

func dispatchCLI(args []string, overlaySource string, interactive, trustCustom bool) {
	input := bufio.NewReader(os.Stdin)

	isPatch := slices.Contains(args, "--patch") || slices.Contains(args, "-patch")
	isShortcut := slices.Contains(args, "--shortcut") || slices.Contains(args, "-shortcut") || slices.Contains(args, "--create-shortcut")
	isApp := slices.Contains(args, "--app") || slices.Contains(args, "-app")
	isIDE := slices.Contains(args, "--ide") || slices.Contains(args, "-ide")
	attachOnly := slices.Contains(args, "--attach-only")
	withProxy := slices.Contains(args, "--with-proxy")

	if withProxy {
		switch {
		case !app.IsWindows:
			fmt.Println("[错误] 自动代理启动仅支持 Windows。")
			return
		case isPatch || attachOnly || (!isShortcut && !isApp && !isIDE):
			fmt.Println("[错误] --with-proxy 仅用于动态汉化启动或生成快捷方式，不能与 --attach-only 一起使用。")
			return
		}
	}
	if isPatch {
		cli.RunPatchMenu(overlaySource)
		return
	}

	if isShortcut {
		runShortcutCLI(isApp, isIDE, shortcut.Options{TrustCustomTranslations: trustCustom, WithProxy: withProxy})
		return
	}
	options := cdp.RunOptions{Interactive: interactive, AttachOnly: attachOnly, WithProxy: withProxy}
	if isIDE {
		cdp.Run(app.DefaultIDE(), overlaySource, options, input)
		return
	}
	if isApp {
		cdp.Run(app.DefaultNormal(), overlaySource, options, input)
		return
	}

	printCLIUsage()
}

func runShortcutCLI(isApp, isIDE bool, options shortcut.Options) {
	var targets []app.Config
	switch {
	case isIDE:
		targets = []app.Config{app.DefaultIDE()}
	case isApp:
		targets = []app.Config{app.DefaultNormal()}
	default:
		targets = []app.Config{app.DefaultNormal(), app.DefaultIDE()}
	}
	for _, cfg := range targets {
		if err := shortcut.Create(cfg, options); err != nil {
			fmt.Printf("[错误] 创建快捷方式失败: %v\n", err)
		}
	}
}

func printCLIUsage() {
	fmt.Println("未知的命令行参数。用法：")
	fmt.Println("  antigravity-hans --app             # 动态汉化 Antigravity")
	fmt.Println("  antigravity-hans --ide             # 动态汉化 Antigravity IDE")
	fmt.Println("  antigravity-hans --patch           # 静态补丁菜单")
	fmt.Println("  antigravity-hans --shortcut        # 生成两者的中文快捷方式/包装 App")
	fmt.Println("  antigravity-hans --shortcut --app  # 生成 Antigravity 中文快捷方式")
	fmt.Println("  antigravity-hans --shortcut --ide  # 生成 Antigravity IDE 中文快捷方式")
	fmt.Println("  antigravity-hans --stop            # 结束由本工具启动的汉化监视器")
	fmt.Println("  antigravity-hans --app --attach-only  # 仅连接已有调试端口，不启动或重启应用")
	if app.IsWindows {
		fmt.Println("  antigravity-hans --app --with-proxy  # 使用自动检测的代理启动，可换成 --ide")
		fmt.Println("  antigravity-hans --shortcut --app --with-proxy  # 生成自动代理快捷方式，可换成 --ide")
	}
	fmt.Println("  antigravity-hans --trust-external-overlay  # 跳过校验，强制加载同目录外部汉化脚本")
	fmt.Println("  antigravity-hans --trust-custom-translations  # 显式信任同目录自定义翻译名单")
}
