package main

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/shirou/gopsutil/v4/process"
)

// DetectedApp 进程检测结果
type DetectedApp struct {
	Name     string
	Exe      string
	Port     int
	Running  bool
	Path     string   // 正在运行实例的可执行文件路径（如有）
	PIDs     []int32  // 所有匹配进程的 PID
	AllPaths []string // 所有已找到的安装路径
}

// isProcessMatch 判断进程是否与目标 App 匹配
func isProcessMatch(pName, pExe string, cfg AppConfig) bool {
	if IsMac {
		pNameLower := strings.ToLower(pName)
		pExeLower := strings.ToLower(pExe)
		exeLower := strings.ToLower(cfg.Exe)
		appNameLower := strings.ToLower(cfg.Name)
		if strings.Contains(appNameLower, "ide") {
			return strings.Contains(pExeLower, "antigravity ide.app") || pNameLower == "antigravity ide"
		}
		return strings.Contains(pExeLower, "antigravity.app") ||
			pNameLower == "antigravity" ||
			filepath.Base(pExeLower) == exeLower
	}

	if IsLinux {
		rawExe := strings.TrimSuffix(pExe, " (deleted)")
		if rawExe != "" && isAntigravityConfig(cfg) {
			isIDE := isTargetIDE(cfg)
			base := filepath.Base(rawExe)
			kind := classifyLinuxInstallDir(filepath.Dir(rawExe))
			switch kind {
			case linuxAppIDE:
				if !isIDE {
					return false
				}
				return strings.EqualFold(base, cfg.Exe) || strings.EqualFold(base, "antigravity")
			case linuxAppNormal:
				if isIDE {
					return false
				}
				return strings.EqualFold(base, cfg.Exe)
			}
			if override := resolveLinuxEnvOverrideForConfig(cfg); override != "" && samePath(rawExe, override) {
				return true
			}
			if isLinuxAppImageFilename(base, isIDE) {
				return true
			}
		}
		if rawExe != "" {
			return strings.EqualFold(pName, cfg.Exe) || strings.EqualFold(filepath.Base(rawExe), cfg.Exe)
		}
		return strings.EqualFold(pName, cfg.Exe)
	}

	pName = strings.ToLower(pName)
	pExe = strings.ToLower(pExe)
	exeLower := strings.ToLower(cfg.Exe)
	return pName == exeLower || filepath.Base(pExe) == exeLower
}

// isProcessOwnedByCurrentLinuxUser 过滤多用户 Linux 系统上其他普通用户的同名进程；
// root（如 sudo --patch）保留可见性以防在他人运行时覆盖安装目录文件。
func isProcessOwnedByCurrentLinuxUser(p *process.Process) bool {
	if !IsLinux {
		return true
	}
	uid := os.Getuid()
	if uid == 0 {
		return true
	}
	uids, err := p.Uids()
	if err != nil || len(uids) == 0 {
		return true
	}
	return int(uids[0]) == uid
}

// isLinuxZombie 判断匹配的 Linux 进程是否已处于退出未回收的僵尸态（Z / zombie），
// 避免父进程尚未 wait 回收的子进程阻塞 waitForAppExit 或被误判为仍在运行。
func isLinuxZombie(p *process.Process) bool {
	if !IsLinux || p == nil {
		return false
	}
	statuses, err := p.Status()
	if err != nil {
		return false
	}
	for _, st := range statuses {
		if st == process.Zombie || st == "Z" {
			return true
		}
	}
	return false
}

// resolveRunningLinuxExe 解析 Linux 运行中进程的真实可执行文件路径（兼容软链接与 AppImage 挂载）
func resolveRunningLinuxExe(p *process.Process, pExe string, cfg AppConfig) string {
	rawExe := strings.TrimSuffix(pExe, " (deleted)")
	if rawExe == "" {
		return ""
	}
	if strings.HasPrefix(rawExe, "/tmp/.mount_") && p != nil {
		if envs, err := p.Environ(); err == nil {
			for _, kv := range envs {
				if appImagePath, ok := strings.CutPrefix(kv, "APPIMAGE="); ok && appImagePath != "" {
					if realAppImage, err := filepath.EvalSymlinks(appImagePath); err == nil {
						realAppImage = filepath.Clean(realAppImage)
						if isExpectedExecutable(realAppImage, cfg) {
							return realAppImage
						}
					}
				}
			}
		}
	}
	if realExe, err := filepath.EvalSymlinks(rawExe); err == nil {
		realExe = filepath.Clean(realExe)
		if isExpectedExecutable(realExe, cfg) {
			return realExe
		}
	}
	if isExpectedExecutable(rawExe, cfg) {
		return filepath.Clean(rawExe)
	}
	return ""
}

// DetectApp 检测目标 App 的运行状态与安装路径
func DetectApp(cfg AppConfig) DetectedApp {
	result := DetectedApp{
		Name:     cfg.Name,
		Exe:      cfg.Exe,
		Port:     cfg.Port,
		AllPaths: []string{},
		PIDs:     []int32{},
	}

	// 遍历进程列表
	procs, err := process.Processes()
	if err == nil {
		for _, p := range procs {
			if !isProcessOwnedByCurrentLinuxUser(p) {
				continue
			}
			pName, _ := p.Name()
			pExe, _ := p.Exe()

			if isProcessMatch(pName, pExe, cfg) {
				if isLinuxZombie(p) {
					continue
				}
				result.Running = true
				result.PIDs = append(result.PIDs, p.Pid)

				if pExe != "" {
					if IsMac {
						if _, err := os.Stat(pExe); err == nil && isMacMainExe(pExe, cfg) {
							result.Path = pExe
						}
					} else if IsLinux {
						if resolved := resolveRunningLinuxExe(p, pExe, cfg); resolved != "" {
							result.Path = resolved
						}
					} else {
						if _, err := os.Stat(pExe); err == nil {
							result.Path = pExe
						}
					}
				}
			}
		}
	}

	// 从预设路径探测安装位置
	allFound := []string{}
	if IsLinux {
		for _, p := range cfg.PossiblePaths {
			realPath, err := filepath.EvalSymlinks(p)
			if err != nil {
				continue
			}
			realPath = filepath.Clean(realPath)
			if isExpectedExecutable(realPath, cfg) && !containsStr(allFound, realPath) {
				allFound = append(allFound, realPath)
			}
		}
		// 若用户将二进制放在自定义目录并通过软链接启动，将解析后的真实运行路径并入 AllPaths 并去重
		if result.Path != "" && isExpectedExecutable(result.Path, cfg) && !containsStr(allFound, result.Path) {
			allFound = append(allFound, result.Path)
		}
	} else {
		for _, p := range cfg.PossiblePaths {
			if _, err := os.Stat(p); err == nil {
				allFound = append(allFound, p)
			}
		}
	}

	// 若预设路径无结果，查询注册表（Windows）。
	// 注册表内容不受本工具控制，因此只接受文件名与目标 exe 一致、且确实是普通文件的路径。
	if len(allFound) == 0 {
		regPaths := GetPathsFromRegistry(cfg.Name, cfg.Exe)
		for _, p := range regPaths {
			if !containsStr(allFound, p) && isExpectedExecutable(p, cfg) {
				allFound = append(allFound, p)
			}
		}
	}
	result.AllPaths = allFound

	if result.Path == "" && len(allFound) == 1 {
		result.Path = allFound[0]
	}

	return result
}

// isExpectedExecutable 校验待启动路径确实是目标应用的可执行文件。
// 路径可能来自注册表等外部来源，因此要求：存在、是普通文件（非目录或符号链接）、
// 且文件名与配置中的可执行文件名一致（Linux 下同时区分同名 1.x IDE / 2.x 普通版与 AppImage）。
func isExpectedExecutable(path string, cfg AppConfig) bool {
	if path == "" || cfg.Exe == "" {
		return false
	}
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() {
		return false
	}
	base := filepath.Base(path)
	if IsLinux && isAntigravityConfig(cfg) {
		isIDE := isTargetIDE(cfg)
		kind := classifyLinuxInstallDir(filepath.Dir(path))
		if isIDE && kind == linuxAppNormal {
			return false
		}
		if !isIDE && kind == linuxAppIDE {
			return false
		}
		if override := resolveLinuxEnvOverrideForConfig(cfg); override != "" && samePath(path, override) {
			return true
		}
		if isLinuxAppImageFilename(base, isIDE) {
			return true
		}
		if isIDE && strings.EqualFold(base, "antigravity") && kind == linuxAppIDE {
			return true
		}
	}
	return strings.EqualFold(base, cfg.Exe)
}

// isMacMainExe 判断 macOS 上是否是主进程可执行文件路径
func isMacMainExe(pExe string, cfg AppConfig) bool {
	appNameLower := strings.ToLower(cfg.Name)
	if strings.Contains(appNameLower, "ide") {
		return strings.HasSuffix(pExe, "/Contents/MacOS/Electron")
	}
	return strings.HasSuffix(pExe, "/Contents/MacOS/Antigravity")
}

// KillApp 强制结束所有匹配的进程
func KillApp(cfg AppConfig) {
	procs, err := process.Processes()
	if err != nil {
		return
	}
	for _, p := range procs {
		if !isProcessOwnedByCurrentLinuxUser(p) {
			continue
		}
		pName, _ := p.Name()
		pExe, _ := p.Exe()
		if isProcessMatch(pName, pExe, cfg) {
			_ = p.Kill()
		}
	}
}

// CheckProcessRunning 返回与应用匹配的所有 PID
func CheckProcessRunning(cfg AppConfig, exePath string) []int32 {
	var pids []int32
	procs, err := process.Processes()
	if err != nil {
		return pids
	}

	resolvedExePath := exePath
	if IsLinux && exePath != "" {
		if realPath, err := filepath.EvalSymlinks(exePath); err == nil {
			resolvedExePath = realPath
		}
	}
	exePathLower := strings.ToLower(resolvedExePath)

	for _, p := range procs {
		if !isProcessOwnedByCurrentLinuxUser(p) {
			continue
		}
		pName, _ := p.Name()
		pExe, _ := p.Exe()

		// 绝对路径精确匹配
		if resolvedExePath != "" && pExe != "" {
			if IsLinux {
				if samePath(strings.TrimSuffix(pExe, " (deleted)"), resolvedExePath) {
					if !isLinuxZombie(p) {
						pids = append(pids, p.Pid)
					}
					continue
				}
			} else if strings.EqualFold(filepath.Clean(pExe), filepath.Clean(exePathLower)) {
				pids = append(pids, p.Pid)
				continue
			}
		}

		// macOS bundle 路径检测
		if IsMac {
			appNameLower := strings.ToLower(cfg.Name)
			pExeLower := strings.ToLower(pExe)
			pNameLower := strings.ToLower(pName)
			if strings.Contains(appNameLower, "ide") {
				if strings.Contains(pExeLower, "antigravity ide.app") || pNameLower == "antigravity ide" {
					pids = append(pids, p.Pid)
					continue
				}
			} else {
				if strings.Contains(pExeLower, "antigravity.app") || pNameLower == "antigravity" {
					pids = append(pids, p.Pid)
					continue
				}
			}
			// 避免 macOS 误匹配其他 Electron 实例
			if strings.ToLower(cfg.Exe) == "electron" {
				continue
			}
		}

		// 通用文件名匹配（兜底）
		if isProcessMatch(pName, pExe, cfg) && !isLinuxZombie(p) {
			pids = append(pids, p.Pid)
		}
	}
	return pids
}

func containsStr(slice []string, s string) bool {
	for _, v := range slice {
		if v == s {
			return true
		}
	}
	return false
}
