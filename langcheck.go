package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
)

const zhLangPackID = "ms-ceintl.vscode-language-pack-zh-hans"

// getIDEArgvPaths 获取所有可能的 argv.json 路径（按优先级排列）
// macOS 上 GUI 应用使用 ~/Library/Application Support/Antigravity IDE/
// CLI 工具使用 ~/.antigravity-ide/
// 两个文件都需要写入，以保证 GUI 和 CLI 都能生效
func getIDEArgvPaths() []string {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return nil
	}

	if IsMac {
		return []string{
			filepath.Join(homeDir, "Library", "Application Support", "Antigravity IDE", "argv.json"),
			filepath.Join(homeDir, ".antigravity-ide", "argv.json"),
		}
	}
	if IsWindows {
		appData := os.Getenv("APPDATA")
		if appData != "" {
			return []string{
				filepath.Join(appData, "Antigravity IDE", "argv.json"),
				filepath.Join(homeDir, ".antigravity-ide", "argv.json"),
			}
		}
	}
	if runtime.GOOS == "linux" {
		configHome := os.Getenv("XDG_CONFIG_HOME")
		if configHome == "" || !filepath.IsAbs(configHome) {
			configHome = filepath.Join(homeDir, ".config")
		}
		return []string{
			filepath.Join(configHome, "Antigravity IDE", "argv.json"),
			filepath.Join(homeDir, ".antigravity-ide", "argv.json"),
		}
	}
	return []string{
		filepath.Join(homeDir, ".antigravity-ide", "argv.json"),
	}
}

// getIDEExtensionsDirs 返回 Antigravity IDE 所有可能的 extensions 目录
func getIDEExtensionsDirs() []string {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return nil
	}

	dirs := []string{
		filepath.Join(homeDir, ".antigravity-ide", "extensions"),
	}

	if IsWindows {
		appData := os.Getenv("APPDATA")
		if appData != "" {
			dirs = append(dirs,
				filepath.Join(appData, "Antigravity IDE", "User", "extensions"),
				filepath.Join(appData, "Antigravity IDE", "extensions"),
			)
		}
	} else if runtime.GOOS == "linux" {
		configHome := os.Getenv("XDG_CONFIG_HOME")
		if configHome == "" || !filepath.IsAbs(configHome) {
			configHome = filepath.Join(homeDir, ".config")
		}
		for _, candidate := range []string{
			filepath.Join(configHome, "Antigravity IDE", "User", "extensions"),
			filepath.Join(configHome, "Antigravity IDE", "extensions"),
			filepath.Join(homeDir, ".config", "Antigravity IDE", "extensions"),
		} {
			if !containsStr(dirs, candidate) {
				dirs = append(dirs, candidate)
			}
		}
	}

	return dirs
}

// IsZhLangPackInstalled 检测中文语言包是否已安装
// 检查 extensions 目录下是否存在以 zhLangPackID 开头的文件夹
func IsZhLangPackInstalled() bool {
	for _, dir := range getIDEExtensionsDirs() {
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if !e.IsDir() {
				continue
			}
			name := strings.ToLower(e.Name())
			if strings.HasPrefix(name, strings.ToLower(zhLangPackID)) {
				return true
			}
		}
	}
	return false
}

// getIDELocale 读取 argv.json 中的 locale 值
// 从优先级最高的（GUI 使用的）argv.json 读取
func getIDELocale() string {
	for _, argvPath := range getIDEArgvPaths() {
		data, err := os.ReadFile(argvPath)
		if err != nil {
			continue
		}
		// argv.json 含有 // 注释，需要先去除注释再解析
		cleaned := removeJSONComments(data)
		var obj map[string]interface{}
		if err := json.Unmarshal(cleaned, &obj); err != nil {
			continue
		}
		if v, ok := obj["locale"].(string); ok {
			return v
		}
	}
	return ""
}

// setIDELocale 将所有 argv.json 中的 locale 设置为指定值
// 同时写入 GUI（~/Library/Application Support/Antigravity IDE/）和 CLI（~/.antigravity-ide/）两处
// 使用正则直接替换字段，保留文件原有注释和格式
func setIDELocale(locale string) error {
	paths := getIDEArgvPaths()
	if len(paths) == 0 {
		return fmt.Errorf("无法确定 argv.json 路径")
	}

	re := regexp.MustCompile(`(?m)^([^/\n]*)"locale"\s*:\s*"[^"]*"`)
	replaceField := fmt.Sprintf(`$1"locale": "%s"`, locale)
	initialField := fmt.Sprintf(`"locale": "%s"`, locale)

	var lastErr error
	written := 0

	for _, argvPath := range paths {
		data, err := os.ReadFile(argvPath)
		if err != nil {
			if os.IsNotExist(err) {
				// 自动创建父级目录
				dir := filepath.Dir(argvPath)
				if err := os.MkdirAll(dir, 0755); err != nil {
					lastErr = fmt.Errorf("创建目录 %s 失败: %v", dir, err)
					continue
				}
				// 写入初始的 json 配置
				initialContent := fmt.Sprintf("{\n\t%s\n}\n", initialField)
				if err := os.WriteFile(argvPath, []byte(initialContent), 0644); err != nil {
					lastErr = fmt.Errorf("创建并写入 %s 失败: %v", argvPath, err)
					continue
				}
				written++
				continue
			}
			continue
		}

		content := string(data)

		// 替换已有的 locale 字段
		if re.MatchString(content) {
			content = re.ReplaceAllString(content, replaceField)
		} else {
			// 没有 locale 字段，插入到最后一个 } 前
			lastBrace := strings.LastIndex(content, "}")
			if lastBrace == -1 {
				lastErr = fmt.Errorf("%s 格式异常，未找到 '}'", argvPath)
				continue
			}
			before := strings.TrimRight(content[:lastBrace], " \t\n")
			if !strings.HasSuffix(before, ",") && !strings.HasSuffix(before, "{") {
				before += ","
			}
			content = before + "\n\t" + initialField + "\n" + content[lastBrace:]
		}

		if err := os.WriteFile(argvPath, []byte(content), 0644); err != nil {
			lastErr = fmt.Errorf("写入 %s 失败: %v", argvPath, err)
			continue
		}
		written++
	}

	if written == 0 {
		if lastErr != nil {
			return lastErr
		}
		return fmt.Errorf("未找到任何可写的 argv.json 文件")
	}
	return nil
}

// removeJSONComments 去除 JSON 中的 // 行注释，用于解析 argv.json
func removeJSONComments(data []byte) []byte {
	re := regexp.MustCompile(`(?m)^\s*//.*$`)
	return re.ReplaceAll(data, []byte(""))
}

// isZhLocale 判断 locale 值是否为中文
func isZhLocale(locale string) bool {
	l := strings.ToLower(locale)
	return l == "zh-cn" || l == "zh-hans" || l == "zh_cn" || l == "zh"
}

// getIDECLIPath 获取 Antigravity IDE CLI 可执行文件路径
func getIDECLIPath() string {
	homeDir, _ := os.UserHomeDir()

	var candidates []string

	if IsMac {
		candidates = []string{
			"/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide",
			filepath.Join(homeDir, "Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide"),
		}
	} else if IsWindows {
		localAppData := os.Getenv("LOCALAPPDATA")
		programFiles := os.Getenv("ProgramFiles")
		candidates = []string{
			filepath.Join(localAppData, "Programs/Antigravity IDE/bin/antigravity-ide.cmd"),
			filepath.Join(programFiles, "Antigravity IDE/bin/antigravity-ide.cmd"),
		}
	} else if runtime.GOOS == "linux" {
		candidates = []string{
			"/usr/bin/antigravity-ide",
			"/usr/local/bin/antigravity-ide",
			"/opt/Antigravity IDE/bin/antigravity-ide",
			"/opt/antigravity-ide/bin/antigravity-ide",
			"/usr/share/antigravity-ide/bin/antigravity-ide",
		}
		if lookedUp, err := exec.LookPath("antigravity-ide"); err == nil && lookedUp != "" {
			if !containsStr(candidates, lookedUp) {
				candidates = append(candidates, lookedUp)
			}
		}
	} else {
		candidates = []string{
			"/usr/bin/antigravity-ide",
			"/usr/local/bin/antigravity-ide",
		}
	}

	for _, p := range candidates {
		if info, err := os.Stat(p); err == nil && !info.IsDir() {
			return p
		}
	}
	return ""
}

// CheckAndPromptZhLangPack 检测中文语言包及 locale 设置，必要时引导用户安装/启用
func CheckAndPromptZhLangPack(reader *bufio.Reader) {
	packInstalled := IsZhLangPackInstalled()
	locale := getIDELocale()
	localeIsZh := isZhLocale(locale)

	// 两者都 OK，静默跳过
	if packInstalled && localeIsZh {
		return
	}

	fmt.Println()
	fmt.Println("╔══════════════════════════════════════════════════════╗")
	fmt.Println("║            【IDE 官方中文语言包检测】                ║")
	fmt.Println("╚══════════════════════════════════════════════════════╝")
	fmt.Println()

	if !packInstalled {
		fmt.Printf("  [未配置] 未检测到官方中文语言包 (%s)\n", zhLangPackID)
	} else {
		fmt.Println("  [成功] 官方中文语言包已安装")
	}
	if !localeIsZh {
		currentLocale := locale
		if currentLocale == "" {
			currentLocale = "(未设置)"
		}
		fmt.Printf("  [未配置] 界面语言未设置为中文 (当前: %s)\n", currentLocale)
	} else {
		fmt.Println("  [成功] 界面语言已设置为中文")
	}

	fmt.Println()
	fmt.Println("  安装语言包后，IDE 菜单栏与核心界面将切换为中文。")
	fmt.Println("  与本工具动态汉化搭配使用，覆盖效果更完整。")
	fmt.Println()

	cliPath := getIDECLIPath()
	if cliPath != "" {
		fmt.Println("  检测到 IDE 命令行工具，可一键自动完成配置。")
		fmt.Print("\n  是否立即自动配置？[Y/n]: ")
		line, _ := reader.ReadString('\n')
		answer := strings.TrimSpace(strings.ToLower(line))

		if answer == "" || answer == "y" || answer == "yes" {
			success := true
			if !packInstalled {
				success = installZhLangPackCLI(cliPath)
			}
			if success {
				applyZhLocale()
			}
		} else {
			fmt.Println("\n  [提示] 您可以稍后手动安装语言包并配置语言。")
		}
	} else {
		printManualInstallGuide()
	}

	fmt.Println()
	fmt.Print("按回车键继续...")
	reader.ReadString('\n')
	fmt.Println()
}

// installZhLangPackCLI 通过 CLI 自动安装中文语言包，返回是否成功
func installZhLangPackCLI(cliPath string) bool {
	fmt.Printf("\n  正在安装 %s...\n", zhLangPackID)
	fmt.Println("  (可能需要几秒钟，请稍候)")

	cmd := exec.Command(cliPath, "--install-extension", zhLangPackID)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Run(); err != nil {
		fmt.Printf("\n  [错误] 自动安装失败: %v\n", err)
		fmt.Println()
		printManualInstallGuide()
		return false
	}

	fmt.Println()
	fmt.Println("  [成功] 中文语言包安装成功！")
	return true
}

// applyZhLocale 将 argv.json 中的 locale 设置为 zh-cn
func applyZhLocale() {
	fmt.Println("  正在设置界面语言为中文 (zh-cn)...")
	if err := setIDELocale("zh-cn"); err != nil {
		fmt.Printf("  [错误] 设置语言失败: %v\n", err)
		fmt.Println("  请手动在 IDE 中按 Ctrl+Shift+P，搜索「Configure Display Language」进行设置。")
		return
	}
	fmt.Println("  [成功] 界面语言已设置为中文！")
	fmt.Println()
	if IsMac {
		fmt.Println("  [提示] 请完全退出并重启 Antigravity IDE 以生效（可能需要重启 1-2 次刷新语言缓存）：")
		fmt.Println("     macOS: 菜单栏 → Antigravity IDE → 退出 (Cmd+Q)")
		fmt.Println("     注意：仅关闭窗口不会退出应用，必须 Cmd+Q 完全退出！")
	} else {
		fmt.Println("  [提示] 请完全关闭并重启 Antigravity IDE 以生效。")
		fmt.Println("     (由于 IDE 内部缓存机制，可能需要重新打开 1-2 次)")
	}
}

// printManualInstallGuide 打印手动安装指引
func printManualInstallGuide() {
	fmt.Println()
	fmt.Println("  ── 手动配置步骤 ──────────────────────────────────")
	fmt.Println("  1. 打开 Antigravity IDE")
	fmt.Println("  2. 按 Ctrl+Shift+X (macOS: Cmd+Shift+X) 打开扩展市场")
	fmt.Println("  3. 搜索框输入: Chinese，安装「Chinese (Simplified)...」")
	fmt.Println("  4. 按 Ctrl+Shift+P，搜索「Configure Display Language」")
	fmt.Println("  5. 选择「中文(简体)」并重启 IDE")
	fmt.Println("  ────────────────────────────────────────────────")
}
