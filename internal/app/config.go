package app

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// Kind 标识目标应用类型。
type Kind string

const (
	KindNormal Kind = "normal"
	KindIDE    Kind = "ide"
)

// Config 描述一个目标应用的配置信息。
type Config struct {
	Kind          Kind
	Name          string
	Exe           string // 进程名（Windows: Antigravity.exe, macOS: Antigravity, Linux: antigravity）
	Port          int
	PossiblePaths []string
}

// IsIDE 判断当前配置是否指向 Antigravity IDE。
func (c Config) IsIDE() bool {
	if c.Kind != "" {
		return c.Kind == KindIDE
	}
	return strings.Contains(strings.ToLower(c.Name), "ide")
}

// 平台只读常量。
const (
	IsWindows = runtime.GOOS == "windows"
	IsMac     = runtime.GOOS == "darwin"
	IsLinux   = runtime.GOOS == "linux"
)

// DefaultNormal 构建 Antigravity 普通版默认配置。
func DefaultNormal() Config {
	cfg := Config{
		Kind: KindNormal,
		Name: "Antigravity",
		Port: 58321,
	}
	switch runtime.GOOS {
	case "windows":
		cfg.Exe = "Antigravity.exe"
		localAppData := os.Getenv("LOCALAPPDATA")
		programFiles := os.Getenv("ProgramFiles")
		cfg.PossiblePaths = []string{
			filepath.Join(localAppData, "Programs/Antigravity/Antigravity.exe"),
			filepath.Join(programFiles, "Antigravity/Antigravity.exe"),
		}
	case "darwin":
		cfg.Exe = "Antigravity"
		homeDir, _ := os.UserHomeDir()
		cfg.PossiblePaths = []string{
			"/Applications/Antigravity.app/Contents/MacOS/Antigravity",
			filepath.Join(homeDir, "Applications/Antigravity.app/Contents/MacOS/Antigravity"),
		}
	case "linux":
		cfg.Exe = "antigravity"
		cfg.PossiblePaths = discoverLinuxNormalPaths()
	default:
		cfg.Exe = "Antigravity"
		cfg.PossiblePaths = []string{}
	}
	return cfg
}

// DefaultIDE 构建 Antigravity IDE 默认配置。
func DefaultIDE() Config {
	cfg := Config{
		Kind: KindIDE,
		Name: "Antigravity IDE",
		Port: 58322,
	}
	switch runtime.GOOS {
	case "windows":
		cfg.Exe = "Antigravity IDE.exe"
		localAppData := os.Getenv("LOCALAPPDATA")
		programFiles := os.Getenv("ProgramFiles")
		cfg.PossiblePaths = []string{
			filepath.Join(localAppData, "Programs/Antigravity IDE/Antigravity IDE.exe"),
			filepath.Join(programFiles, "Antigravity IDE/Antigravity IDE.exe"),
		}
	case "darwin":
		cfg.Exe = "Electron"
		homeDir, _ := os.UserHomeDir()
		cfg.PossiblePaths = []string{
			"/Applications/Antigravity IDE.app/Contents/MacOS/Electron",
			filepath.Join(homeDir, "Applications/Antigravity IDE.app/Contents/MacOS/Electron"),
		}
	case "linux":
		cfg.Exe = "antigravity-ide"
		cfg.PossiblePaths = discoverLinuxIDEPaths()
	default:
		cfg.Exe = "Electron"
		cfg.PossiblePaths = []string{}
	}
	return cfg
}
