package app

import (
	"os"
	"path/filepath"
	"slices"
	"strings"

	"github.com/shirou/gopsutil/v4/process"

	"antigravity-hans/internal/safeio"
)

// Detected 描述应用运行状态与探测到的安装路径。
type Detected struct {
	Name     string
	Exe      string
	Port     int
	Running  bool
	Path     string   // 正在运行实例的可执行文件路径（如有）
	PIDs     []int32  // 所有匹配进程的 PID
	AllPaths []string // 所有已找到的安装路径
}

// IsProcessMatch 判断进程是否与目标应用匹配。
func IsProcessMatch(pName, pExe string, cfg Config) bool {
	if IsMac {
		pNameLower := strings.ToLower(pName)
		pExeLower := strings.ToLower(pExe)
		exeLower := strings.ToLower(cfg.Exe)
		if cfg.IsIDE() {
			return strings.Contains(pExeLower, "antigravity ide.app") || pNameLower == "antigravity ide"
		}
		return strings.Contains(pExeLower, "antigravity.app") ||
			pNameLower == "antigravity" ||
			filepath.Base(pExeLower) == exeLower
	}

	if IsLinux {
		rawExe := strings.TrimSuffix(pExe, " (deleted)")
		if rawExe != "" && isAntigravityConfig(cfg) {
			isIDE := cfg.IsIDE()
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
			if override := resolveLinuxEnvOverrideForConfig(cfg); override != "" && safeio.SamePath(rawExe, override) {
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

// IsProcessOwnedByCurrentLinuxUser 过滤多用户 Linux 系统上其他普通用户的同名进程；
// root（如 sudo --patch）保留可见性以防在他人运行时覆盖安装目录文件。
func IsProcessOwnedByCurrentLinuxUser(p *process.Process) bool {
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

// IsLinuxZombie 判断匹配的 Linux 进程是否处于退出未回收的僵尸态。
func IsLinuxZombie(p *process.Process) bool {
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

// resolveRunningLinuxExe 解析 Linux 运行中进程的真实可执行文件路径（兼容软链接与 AppImage 挂载）。
func resolveRunningLinuxExe(p *process.Process, pExe string, cfg Config) string {
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
						if IsExpectedExecutable(realAppImage, cfg) {
							return realAppImage
						}
					}
				}
			}
		}
	}
	if realExe, err := filepath.EvalSymlinks(rawExe); err == nil {
		realExe = filepath.Clean(realExe)
		if IsExpectedExecutable(realExe, cfg) {
			return realExe
		}
	}
	if IsExpectedExecutable(rawExe, cfg) {
		return filepath.Clean(rawExe)
	}
	return ""
}

// Detect 检测目标应用的运行状态与安装路径。
func Detect(cfg Config) Detected {
	result := Detected{
		Name:     cfg.Name,
		Exe:      cfg.Exe,
		Port:     cfg.Port,
		AllPaths: []string{},
		PIDs:     []int32{},
	}

	if procs, err := process.Processes(); err == nil {
		for _, p := range procs {
			if !IsProcessOwnedByCurrentLinuxUser(p) {
				continue
			}
			pName, _ := p.Name()
			pExe, _ := p.Exe()
			if !IsProcessMatch(pName, pExe, cfg) || IsLinuxZombie(p) {
				continue
			}
			result.Running = true
			result.PIDs = append(result.PIDs, p.Pid)
			if pExe != "" {
				if resolved := resolveRunningExePath(p, pExe, cfg); resolved != "" {
					result.Path = resolved
				}
			}
		}
	}

	allFound := collectInstalledPaths(cfg, result.Path)
	result.AllPaths = allFound
	if result.Path == "" && len(allFound) == 1 {
		result.Path = allFound[0]
	}
	return result
}

func resolveRunningExePath(p *process.Process, pExe string, cfg Config) string {
	if IsMac {
		if _, err := os.Stat(pExe); err == nil && IsMacMainExe(pExe, cfg) {
			return pExe
		}
		return ""
	}
	if IsLinux {
		return resolveRunningLinuxExe(p, pExe, cfg)
	}
	if _, err := os.Stat(pExe); err == nil {
		return pExe
	}
	return ""
}

func collectInstalledPaths(cfg Config, runningPath string) []string {
	allFound := []string{}
	if IsLinux {
		for _, p := range cfg.PossiblePaths {
			realPath, err := filepath.EvalSymlinks(p)
			if err != nil {
				continue
			}
			realPath = filepath.Clean(realPath)
			if IsExpectedExecutable(realPath, cfg) && !slices.Contains(allFound, realPath) {
				allFound = append(allFound, realPath)
			}
		}
		if runningPath != "" && IsExpectedExecutable(runningPath, cfg) && !slices.Contains(allFound, runningPath) {
			allFound = append(allFound, runningPath)
		}
	} else {
		for _, p := range cfg.PossiblePaths {
			if _, err := os.Stat(p); err == nil {
				allFound = append(allFound, p)
			}
		}
	}

	if len(allFound) == 0 {
		for _, p := range GetPathsFromRegistry(cfg.Name, cfg.Exe) {
			if !slices.Contains(allFound, p) && IsExpectedExecutable(p, cfg) {
				allFound = append(allFound, p)
			}
		}
	}
	return allFound
}

// IsExpectedExecutable 校验待启动路径确实是目标应用的可执行普通文件。
func IsExpectedExecutable(path string, cfg Config) bool {
	if path == "" || cfg.Exe == "" {
		return false
	}
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() {
		return false
	}
	base := filepath.Base(path)
	if IsLinux && isAntigravityConfig(cfg) {
		isIDE := cfg.IsIDE()
		kind := classifyLinuxInstallDir(filepath.Dir(path))
		if isIDE && kind == linuxAppNormal {
			return false
		}
		if !isIDE && kind == linuxAppIDE {
			return false
		}
		if override := resolveLinuxEnvOverrideForConfig(cfg); override != "" && safeio.SamePath(path, override) {
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

// IsMacMainExe 判断 macOS 路径是否为主进程可执行文件。
func IsMacMainExe(pExe string, cfg Config) bool {
	if cfg.IsIDE() {
		return strings.HasSuffix(pExe, "/Contents/MacOS/Electron")
	}
	return strings.HasSuffix(pExe, "/Contents/MacOS/Antigravity")
}

// CheckProcessRunning 返回与应用匹配的所有活跃 PID。
func CheckProcessRunning(cfg Config, exePath string) []int32 {
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
		if !IsProcessOwnedByCurrentLinuxUser(p) {
			continue
		}
		pName, _ := p.Name()
		pExe, _ := p.Exe()

		if resolvedExePath != "" && pExe != "" {
			if IsLinux {
				if safeio.SamePath(strings.TrimSuffix(pExe, " (deleted)"), resolvedExePath) {
					if !IsLinuxZombie(p) {
						pids = append(pids, p.Pid)
					}
					continue
				}
			} else if strings.EqualFold(filepath.Clean(pExe), filepath.Clean(exePathLower)) {
				pids = append(pids, p.Pid)
				continue
			}
		}

		if IsMac {
			if isMacBundleProcess(pName, pExe, cfg) {
				pids = append(pids, p.Pid)
				continue
			}
			if strings.EqualFold(cfg.Exe, "electron") {
				continue
			}
		}

		if IsProcessMatch(pName, pExe, cfg) && !IsLinuxZombie(p) {
			pids = append(pids, p.Pid)
		}
	}
	return pids
}

func isMacBundleProcess(pName, pExe string, cfg Config) bool {
	pExeLower := strings.ToLower(pExe)
	pNameLower := strings.ToLower(pName)
	if cfg.IsIDE() {
		return strings.Contains(pExeLower, "antigravity ide.app") || pNameLower == "antigravity ide"
	}
	return strings.Contains(pExeLower, "antigravity.app") || pNameLower == "antigravity"
}
