package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
)

const (
	linuxEnvAppPath = "AGY_HANS_APP_PATH"
	linuxEnvIDEPath = "AGY_HANS_IDE_PATH"
)

type linuxAppKind int

const (
	linuxAppUnknown linuxAppKind = iota
	linuxAppNormal
	linuxAppIDE
)

type linuxDiscoveryEnv struct {
	HomeDir     string
	EnvAppPath  string
	EnvIDEPath  string
	XDGDataHome string
	XDGDataDirs string
	LookPath    func(string) (string, error)
	DesktopDirs []string
	RootPrefix  string
}

func defaultLinuxDiscoveryEnv() linuxDiscoveryEnv {
	homeDir, _ := os.UserHomeDir()
	return linuxDiscoveryEnv{
		HomeDir:     homeDir,
		EnvAppPath:  os.Getenv(linuxEnvAppPath),
		EnvIDEPath:  os.Getenv(linuxEnvIDEPath),
		XDGDataHome: os.Getenv("XDG_DATA_HOME"),
		XDGDataDirs: os.Getenv("XDG_DATA_DIRS"),
		LookPath:    exec.LookPath,
	}
}

func isTargetIDE(cfg AppConfig) bool {
	return strings.Contains(strings.ToLower(cfg.Name), "ide") ||
		strings.Contains(strings.ToLower(cfg.Exe), "ide")
}

func isAntigravityConfig(cfg AppConfig) bool {
	return strings.Contains(strings.ToLower(cfg.Name), "antigravity")
}

// classifyLinuxInstallDir 根据安装目录下的 resources 结构区分 2.x 普通版与 1.x IDE 架构：
// - 存在 resources/app/out/vs/code/electron-browser/workbench 或 resources/app/product.json -> IDE 架构
// - 仅存在 resources/app.asar -> 2.x 普通版架构
func classifyLinuxInstallDir(dir string) linuxAppKind {
	if dir == "" {
		return linuxAppUnknown
	}
	workbenchDir := filepath.Join(dir, "resources", "app", "out", "vs", "code", "electron-browser", "workbench")
	if info, err := os.Stat(workbenchDir); err == nil && info.IsDir() {
		return linuxAppIDE
	}
	productJSON := filepath.Join(dir, "resources", "app", "product.json")
	if info, err := os.Stat(productJSON); err == nil && info.Mode().IsRegular() {
		return linuxAppIDE
	}
	appAsar := filepath.Join(dir, "resources", "app.asar")
	if info, err := os.Stat(appAsar); err == nil && info.Mode().IsRegular() {
		return linuxAppNormal
	}
	return linuxAppUnknown
}

// isLinuxAppImageFilename 判断文件名是否为匹配的 Antigravity / Antigravity IDE AppImage
func isLinuxAppImageFilename(base string, isIDE bool) bool {
	lower := strings.ToLower(strings.TrimSpace(base))
	if !strings.HasSuffix(lower, ".appimage") {
		return false
	}
	stem := strings.TrimSuffix(lower, ".appimage")
	if stem != "antigravity" &&
		!strings.HasPrefix(stem, "antigravity-") &&
		!strings.HasPrefix(stem, "antigravity_") &&
		!strings.HasPrefix(stem, "antigravity.") &&
		!strings.HasPrefix(stem, "antigravity ") {
		return false
	}
	hasIDE := strings.Contains(stem, "ide")
	return hasIDE == isIDE
}

func discoverLinuxNormalPaths() []string {
	return discoverLinuxPathsWith(false, defaultLinuxDiscoveryEnv())
}

func discoverLinuxIDEPaths() []string {
	return discoverLinuxPathsWith(true, defaultLinuxDiscoveryEnv())
}

func discoverLinuxPathsWith(isIDE bool, env linuxDiscoveryEnv) []string {
	var found []string
	seen := make(map[string]bool)

	addCandidate := func(raw string, fromEnv bool) {
		for _, resolved := range resolveLinuxCandidate(raw, isIDE, env.HomeDir, fromEnv) {
			if !seen[resolved] {
				seen[resolved] = true
				found = append(found, resolved)
			}
		}
	}

	// 1. 环境变量覆盖优先
	if isIDE {
		if strings.TrimSpace(env.EnvIDEPath) != "" {
			addCandidate(env.EnvIDEPath, true)
		}
	} else {
		if strings.TrimSpace(env.EnvAppPath) != "" {
			addCandidate(env.EnvAppPath, true)
		}
	}

	// 2. PATH 动态探测（exec.LookPath）
	if env.LookPath != nil {
		if isIDE {
			if p, err := env.LookPath("antigravity-ide"); err == nil {
				addCandidate(p, false)
			}
			// 兼容旧版 1.x IDE 安装在 /usr/share/antigravity/antigravity 的同名场景
			if p, err := env.LookPath("antigravity"); err == nil {
				addCandidate(p, false)
			}
		} else {
			if p, err := env.LookPath("antigravity"); err == nil {
				addCandidate(p, false)
			}
		}
	}

	// 3. 解析系统与用户 .desktop 启动器中的 Exec=
	for _, dir := range linuxDesktopSearchDirs(env) {
		for _, execCmd := range scanDesktopDirExecs(dir, env.LookPath) {
			addCandidate(execCmd, false)
		}
	}

	// 4. 常见 Linux 固定安装路径、Flatpak、Snap 与 AppImage 目录
	for _, p := range linuxStaticCandidatePaths(isIDE, env) {
		addCandidate(p, false)
	}
	for _, p := range linuxFlatpakCandidatePaths(isIDE, env) {
		addCandidate(p, false)
	}
	for _, p := range linuxAppImageDirCandidates(isIDE, env) {
		addCandidate(p, false)
	}

	return found
}

func linuxPrefixedPath(rootPrefix, absPath string) string {
	if rootPrefix == "" {
		return absPath
	}
	return filepath.Join(rootPrefix, strings.TrimPrefix(absPath, "/"))
}

func linuxStaticCandidatePaths(isIDE bool, env linuxDiscoveryEnv) []string {
	p := func(abs string) string { return linuxPrefixedPath(env.RootPrefix, abs) }
	var paths []string

	if isIDE {
		if env.HomeDir != "" {
			paths = append(paths,
				filepath.Join(env.HomeDir, ".local", "share", "antigravity-ide", "antigravity-ide"),
				filepath.Join(env.HomeDir, ".local", "share", "antigravity-ide", "antigravity"),
				filepath.Join(env.HomeDir, ".local", "share", "Antigravity IDE", "antigravity-ide"),
				filepath.Join(env.HomeDir, ".local", "share", "antigravity", "antigravity"),
				filepath.Join(env.HomeDir, "Applications", "Antigravity IDE", "antigravity-ide"),
			)
		}
		paths = append(paths,
			p("/opt/Antigravity IDE/antigravity-ide"),
			p("/opt/antigravity-ide/antigravity-ide"),
			p("/usr/share/antigravity-ide/antigravity-ide"),
			p("/usr/lib/antigravity-ide/antigravity-ide"),
			p("/usr/lib64/antigravity-ide/antigravity-ide"),
			p("/usr/local/share/antigravity-ide/antigravity-ide"),
			p("/usr/local/antigravity-ide/antigravity-ide"),
			p("/snap/antigravity-ide/current/antigravity-ide"),
			p("/snap/antigravity-ide/current/usr/share/antigravity-ide/antigravity-ide"),
			// 同名目录（仅当目录结构确认为 IDE workbench 时才会通过校验）
			p("/usr/share/antigravity/antigravity"),
			p("/opt/antigravity/antigravity"),
			p("/opt/Antigravity/antigravity"),
			p("/usr/lib/antigravity/antigravity"),
			p("/usr/local/share/antigravity/antigravity"),
		)
		return paths
	}

	paths = append(paths,
		p("/opt/Antigravity/antigravity"),
		p("/opt/antigravity/antigravity"),
		p("/usr/share/antigravity/antigravity"),
		p("/usr/lib/antigravity/antigravity"),
		p("/usr/lib64/antigravity/antigravity"),
		p("/usr/local/share/antigravity/antigravity"),
		p("/usr/local/lib/antigravity/antigravity"),
		p("/usr/local/antigravity/antigravity"),
		p("/snap/antigravity/current/antigravity"),
		p("/snap/antigravity/current/opt/Antigravity/antigravity"),
		p("/snap/antigravity/current/usr/share/antigravity/antigravity"),
	)
	if env.HomeDir != "" {
		paths = append(paths,
			filepath.Join(env.HomeDir, ".local", "share", "Antigravity", "antigravity"),
			filepath.Join(env.HomeDir, ".local", "share", "antigravity", "antigravity"),
			filepath.Join(env.HomeDir, "Applications", "Antigravity", "antigravity"),
		)
	}
	return paths
}

func linuxFlatpakCandidatePaths(isIDE bool, env linuxDiscoveryEnv) []string {
	var roots []string
	roots = append(roots, linuxPrefixedPath(env.RootPrefix, "/var/lib/flatpak/app"))
	if env.HomeDir != "" {
		roots = append(roots, filepath.Join(env.HomeDir, ".local", "share", "flatpak", "app"))
	}

	exeNames := []string{"antigravity"}
	if isIDE {
		exeNames = []string{"antigravity-ide", "antigravity"}
	}

	var candidates []string
	for _, root := range roots {
		entries, err := os.ReadDir(root)
		if err != nil {
			continue
		}
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			appIDLower := strings.ToLower(entry.Name())
			if !strings.Contains(appIDLower, "antigravity") {
				continue
			}
			filesDir := filepath.Join(root, entry.Name(), "current", "active", "files")
			for _, exe := range exeNames {
				candidates = append(candidates,
					filepath.Join(filesDir, "extra", "antigravity", exe),
					filepath.Join(filesDir, "extra", "Antigravity", exe),
					filepath.Join(filesDir, "extra", "antigravity-ide", exe),
					filepath.Join(filesDir, "antigravity", exe),
					filepath.Join(filesDir, "antigravity-ide", exe),
					filepath.Join(filesDir, "lib", "antigravity", exe),
					filepath.Join(filesDir, "share", "antigravity", exe),
					filepath.Join(filesDir, "bin", exe),
				)
			}
		}
	}
	return candidates
}

func linuxAppImageDirCandidates(isIDE bool, env linuxDiscoveryEnv) []string {
	if env.HomeDir == "" {
		return nil
	}
	dirs := []string{
		filepath.Join(env.HomeDir, "Applications"),
		filepath.Join(env.HomeDir, ".local", "bin"),
	}
	var out []string
	for _, dir := range dirs {
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		var names []string
		for _, e := range entries {
			if !e.IsDir() && isLinuxAppImageFilename(e.Name(), isIDE) {
				names = append(names, e.Name())
			}
		}
		sort.Strings(names)
		for _, name := range names {
			out = append(out, filepath.Join(dir, name))
		}
	}
	return out
}

func linuxDesktopSearchDirs(env linuxDiscoveryEnv) []string {
	if env.DesktopDirs != nil {
		return env.DesktopDirs
	}
	var dirs []string
	addDir := func(d string) {
		if d == "" {
			return
		}
		cleaned := filepath.Clean(d)
		if !containsStr(dirs, cleaned) {
			dirs = append(dirs, cleaned)
		}
	}

	if env.XDGDataHome != "" && filepath.IsAbs(env.XDGDataHome) {
		addDir(filepath.Join(env.XDGDataHome, "applications"))
	} else if env.HomeDir != "" {
		addDir(filepath.Join(env.HomeDir, ".local", "share", "applications"))
	}

	if env.XDGDataDirs != "" {
		for _, part := range strings.Split(env.XDGDataDirs, string(os.PathListSeparator)) {
			if part != "" && filepath.IsAbs(part) {
				addDir(filepath.Join(part, "applications"))
			}
		}
	}
	addDir(linuxPrefixedPath(env.RootPrefix, "/usr/local/share/applications"))
	addDir(linuxPrefixedPath(env.RootPrefix, "/usr/share/applications"))
	if env.HomeDir != "" {
		addDir(filepath.Join(env.HomeDir, ".local", "share", "flatpak", "exports", "share", "applications"))
	}
	addDir(linuxPrefixedPath(env.RootPrefix, "/var/lib/flatpak/exports/share/applications"))
	addDir(linuxPrefixedPath(env.RootPrefix, "/var/lib/snapd/desktop/applications"))
	return dirs
}

func scanDesktopDirExecs(dir string, lookPath func(string) (string, error)) []string {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	var names []string
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		nameLower := strings.ToLower(entry.Name())
		if !strings.HasSuffix(nameLower, ".desktop") {
			continue
		}
		// 仅扫描目标应用相关的 .desktop，跳过本工具自身生成的 antigravity-hans*.desktop
		if !strings.Contains(nameLower, "antigravity") || strings.Contains(nameLower, "antigravity-hans") {
			continue
		}
		names = append(names, entry.Name())
	}
	sort.Strings(names)

	var cmds []string
	for _, name := range names {
		for _, cmd := range parseDesktopFileExecCommands(filepath.Join(dir, name)) {
			if !strings.Contains(cmd, "/") && lookPath != nil {
				if resolved, err := lookPath(cmd); err == nil {
					cmd = resolved
				}
			}
			cmds = append(cmds, cmd)
		}
	}
	return cmds
}

// parseDesktopFileExecCommands 解析 .desktop 文件中的 Exec= 可执行命令路径
func parseDesktopFileExecCommands(desktopPath string) []string {
	info, err := os.Stat(desktopPath)
	if err != nil || !info.Mode().IsRegular() || info.Size() > 256<<10 {
		return nil
	}
	data, err := os.ReadFile(desktopPath)
	if err != nil {
		return nil
	}

	var cmds []string
	inDesktopSection := false
	for _, rawLine := range strings.Split(string(data), "\n") {
		line := strings.TrimSpace(strings.TrimSuffix(rawLine, "\r"))
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
			inDesktopSection = line == "[Desktop Entry]" || strings.HasPrefix(line, "[Desktop Action ")
			continue
		}
		if !inDesktopSection {
			continue
		}
		k, v, ok := strings.Cut(line, "=")
		if !ok || strings.TrimSpace(k) != "Exec" {
			continue
		}
		if cmd, ok := parseDesktopExecCommand(strings.TrimSpace(v)); ok {
			if !containsStr(cmds, cmd) {
				cmds = append(cmds, cmd)
			}
		}
	}
	return cmds
}

// parseDesktopExecCommand 从单条 Desktop Entry Exec= 值中提取真实目标命令
func parseDesktopExecCommand(rawExec string) (string, bool) {
	if rawExec == "" || strings.ContainsAny(rawExec, "\r\n\x00") {
		return "", false
	}
	unescaped := unescapeDesktopKeyString(rawExec)
	tokens := tokenizeDesktopExec(unescaped)
	if len(tokens) == 0 {
		return "", false
	}

	i := 0
	// 跳过开头的 env / /usr/bin/env 及其选项与环境变量赋值
	if i < len(tokens) && isEnvCommandToken(tokens[i]) {
		i++
		for i < len(tokens) {
			tok := tokens[i]
			if tok == "--" {
				i++
				break
			}
			if tok == "-u" || tok == "--unset" || tok == "-C" || tok == "--chdir" {
				i += 2
				continue
			}
			if strings.HasPrefix(tok, "-") {
				i++
				continue
			}
			if isEnvAssignmentToken(tok) {
				i++
				continue
			}
			break
		}
	} else {
		for i < len(tokens) && isEnvAssignmentToken(tokens[i]) {
			i++
		}
	}

	for i < len(tokens) {
		tok := tokens[i]
		i++
		if isDesktopFieldCode(tok) {
			continue
		}
		tok = strings.ReplaceAll(tok, "%%", "%")
		if tok == "" {
			continue
		}
		baseLower := strings.ToLower(filepath.Base(tok))
		// 跳过 sh / bash / flatpak 等包装器，避免将通用解释器误判为应用二进制
		if baseLower == "sh" || baseLower == "bash" || baseLower == "dash" || baseLower == "zsh" || baseLower == "flatpak" {
			return "", false
		}
		if strings.Contains(baseLower, "antigravity-hans") {
			return "", false
		}
		return tok, true
	}
	return "", false
}

func unescapeDesktopKeyString(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for i := 0; i < len(s); i++ {
		if s[i] == '\\' && i+1 < len(s) {
			switch s[i+1] {
			case 's':
				b.WriteByte(' ')
				i++
				continue
			case 'n':
				b.WriteByte('\n')
				i++
				continue
			case 't':
				b.WriteByte('\t')
				i++
				continue
			case 'r':
				b.WriteByte('\r')
				i++
				continue
			case '\\':
				b.WriteByte('\\')
				i++
				continue
			}
		}
		b.WriteByte(s[i])
	}
	return b.String()
}

func tokenizeDesktopExec(s string) []string {
	var tokens []string
	var cur strings.Builder
	inQuote := byte(0)
	hasChar := false

	for i := 0; i < len(s); i++ {
		c := s[i]
		if inQuote != 0 {
			if c == inQuote {
				inQuote = 0
				continue
			}
			if c == '\\' && inQuote == '"' && i+1 < len(s) {
				i++
				cur.WriteByte(s[i])
				hasChar = true
				continue
			}
			cur.WriteByte(c)
			hasChar = true
			continue
		}

		switch c {
		case '"', '\'':
			inQuote = c
			hasChar = true
		case '\\':
			if i+1 < len(s) {
				i++
				cur.WriteByte(s[i])
				hasChar = true
			}
		case ' ', '\t':
			if hasChar {
				tokens = append(tokens, cur.String())
				cur.Reset()
				hasChar = false
			}
		default:
			cur.WriteByte(c)
			hasChar = true
		}
	}
	if hasChar {
		tokens = append(tokens, cur.String())
	}
	return tokens
}

func isEnvCommandToken(tok string) bool {
	return tok == "env" || tok == "/usr/bin/env" || tok == "/bin/env"
}

func isEnvAssignmentToken(tok string) bool {
	eq := strings.IndexByte(tok, '=')
	if eq <= 0 {
		return false
	}
	name := tok[:eq]
	return !strings.Contains(name, "/")
}

func isDesktopFieldCode(tok string) bool {
	return len(tok) == 2 && tok[0] == '%' && tok[1] != '%'
}

func expandLinuxTildePath(p, homeDir string) string {
	p = strings.TrimSpace(p)
	if homeDir == "" {
		return p
	}
	if p == "~" {
		return homeDir
	}
	if strings.HasPrefix(p, "~/") {
		return filepath.Join(homeDir, strings.TrimPrefix(p, "~/"))
	}
	return p
}

// resolveLinuxCandidate 将候选路径（可能为软链接、目录或 bin/ 包装脚本）解析为真实可执行普通文件列表
func resolveLinuxCandidate(raw string, isIDE bool, homeDir string, fromEnv bool) []string {
	expanded := expandLinuxTildePath(raw, homeDir)
	if expanded == "" || !filepath.IsAbs(expanded) {
		return nil
	}
	realPath, err := filepath.EvalSymlinks(expanded)
	if err != nil {
		return nil
	}
	realPath = filepath.Clean(realPath)
	info, err := os.Lstat(realPath)
	if err != nil {
		return nil
	}

	// 若环境变量或候选指向安装目录，自动探测目录下的主程序二进制
	if info.IsDir() {
		probeNames := []string{"antigravity", "Antigravity"}
		if isIDE {
			probeNames = []string{"antigravity-ide", "Antigravity IDE", "antigravity"}
		}
		var out []string
		for _, name := range probeNames {
			subReal, err := filepath.EvalSymlinks(filepath.Join(realPath, name))
			if err != nil {
				continue
			}
			subReal = filepath.Clean(subReal)
			if isValidLinuxResolvedFile(subReal, isIDE, fromEnv) && !containsStr(out, subReal) {
				out = append(out, subReal)
			}
		}
		return out
	}

	if !info.Mode().IsRegular() {
		return nil
	}

	// 若路径落在 <installDir>/bin/<name>（如 VS Code 系 CLI 包装脚本），优先定位父目录的真实 Electron 主程序
	if filepath.Base(filepath.Dir(realPath)) == "bin" {
		parentDir := filepath.Dir(filepath.Dir(realPath))
		probeNames := []string{"antigravity"}
		if isIDE {
			probeNames = []string{"antigravity-ide", "antigravity"}
		}
		var parentMatches []string
		for _, name := range probeNames {
			subReal, err := filepath.EvalSymlinks(filepath.Join(parentDir, name))
			if err != nil {
				continue
			}
			subReal = filepath.Clean(subReal)
			if isValidLinuxResolvedFile(subReal, isIDE, fromEnv) && !containsStr(parentMatches, subReal) {
				parentMatches = append(parentMatches, subReal)
			}
		}
		if len(parentMatches) > 0 {
			return parentMatches
		}
	}

	if isValidLinuxResolvedFile(realPath, isIDE, fromEnv) {
		return []string{realPath}
	}
	return nil
}

func isValidLinuxResolvedFile(realPath string, isIDE bool, fromEnv bool) bool {
	info, err := os.Lstat(realPath)
	if err != nil || !info.Mode().IsRegular() {
		return false
	}
	kind := classifyLinuxInstallDir(filepath.Dir(realPath))
	base := filepath.Base(realPath)

	if isIDE {
		if kind == linuxAppNormal {
			return false
		}
		if fromEnv {
			return true
		}
		if strings.EqualFold(base, "antigravity-ide") || isLinuxAppImageFilename(base, true) {
			return true
		}
		if strings.EqualFold(base, "antigravity") && kind == linuxAppIDE {
			return true
		}
		return false
	}

	// 普通版（2.x）绝不能误匹配 IDE（1.x）安装目录
	if kind == linuxAppIDE {
		return false
	}
	if fromEnv {
		return true
	}
	return strings.EqualFold(base, "antigravity") || isLinuxAppImageFilename(base, false)
}

func resolveLinuxEnvOverrideForConfig(cfg AppConfig) string {
	if !isAntigravityConfig(cfg) {
		return ""
	}
	homeDir, _ := os.UserHomeDir()
	isIDE := isTargetIDE(cfg)
	raw := os.Getenv(linuxEnvAppPath)
	if isIDE {
		raw = os.Getenv(linuxEnvIDEPath)
	}
	if strings.TrimSpace(raw) == "" {
		return ""
	}
	matches := resolveLinuxCandidate(raw, isIDE, homeDir, true)
	if len(matches) > 0 {
		return matches[0]
	}
	return ""
}
