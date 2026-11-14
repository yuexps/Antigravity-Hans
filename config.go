package main

import (
	"os"
	"path/filepath"
	"runtime"
)

// AppConfig 描述一个目标应用的配置信息
type AppConfig struct {
	Name          string
	Exe           string // 进程名（Windows: Antigravity.exe, macOS: Antigravity, Linux: antigravity）
	Port          int
	PossiblePaths []string
}

var (
	IsWindows = runtime.GOOS == "windows"
	IsMac     = runtime.GOOS == "darwin"
	IsLinux   = runtime.GOOS == "linux"
)

// buildAppNormal 构建 Antigravity 普通版配置
func buildAppNormal() AppConfig {
	cfg := AppConfig{
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

// buildAppIDE 构建 Antigravity IDE 配置
func buildAppIDE() AppConfig {
	cfg := AppConfig{
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

var (
	AppNormal = buildAppNormal()
	AppIDE    = buildAppIDE()
)
