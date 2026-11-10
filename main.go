package main

import (
	"bufio"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"syscall"
)

// Version 由编译时通过 -ldflags "-X main.Version=v1.0.0" 注入
var Version = "dev"

func getBanner() string {
	return `
  ___        _   _                     _ _          _   _
 / _ \      | | (_)                   (_) |        | | | |
/ /_\ \_ __ | |_ _  __ _ _ __ __ ___   _| |_ _   _| |_| | __ _ _ __  ___
|  _  | '_ \| __| |/ _  | '__/ _  \ \ / / | __| | | |  _  |/ _  | '_ \/ __|
| | | | | | | |_| | (_| | | | (_| |\ V /| | |_| |_| | | | | (_| | | | \__ \
\_| |_/_| |_|\__|_|\__, |_|  \__,_| \_/ |_|\__|\__, \_/ |_|\__,_|_| |_|___/
                    __/ |                        __/ |
                   |___/                        |___/  汉化工具 ` + Version + `
`
}

func main() {
	args := os.Args[1:]
	// --nogui（快捷方式 / 后台启动）时控制台不可见，必须禁止一切等待标准输入的交互
	interactive := !containsArg(args, "--nogui")
	if !interactive {
		HideConsole()
	}

	// 捕获 Ctrl+C
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-sigCh
		fmt.Println("\n\n[提示] 汉化监视已由用户终止退出。")
		os.Exit(0)
	}()

	// 加载汉化 JS（可执行文件同目录的外部脚本需先通过完整性校验）
	overlaySource := LoadOverlaySource(containsArg(args, "--trust-external-overlay"))

	// 命令行参数模式（非交互）
	if len(args) > 0 {
		// 结束由本工具启动的汉化监视器
		if containsArg(args, "--stop") {
			stopMonitors(monitorTargets(args))
			return
		}

		// 静态补丁参数
		if containsArg(args, "--patch") || containsArg(args, "-patch") {
			runPatchMenu(overlaySource)
			return
		}

		// 创建快捷方式参数
		isShortcut := containsArg(args, "--shortcut") || containsArg(args, "-shortcut") || containsArg(args, "--create-shortcut")
		isApp := containsArg(args, "--app") || containsArg(args, "-app")
		isIDE := containsArg(args, "--ide") || containsArg(args, "-ide")

		if isShortcut {
			if isIDE {
				if err := CreateChineseShortcut(AppIDE); err != nil {
					fmt.Printf("[错误] 创建快捷方式失败: %v\n", err)
				}
				return
			} else if isApp {
				if err := CreateChineseShortcut(AppNormal); err != nil {
					fmt.Printf("[错误] 创建快捷方式失败: %v\n", err)
				}
				return
			}
			// 未指定应用，默认两者都创建
			_ = CreateChineseShortcut(AppNormal)
			_ = CreateChineseShortcut(AppIDE)
			return
		}

		// 动态汉化参数
		if isIDE {
			Run(AppIDE, overlaySource, interactive)
			return
		} else if isApp {
			Run(AppNormal, overlaySource, interactive)
			return
		}

		// 传入了无效的参数，输出提示
		fmt.Println("未知的命令行参数。用法：")
		fmt.Println("  antigravity-hans --app             # 动态汉化 Antigravity")
		fmt.Println("  antigravity-hans --ide             # 动态汉化 Antigravity IDE")
		fmt.Println("  antigravity-hans --patch           # 静态补丁菜单")
		fmt.Println("  antigravity-hans --shortcut        # 生成两者的中文快捷方式/包装 App")
		fmt.Println("  antigravity-hans --shortcut --app  # 生成 Antigravity 中文快捷方式")
		fmt.Println("  antigravity-hans --shortcut --ide  # 生成 Antigravity IDE 中文快捷方式")
		fmt.Println("  antigravity-hans --stop            # 结束由本工具启动的汉化监视器")
		fmt.Println("  antigravity-hans --trust-external-overlay  # 跳过校验，强制加载同目录外部汉化脚本")
		return
	}

	// 交互式主菜单
	runMainMenu(overlaySource)
}

func runMainMenu(overlaySource string) {
	reader := bufio.NewReader(os.Stdin)

	// 启动时一次性检测中文语言包
	CheckAndPromptZhLangPack(reader)
	clearScreen()

	for {
		fmt.Print(getBanner())
		fmt.Println("Antigravity-Hans 启动器")
		fmt.Println("----------------------------------------")
		fmt.Println("1. 启动 Antigravity (动态汉化)")
		fmt.Println("2. 启动 Antigravity IDE (动态汉化)")
		fmt.Println("3. 静态补丁管理 (仅支持 IDE)")
		shortcutType := "桌面"
		if IsMac {
			shortcutType = "应用程序"
		}
		fmt.Printf("4. 生成%s快捷启动方式\n", shortcutType)
		fmt.Println("0. 退出")
		fmt.Println("----------------------------------------")
		fmt.Print("\n请选择 (0-4): ")

		line, _ := reader.ReadString('\n')
		choice := strings.TrimSpace(line)

		switch choice {
		case "1":
			fmt.Println("\n正在启动 Antigravity 动态汉化...")
			Run(AppNormal, overlaySource, true)
			pressEnterToContinue(reader)
		case "2":
			fmt.Println("\n正在启动 Antigravity IDE 动态汉化...")
			Run(AppIDE, overlaySource, true)
			pressEnterToContinue(reader)
		case "3":
			runPatchMenu(overlaySource)
			pressEnterToContinue(reader)
		case "4":
			fmt.Printf("\n请选择要创建%s快捷方式的目标：\n", shortcutType)
			fmt.Println(" [1] 全部生成 (默认)")
			fmt.Println(" [2] 仅 APP")
			fmt.Println(" [3] 仅 IDE")
			fmt.Print("\n请选择 (1-3, 直接回车默认为 1): ")

			subLine, _ := reader.ReadString('\n')
			subChoice := strings.TrimSpace(subLine)
			if subChoice == "" || subChoice == "1" {
				fmt.Println("\n正在生成快捷方式...")
				_ = CreateChineseShortcut(AppNormal)
				_ = CreateChineseShortcut(AppIDE)
			} else if subChoice == "2" {
				fmt.Println("\n正在生成 Antigravity 中文快捷方式...")
				if err := CreateChineseShortcut(AppNormal); err != nil {
					fmt.Printf("[错误] 生成失败: %v\n", err)
				}
			} else if subChoice == "3" {
				fmt.Println("\n正在生成 Antigravity IDE 中文快捷方式...")
				if err := CreateChineseShortcut(AppIDE); err != nil {
					fmt.Printf("[错误] 生成失败: %v\n", err)
				}
			} else {
				fmt.Println("[提示] 操作已取消。")
			}
			pressEnterToContinue(reader)
		case "0", "q", "Q", "exit":
			fmt.Println("\n感谢使用 Antigravity 汉化工具，再见！")
			os.Exit(0)
		default:
			if choice != "" {
				fmt.Println("\n[提示] 无效的选择，请重新输入。")
				pressEnterToContinue(reader)
			}
		}
		clearScreen()
	}
}

func runPatchMenu(overlaySource string) {
	reader := bufio.NewReader(os.Stdin)

	fmt.Println("\nAntigravity-Hans 静态补丁管理工具")
	fmt.Println("----------------------------------------")

	apps := GetInstalledIDEApps()
	if len(apps) == 0 {
		fmt.Println("[错误] 本机未检测到任何 Antigravity IDE 安装实例。")
		return
	}

	for _, app := range apps {
		fmt.Printf("检测到实例: %s\n", app.Name)
	}

	fmt.Println("\n请选择您要执行的操作：")
	fmt.Println(" 1. 注入静态汉化")
	fmt.Println(" 2. 还原官方状态")
	fmt.Println(" 0. 返回主菜单")
	fmt.Println("----------------------------------------")
	fmt.Print("请选择 (0-2): ")

	line, _ := reader.ReadString('\n')
	choice := strings.TrimSpace(line)
	if choice != "1" && choice != "2" {
		fmt.Println("[提示] 已返回主菜单。")
		return
	}

	// 选择目标实例
	var targetApps []PatchAppInstance
	if len(apps) == 1 {
		targetApps = apps
	} else {
		fmt.Printf("\n请选择要操作的应用实例：\n")
		for i, app := range apps {
			fmt.Printf(" [%d] %s\n", i+1, app.Name)
		}
		fmt.Printf(" [%d] 全部应用\n", len(apps)+1)
		fmt.Printf(" [%d] 取消\n", len(apps)+2)
		fmt.Printf("\n请选择 (1-%d): ", len(apps)+2)

		line, _ = reader.ReadString('\n')
		var appChoice int
		fmt.Sscan(strings.TrimSpace(line), &appChoice)

		if appChoice == len(apps)+2 || appChoice == 0 {
			fmt.Println("[提示] 操作已取消。")
			return
		} else if appChoice == len(apps)+1 {
			targetApps = apps
		} else if appChoice >= 1 && appChoice <= len(apps) {
			targetApps = []PatchAppInstance{apps[appChoice-1]}
		} else {
			fmt.Println("[提示] 无效的选择，操作已取消。")
			return
		}
	}

	// 执行对应操作
	for _, app := range targetApps {
		if choice == "1" {
			InstallPatch(app, overlaySource)
		} else {
			UninstallPatch(app)
		}
	}
}

func pressEnterToContinue(reader *bufio.Reader) {
	fmt.Print("\n按回车键返回主菜单...")
	reader.ReadString('\n')
}

func clearScreen() {
	fmt.Print("\033[H\033[2J")
}

func containsArg(args []string, s string) bool {
	for _, a := range args {
		if a == s {
			return true
		}
	}
	return false
}
