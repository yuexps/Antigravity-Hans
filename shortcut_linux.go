//go:build linux

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type linuxDesktopMetadata struct {
	Icon           string
	StartupWMClass string
}

type linuxShortcutOptions struct {
	SelfExe                 string
	HomeDir                 string
	DataHome                string
	ConfigHome              string
	DataDirs                []string
	PixmapDirs              []string
	InstallDirs             []string
	TrustCustomTranslations bool
}

// CreateChineseShortcut 在 Linux 应用菜单和桌面（若存在）生成动态汉化 .desktop 启动器
func CreateChineseShortcut(cfg AppConfig, trustCustomTranslations bool) error {
	selfExe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("无法获取当前程序路径: %v", err)
	}
	selfExeAbs, err := filepath.Abs(selfExe)
	if err != nil {
		selfExeAbs = selfExe
	}

	homeDir, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("无法获取用户主目录: %v", err)
	}

	opts := defaultLinuxShortcutOptions(cfg, selfExeAbs, homeDir, trustCustomTranslations)
	return createLinuxShortcut(cfg, opts)
}

func defaultLinuxShortcutOptions(cfg AppConfig, selfExe, homeDir string, trustCustomTranslations bool) linuxShortcutOptions {
	dataHome := resolveXDGDir(os.Getenv("XDG_DATA_HOME"), filepath.Join(homeDir, ".local", "share"))
	configHome := resolveXDGDir(os.Getenv("XDG_CONFIG_HOME"), filepath.Join(homeDir, ".config"))

	dataDirs := parseXDGDataDirs(os.Getenv("XDG_DATA_DIRS"))
	pixmapDirs := []string{"/usr/share/pixmaps", "/usr/local/share/pixmaps"}

	return linuxShortcutOptions{
		SelfExe:                 selfExe,
		HomeDir:                 homeDir,
		DataHome:                dataHome,
		ConfigHome:              configHome,
		DataDirs:                dataDirs,
		PixmapDirs:              pixmapDirs,
		InstallDirs:             collectLinuxInstallDirs(cfg),
		TrustCustomTranslations: trustCustomTranslations,
	}
}

func createLinuxShortcut(cfg AppConfig, opts linuxShortcutOptions) error {
	isIDE := isIDEAppConfig(cfg)
	desktopFileName := "antigravity-hans-app.desktop"
	displayName := "Antigravity 中文"
	comment := "Antigravity 中文启动器（动态汉化）"
	arg := "--app"
	defaultWMClass := "Antigravity"
	if isIDE {
		desktopFileName = "antigravity-hans-ide.desktop"
		displayName = "Antigravity IDE 中文"
		comment = "Antigravity IDE 中文启动器（动态汉化）"
		arg = "--ide"
		defaultWMClass = "Antigravity IDE"
	}

	origMeta := findOriginalDesktopMetadata(isIDE, opts.HomeDir, opts.DataHome, opts.DataDirs)
	wmClass := origMeta.StartupWMClass
	if wmClass == "" {
		wmClass = defaultWMClass
	}
	icon := detectLinuxIcon(isIDE, origMeta.Icon, opts.DataHome, opts.DataDirs, opts.PixmapDirs, opts.InstallDirs)

	content := buildLinuxDesktopEntry(displayName, comment, opts.SelfExe, arg, icon, wmClass, opts.TrustCustomTranslations)

	// 写入应用菜单目录：$XDG_DATA_HOME/applications/（通过 OpenRoot + 原子写入防符号链接覆盖）
	if err := os.MkdirAll(opts.DataHome, 0755); err != nil {
		return fmt.Errorf("创建应用菜单数据目录失败: %v", err)
	}
	dataRoot, err := os.OpenRoot(opts.DataHome)
	if err != nil {
		return fmt.Errorf("打开应用菜单数据目录失败: %v", err)
	}
	defer dataRoot.Close()

	appsRel := filepath.Join("applications", desktopFileName)
	if err := writeRootFileAtomic(dataRoot, appsRel, []byte(content), 0644); err != nil {
		return fmt.Errorf("写入应用菜单快捷方式失败: %v", err)
	}
	appsDesktopPath := filepath.Join(opts.DataHome, appsRel)
	fmt.Printf("[成功] 已在应用菜单创建快捷方式: %s\n", appsDesktopPath)

	// 若用户桌面目录已存在且不等于 $HOME 本身，额外写入 0755 副本以便双击启动
	desktopDir := detectLinuxDesktopDir(opts.HomeDir, opts.ConfigHome)
	if desktopDir != "" {
		desktopRoot, err := os.OpenRoot(desktopDir)
		if err != nil {
			return fmt.Errorf("打开桌面目录失败: %v", err)
		}
		defer desktopRoot.Close()

		if err := writeRootFileAtomic(desktopRoot, desktopFileName, []byte(content), 0755); err != nil {
			return fmt.Errorf("写入桌面快捷方式失败: %v", err)
		}
		fmt.Printf("[成功] 已在桌面创建快捷方式: %s\n", filepath.Join(desktopDir, desktopFileName))
	}

	return nil
}

func isIDEAppConfig(cfg AppConfig) bool {
	return strings.Contains(strings.ToLower(cfg.Name), "ide")
}

func resolveXDGDir(envVal, fallback string) string {
	if envVal != "" && filepath.IsAbs(envVal) {
		return filepath.Clean(envVal)
	}
	return filepath.Clean(fallback)
}

func parseXDGDataDirs(envVal string) []string {
	var dirs []string
	if envVal != "" {
		for _, part := range strings.Split(envVal, string(os.PathListSeparator)) {
			if part != "" && filepath.IsAbs(part) {
				cleaned := filepath.Clean(part)
				if !containsStr(dirs, cleaned) {
					dirs = append(dirs, cleaned)
				}
			}
		}
	}
	if len(dirs) == 0 {
		dirs = []string{"/usr/local/share", "/usr/share"}
	}
	return dirs
}

func collectLinuxInstallDirs(cfg AppConfig) []string {
	var dirs []string
	addExe := func(p string) {
		if p == "" {
			return
		}
		if realPath, err := filepath.EvalSymlinks(p); err == nil {
			p = realPath
		}
		dir := filepath.Clean(filepath.Dir(p))
		if dir != "" && dir != "." && !containsStr(dirs, dir) {
			dirs = append(dirs, dir)
		}
	}

	detected := DetectApp(cfg)
	addExe(detected.Path)
	for _, p := range detected.AllPaths {
		addExe(p)
	}
	for _, p := range cfg.PossiblePaths {
		addExe(p)
	}
	binName := "antigravity"
	if isIDEAppConfig(cfg) {
		binName = "antigravity-ide"
	}
	if lookedUp, err := exec.LookPath(binName); err == nil {
		addExe(lookedUp)
	}
	return dirs
}

func findOriginalDesktopMetadata(isIDE bool, homeDir, dataHome string, dataDirs []string) linuxDesktopMetadata {
	var appDirs []string
	addAppDir := func(d string) {
		if d == "" {
			return
		}
		cleaned := filepath.Clean(d)
		if !containsStr(appDirs, cleaned) {
			appDirs = append(appDirs, cleaned)
		}
	}

	addAppDir(filepath.Join(dataHome, "applications"))
	for _, d := range dataDirs {
		addAppDir(filepath.Join(d, "applications"))
	}
	addAppDir("/usr/local/share/applications")
	addAppDir("/usr/share/applications")
	addAppDir(filepath.Join(homeDir, ".local", "share", "flatpak", "exports", "share", "applications"))
	addAppDir("/var/lib/flatpak/exports/share/applications")
	addAppDir("/var/lib/snapd/desktop/applications")

	candidates := []string{"antigravity.desktop", "Antigravity.desktop"}
	if isIDE {
		candidates = []string{"antigravity-ide.desktop", "antigravity_ide.desktop", "Antigravity IDE.desktop"}
	}

	var result linuxDesktopMetadata
	for _, dir := range appDirs {
		for _, name := range candidates {
			meta, ok := parseDesktopEntryFile(filepath.Join(dir, name))
			if !ok {
				continue
			}
			if result.Icon == "" && meta.Icon != "" {
				result.Icon = meta.Icon
			}
			if result.StartupWMClass == "" && meta.StartupWMClass != "" {
				result.StartupWMClass = meta.StartupWMClass
			}
			if result.Icon != "" && result.StartupWMClass != "" {
				return result
			}
		}
	}
	return result
}

func parseDesktopEntryFile(path string) (linuxDesktopMetadata, bool) {
	info, err := os.Stat(path)
	if err != nil || !info.Mode().IsRegular() || info.Size() > 256<<10 {
		return linuxDesktopMetadata{}, false
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return linuxDesktopMetadata{}, false
	}

	var meta linuxDesktopMetadata
	inDesktopEntry := false
	for _, rawLine := range strings.Split(string(data), "\n") {
		line := strings.TrimSpace(strings.TrimSuffix(rawLine, "\r"))
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
			inDesktopEntry = (line == "[Desktop Entry]")
			continue
		}
		if !inDesktopEntry {
			continue
		}
		k, v, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key := strings.TrimSpace(k)
		val := sanitizeDesktopSingleLineValue(strings.TrimSpace(v))
		switch key {
		case "Icon":
			if meta.Icon == "" {
				meta.Icon = val
			}
		case "StartupWMClass":
			if meta.StartupWMClass == "" {
				meta.StartupWMClass = val
			}
		}
	}
	return meta, true
}

func sanitizeDesktopSingleLineValue(s string) string {
	if s == "" || strings.ContainsAny(s, "\r\n\x00") {
		return ""
	}
	return s
}

func detectLinuxIcon(isIDE bool, origIcon, dataHome string, dataDirs, pixmapDirs, installDirs []string) string {
	iconNames := []string{"antigravity"}
	if isIDE {
		iconNames = []string{"antigravity-ide"}
	}

	// 1. 优先查找系统图标目录（如 /usr/share/pixmaps/antigravity.png）
	for _, pixDir := range pixmapDirs {
		for _, base := range iconNames {
			for _, ext := range []string{".png", ".svg"} {
				p := filepath.Join(pixDir, base+ext)
				if isExistingRegularFile(p) {
					return p
				}
			}
		}
	}

	var iconBases []string
	if dataHome != "" {
		iconBases = append(iconBases, filepath.Join(dataHome, "icons", "hicolor"))
	}
	for _, d := range dataDirs {
		iconBases = append(iconBases, filepath.Join(d, "icons", "hicolor"))
	}
	for _, hicolor := range iconBases {
		for _, sizeDir := range []string{"512x512", "256x256", "128x128", "scalable"} {
			for _, base := range iconNames {
				for _, ext := range []string{".png", ".svg"} {
					p := filepath.Join(hicolor, sizeDir, "apps", base+ext)
					if isExistingRegularFile(p) {
						return p
					}
				}
			}
		}
	}

	// 2. 其次复用原版 .desktop 中的 Icon= 值
	if origIcon != "" {
		if !filepath.IsAbs(origIcon) || isExistingRegularFile(origIcon) {
			return origIcon
		}
	}

	// 3. 再次查找应用安装目录下的图标文件
	for _, dir := range installDirs {
		for _, rel := range []string{
			filepath.Join("resources", "app", "resources", "linux", "code.png"),
			filepath.Join("resources", "app", "icon.png"),
			filepath.Join("resources", "icon.png"),
			"icon.png",
		} {
			p := filepath.Join(dir, rel)
			if isExistingRegularFile(p) {
				return p
			}
		}
	}

	// 4. 最终回退到图标主题名 antigravity
	return "antigravity"
}

func isExistingRegularFile(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.Mode().IsRegular()
}

// detectLinuxDesktopDir 解析 user-dirs.dirs 中的 XDG_DESKTOP_DIR；仅当目录已存在且不等于 $HOME 时返回。
func detectLinuxDesktopDir(homeDir, configHome string) string {
	homeClean := filepath.Clean(homeDir)
	userDirsPath := filepath.Join(configHome, "user-dirs.dirs")

	if desktopDir, configured := parseUserDirsDesktopDir(userDirsPath, homeClean); configured {
		if isUsableDesktopDir(desktopDir, homeClean) {
			return desktopDir
		}
		return ""
	}

	for _, fallback := range []string{
		filepath.Join(homeClean, "Desktop"),
		filepath.Join(homeClean, "桌面"),
	} {
		if isUsableDesktopDir(fallback, homeClean) {
			return fallback
		}
	}
	return ""
}

func parseUserDirsDesktopDir(userDirsPath, homeDir string) (string, bool) {
	info, err := os.Stat(userDirsPath)
	if err != nil || !info.Mode().IsRegular() || info.Size() > 256<<10 {
		return "", false
	}
	data, err := os.ReadFile(userDirsPath)
	if err != nil {
		return "", false
	}

	var foundVal string
	found := false
	for _, rawLine := range strings.Split(string(data), "\n") {
		line := strings.TrimSpace(strings.TrimSuffix(rawLine, "\r"))
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimSpace(strings.TrimPrefix(line, "export "))
		k, v, ok := strings.Cut(line, "=")
		if !ok || strings.TrimSpace(k) != "XDG_DESKTOP_DIR" {
			continue
		}
		found = true
		foundVal = unquoteUserDirValue(strings.TrimSpace(v))
	}
	if !found {
		return "", false
	}
	if foundVal == "" {
		return "", true
	}

	expanded := expandHomePlaceholder(foundVal, homeDir)
	if !filepath.IsAbs(expanded) {
		expanded = filepath.Join(homeDir, expanded)
	}
	return filepath.Clean(expanded), true
}

func unquoteUserDirValue(v string) string {
	if len(v) >= 2 && ((v[0] == '"' && v[len(v)-1] == '"') || (v[0] == '\'' && v[len(v)-1] == '\'')) {
		quote := v[0]
		inner := v[1 : len(v)-1]
		if quote == '"' {
			// 处理 user-dirs.dirs 双引号内常见反斜杠转义
			var b strings.Builder
			for i := 0; i < len(inner); i++ {
				if inner[i] == '\\' && i+1 < len(inner) {
					next := inner[i+1]
					if next == '"' || next == '\\' || next == '$' || next == '`' {
						b.WriteByte(next)
						i++
						continue
					}
				}
				b.WriteByte(inner[i])
			}
			return b.String()
		}
		return inner
	}
	return v
}

func expandHomePlaceholder(val, homeDir string) string {
	if val == "$HOME" || val == "${HOME}" {
		return homeDir
	}
	if strings.HasPrefix(val, "$HOME/") {
		return filepath.Join(homeDir, strings.TrimPrefix(val, "$HOME/"))
	}
	if strings.HasPrefix(val, "${HOME}/") {
		return filepath.Join(homeDir, strings.TrimPrefix(val, "${HOME}/"))
	}
	if strings.HasPrefix(val, "~/") {
		return filepath.Join(homeDir, strings.TrimPrefix(val, "~/"))
	}
	return val
}

func isUsableDesktopDir(dir, homeDir string) bool {
	if dir == "" {
		return false
	}
	cleanDir := filepath.Clean(dir)
	cleanHome := filepath.Clean(homeDir)
	if cleanDir == cleanHome {
		return false
	}
	info, err := os.Stat(cleanDir)
	if err != nil || !info.IsDir() {
		return false
	}
	realDir, errDir := filepath.EvalSymlinks(cleanDir)
	realHome, errHome := filepath.EvalSymlinks(cleanHome)
	if errDir == nil && errHome == nil && realDir == realHome {
		return false
	}
	return true
}

func buildLinuxDesktopEntry(name, comment, selfExe, arg, icon, wmClass string, trustCustomTranslations bool) string {
	execCmd := buildLinuxExecCommand(selfExe, arg, trustCustomTranslations)
	return fmt.Sprintf(`[Desktop Entry]
Type=Application
Version=1.0
Name=%s
Comment=%s
Exec=%s
Icon=%s
Terminal=false
Categories=Development;
StartupNotify=false
StartupWMClass=%s
`, escapeDesktopString(name), escapeDesktopString(comment), execCmd, escapeDesktopString(icon), escapeDesktopString(wmClass))
}

// buildLinuxExecCommand 生成符合 FreeDesktop Exec 与 POSIX shell 规范的后台启动命令，
// 日志写入 $XDG_STATE_HOME/antigravity-hans/antigravity-hans.log（默认 ~/.local/state/antigravity-hans/antigravity-hans.log）。
func buildLinuxExecCommand(selfExe, arg string, trustCustomTranslations bool) string {
	args := []string{shellQuote(selfExe), shellQuote(arg), "--nogui"}
	if trustCustomTranslations {
		args = append(args, trustCustomTranslationsArg)
	}
	shCmd := fmt.Sprintf(
		`STATE_HOME="${XDG_STATE_HOME:-$HOME/.local/state}"; LOG_DIR="$STATE_HOME/antigravity-hans"; mkdir -p "$LOG_DIR" && nohup %s >> "$LOG_DIR/antigravity-hans.log" 2>&1 </dev/null &`,
		strings.Join(args, " "),
	)
	return "/bin/sh -c " + desktopExecQuote(shCmd)
}

// desktopExecQuote 先按 Desktop Entry Exec 规则用双引号包裹并转义（"、$、`、\、%），
// 再按 KeyFile string 值规则转义反斜杠与控制空白，确保启动器解析两遍后还原出原始参数。
func desktopExecQuote(s string) string {
	var execToken strings.Builder
	execToken.Grow(len(s) + 8)
	execToken.WriteByte('"')
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch c {
		case '\\', '"', '$', '`':
			execToken.WriteByte('\\')
			execToken.WriteByte(c)
		case '%':
			execToken.WriteString("%%")
		default:
			execToken.WriteByte(c)
		}
	}
	execToken.WriteByte('"')
	return escapeDesktopString(execToken.String())
}

func escapeDesktopString(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for i := 0; i < len(s); i++ {
		switch s[i] {
		case '\\':
			b.WriteString(`\\`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		default:
			b.WriteByte(s[i])
		}
	}
	return b.String()
}
