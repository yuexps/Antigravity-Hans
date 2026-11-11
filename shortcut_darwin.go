//go:build darwin

package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// CreateChineseShortcut 创建一个运行动态汉化的 “原名字 中文.app” 包装应用
func CreateChineseShortcut(cfg AppConfig, trustCustomTranslations bool) error {
	// 获取当前 antigravity-hans 的绝对路径
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

	// 确定应用程序目录
	appsDir := "/Applications"
	// 检查 /Applications 是否可写，若不可写则使用用户目录下的 Applications
	probe, err := os.CreateTemp(appsDir, ".agy-hans-write-*")
	if err != nil {
		appsDir = filepath.Join(homeDir, "Applications")
	} else {
		_ = probe.Close()
		_ = os.Remove(probe.Name())
	}
	wrapperAppName := cfg.Name + " 中文.app"
	wrapperAppPath := filepath.Join(appsDir, wrapperAppName)

	// 创建目录结构
	contentsDir := filepath.Join(wrapperAppPath, "Contents")
	macosDir := filepath.Join(contentsDir, "MacOS")
	resourcesDir := filepath.Join(contentsDir, "Resources")

	if err := os.MkdirAll(appsDir, 0755); err != nil {
		return err
	}
	root, err := os.OpenRoot(appsDir)
	if err != nil {
		return err
	}
	defer root.Close()
	macosRel, _ := filepath.Rel(appsDir, macosDir)
	resourcesRel, _ := filepath.Rel(appsDir, resourcesDir)
	if err := ensureRootDirectory(root, macosRel); err != nil {
		return err
	}
	if err := ensureRootDirectory(root, resourcesRel); err != nil {
		return err
	}

	// 1. 写 Info.plist
	infoPlistContent := `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleExecutable</key>
	<string>launcher</string>
	<key>CFBundleIconFile</key>
	<string>icon.icns</string>
	<key>CFBundleIdentifier</key>
	<string>com.antigravity.hans.wrapper.` + strings.ReplaceAll(strings.ToLower(cfg.Name), " ", "") + `</string>
	<key>CFBundleName</key>
	<string>` + cfg.Name + ` 中文</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>LSUIElement</key>
	<true/>
</dict>
</plist>
`
	infoRel, _ := filepath.Rel(appsDir, filepath.Join(contentsDir, "Info.plist"))
	if err := writeRootFileAtomic(root, infoRel, []byte(infoPlistContent), 0644); err != nil {
		return err
	}

	// 2. 确定原 app 路径
	var originalAppPath string
	detected := DetectApp(cfg)
	if detected.Path != "" {
		originalAppPath = filepath.Dir(filepath.Dir(filepath.Dir(detected.Path)))
	} else if len(detected.AllPaths) > 0 {
		originalAppPath = filepath.Dir(filepath.Dir(filepath.Dir(detected.AllPaths[0])))
	} else if len(cfg.PossiblePaths) > 0 {
		originalAppPath = filepath.Dir(filepath.Dir(filepath.Dir(cfg.PossiblePaths[0])))
	}

	// 3. 写 launcher 脚本
	arg := "--app"
	if strings.Contains(strings.ToLower(cfg.Name), "ide") {
		arg = "--ide"
	}
	// 监视进程的日志落到 ~/Library/Logs，便于排查“没有汉化”这类静默失败
	launcherContent := macLauncherScript(selfExeAbs, arg, trustCustomTranslations)
	launcherPath := filepath.Join(macosDir, "launcher")
	launcherRel, _ := filepath.Rel(appsDir, launcherPath)
	if err := writeRootFileAtomic(root, launcherRel, []byte(launcherContent), 0755); err != nil {
		return err
	}

	// 4. 复制图标；写入端也不跟随预置的符号链接。
	if originalAppPath != "" {
		origResources := filepath.Join(originalAppPath, "Contents", "Resources")
		if files, err := os.ReadDir(origResources); err == nil {
			for _, file := range files {
				if filepath.Ext(file.Name()) == ".icns" {
					data, _, err := readRegularFile(filepath.Join(origResources, file.Name()), 16<<20)
					if err == nil {
						err = writeRootFileAtomic(root, filepath.Join(resourcesRel, "icon.icns"), data, 0644)
					}
					if err != nil {
						fmt.Printf("[提示] 未能复制快捷方式图标: %v\n", err)
					}
					break
				}
			}
		}
	}
	fmt.Printf("[成功] 已在应用程序目录创建包装应用: %s\n", wrapperAppPath)
	return nil
}

func macLauncherScript(selfExe, arg string, trustCustomTranslations bool) string {
	trustArg := ""
	if trustCustomTranslations {
		trustArg = " " + trustCustomTranslationsArg
	}
	return fmt.Sprintf(`#!/bin/bash
# 启动后台汉化监视进程，日志写入 ~/Library/Logs/antigravity-hans.log
LOG_DIR="$HOME/Library/Logs"
LOG_FILE="$LOG_DIR/antigravity-hans.log"
mkdir -p "$LOG_DIR"
nohup %s %s --nogui%s >> "$LOG_FILE" 2>&1 &
# 汉化监视器负责启动原应用，避免 open 与调试模式启动争抢单实例锁。
`, shellQuote(selfExe), shellQuote(arg), trustArg)
}
