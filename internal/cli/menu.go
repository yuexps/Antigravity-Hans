package cli

import (
	"bufio"
	"fmt"
	"os"
	"runtime"
	"strings"

	"antigravity-hans/internal/app"
	"antigravity-hans/internal/cdp"
	"antigravity-hans/internal/patch"
	"antigravity-hans/internal/shortcut"
)

func getBanner(version string) string {
	return `
  ___        _   _                     _ _          _   _
 / _ \      | | (_)                   (_) |        | | | |
/ /_\ \_ __ | |_ _  __ _ _ __ __ ___   _| |_ _   _| |_| | __ _ _ __  ___
|  _  | '_ \| __| |/ _  | '__/ _  \ \ / / | __| | | |  _  |/ _  | '_ \/ __|
| | | | | | | |_| | (_| | | | (_| |\ V /| | |_| |_| | | | | (_| | | | \__ \
\_| |_/_| |_|\__|_|\__, |_|  \__,_| \_/ |_|\__|\__, \_/ |_|\__,_|_| |_|___/
                    __/ |                        __/ |
                   |___/                        |___/  汉化工具 ` + version + `
`
}

// RunMainMenu 启动交互式主菜单。
func RunMainMenu(version, overlaySource string, trustCustom bool) {
	reader := bufio.NewReader(os.Stdin)

	patch.CheckAndPromptZhLangPack(reader)
	clearScreen()

	for {
		fmt.Print(getBanner(version))
		fmt.Println("Antigravity-Hans 启动器")
		fmt.Println("----------------------------------------")
		fmt.Println("1. 启动 Antigravity (动态汉化)")
		fmt.Println("2. 启动 Antigravity IDE (动态汉化)")
		fmt.Println("3. 静态补丁管理 (仅支持 IDE)")
		shortcutType := shortcutTypeLabelForOS(runtime.GOOS)
		fmt.Printf("4. 生成%s快捷启动方式\n", shortcutType)
		lastChoice := 4
		if app.IsWindows {
			fmt.Println("5. 启动 Antigravity (动态汉化，自动代理)")
			fmt.Println("6. 启动 Antigravity IDE (动态汉化，自动代理)")
			lastChoice = 6
		}
		fmt.Println("M. 管理汉化")
		fmt.Println("0. 退出")
		fmt.Println("----------------------------------------")
		fmt.Printf("\n请选择 (0-%d / M): ", lastChoice)

		line, err := reader.ReadString('\n')
		if err != nil {
			return
		}
		choice := strings.TrimSpace(line)

		switch choice {
		case "1", "2", "5", "6":
			cfg := app.DefaultNormal()
			if choice == "2" || choice == "6" {
				cfg = app.DefaultIDE()
			}
			withProxy := choice == "5" || choice == "6"
			if withProxy && !app.IsWindows {
				fmt.Println("[错误] 自动代理启动仅支持 Windows。")
			} else {
				fmt.Printf("\n正在启动 %s 动态汉化...\n", cfg.Name)
				cdp.Run(cfg, overlaySource, cdp.RunOptions{Interactive: true, WithProxy: withProxy}, reader)
			}
			pressEnterToContinue(reader)
		case "3":
			RunPatchMenu(overlaySource)
			pressEnterToContinue(reader)
		case "4":
			runShortcutMenu(reader, shortcutType, trustCustom)
			pressEnterToContinue(reader)
		case "m", "M":
			runHansManagementMenu(reader, version)
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

func runShortcutMenu(reader *bufio.Reader, shortcutType string, trustCustom bool) {
	fmt.Printf("\n请选择要创建%s快捷方式的目标：\n", shortcutType)
	fmt.Println(" [1] 全部生成 (默认)")
	fmt.Println(" [2] 仅 APP")
	fmt.Println(" [3] 仅 IDE")
	lastChoice := 3
	if app.IsWindows {
		fmt.Println(" [4] 仅 APP（自动代理）")
		fmt.Println(" [5] 仅 IDE（自动代理）")
		lastChoice = 5
	}
	fmt.Printf("\n请选择 (1-%d, 直接回车默认为 1): ", lastChoice)

	subLine, _ := reader.ReadString('\n')
	subChoice := strings.TrimSpace(subLine)
	options := shortcut.Options{TrustCustomTranslations: trustCustom}
	var targets []app.Config
	switch subChoice {
	case "", "1":
		targets = []app.Config{app.DefaultNormal(), app.DefaultIDE()}
	case "2", "4":
		targets = []app.Config{app.DefaultNormal()}
		options.WithProxy = subChoice == "4"
	case "3", "5":
		targets = []app.Config{app.DefaultIDE()}
		options.WithProxy = subChoice == "5"
	default:
		fmt.Println("[提示] 操作已取消。")
	}
	for _, cfg := range targets {
		fmt.Printf("\n正在生成 %s 中文快捷方式...\n", cfg.Name)
		if err := shortcut.Create(cfg, options); err != nil {
			fmt.Printf("[错误] 生成失败: %v\n", err)
		}
	}
}

// RunPatchMenu 启动静态补丁交互管理菜单。
func RunPatchMenu(overlaySource string) {
	reader := bufio.NewReader(os.Stdin)

	fmt.Println("\nAntigravity-Hans 静态补丁管理工具")
	fmt.Println("----------------------------------------")

	ideCfg := app.DefaultIDE()
	apps := patch.GetInstalledIDEApps(ideCfg)
	if len(apps) == 0 {
		fmt.Println("[错误] 本机未检测到任何 Antigravity IDE 安装实例。")
		return
	}

	for _, inst := range apps {
		fmt.Printf("检测到实例: %s\n", inst.Name)
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

	targetApps := selectPatchTargets(reader, apps)
	for _, inst := range targetApps {
		if choice == "1" {
			patch.Install(ideCfg, inst, overlaySource)
		} else {
			patch.Uninstall(ideCfg, inst)
		}
	}
}

func selectPatchTargets(reader *bufio.Reader, apps []patch.AppInstance) []patch.AppInstance {
	if len(apps) == 1 {
		return apps
	}
	fmt.Printf("\n请选择要操作的应用实例：\n")
	for i, inst := range apps {
		fmt.Printf(" [%d] %s\n", i+1, inst.Name)
	}
	fmt.Printf(" [%d] 全部应用\n", len(apps)+1)
	fmt.Printf(" [%d] 取消\n", len(apps)+2)
	fmt.Printf("\n请选择 (1-%d): ", len(apps)+2)

	line, _ := reader.ReadString('\n')
	var appChoice int
	fmt.Sscan(strings.TrimSpace(line), &appChoice)

	switch {
	case appChoice == len(apps)+2 || appChoice == 0:
		fmt.Println("[提示] 操作已取消。")
		return nil
	case appChoice == len(apps)+1:
		return apps
	case appChoice >= 1 && appChoice <= len(apps):
		return []patch.AppInstance{apps[appChoice-1]}
	default:
		fmt.Println("[提示] 无效的选择，操作已取消。")
		return nil
	}
}

func pressEnterToContinue(reader *bufio.Reader) {
	fmt.Println()
	fmt.Print("==> 按回车键返回主菜单...")
	reader.ReadString('\n')
}

func clearScreen() {
	fmt.Print("\033[H\033[2J")
}

func shortcutTypeLabelForOS(goos string) string {
	switch goos {
	case "darwin":
		return "应用程序"
	case "linux":
		return "桌面/应用菜单"
	default:
		return "桌面"
	}
}
