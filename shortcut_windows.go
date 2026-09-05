//go:build windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"golang.org/x/sys/windows/registry"
)

// CreateChineseShortcut 创建一个运行动态汉化的“原名字 中文”桌面快捷方式
func CreateChineseShortcut(cfg AppConfig) error {
	// 获取当前 antigravity-hans.exe 的绝对路径
	selfExe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("无法获取当前程序路径: %v", err)
	}
	selfExeAbs, err := filepath.Abs(selfExe)
	if err != nil {
		selfExeAbs = selfExe
	}
	selfDir := filepath.Dir(selfExeAbs)

	// 计算桌面路径
	desktopDir := getDesktopPath()
	publicDesktop := getPublicDesktopPath()

	// 查找原快捷方式的可能名字
	lnkName := cfg.Name + ".lnk"
	newLnkName := cfg.Name + " 中文.lnk"

	// 待检测的原快捷方式路径
	possibleOldPaths := []string{
		filepath.Join(desktopDir, lnkName),
		filepath.Join(publicDesktop, lnkName),
		filepath.Join(os.Getenv("APPDATA"), `Microsoft\Windows\Start Menu\Programs`, lnkName),
		filepath.Join(os.Getenv("ALLUSERSPROFILE"), `Microsoft\Windows\Start Menu\Programs`, lnkName),
	}

	var foundOldLnk string
	for _, p := range possibleOldPaths {
		if _, err := os.Stat(p); err == nil {
			foundOldLnk = p
			break
		}
	}

	// 确定目标 App 的 exe 路径（用于提取图标）
	var targetExe string
	detected := DetectApp(cfg)
	if detected.Path != "" {
		targetExe = detected.Path
	} else if len(detected.AllPaths) > 0 {
		targetExe = detected.AllPaths[0]
	} else if len(cfg.PossiblePaths) > 0 {
		targetExe = cfg.PossiblePaths[0]
	}

	// 目标快捷方式的保存路径，默认放在当前用户桌面
	targetLnkPath := filepath.Join(desktopDir, newLnkName)

	var psScript string
	if foundOldLnk != "" {
		// 复制原快捷方式，并修改 Target 和 Args，保留 IconLocation
		arg := "--app --nogui"
		if strings.Contains(strings.ToLower(cfg.Name), "ide") {
			arg = "--ide --nogui"
		}

		psScript = fmt.Sprintf(`
$sh = New-Object -ComObject WScript.Shell
$oldLnk = $sh.CreateShortcut(%q)
$newLnk = $sh.CreateShortcut(%q)

# 克隆并修改属性
$newLnk.TargetPath = %q
$newLnk.Arguments = %q
$newLnk.WorkingDirectory = %q
$newLnk.Description = $oldLnk.Description

# 图标设置：如果原快捷方式使用的是独立 .ico 图标，保留之；
# 否则，由于 TargetPath 改变为汉化工具，必须显式将 Icon 指向原 App 的可执行文件
if ($oldLnk.IconLocation -and $oldLnk.IconLocation -like "*.ico*") {
    $newLnk.IconLocation = $oldLnk.IconLocation
} elseif ($oldLnk.TargetPath) {
    $newLnk.IconLocation = $oldLnk.TargetPath + ",0"
} else {
    $newLnk.IconLocation = %q + ",0"
}
$newLnk.Save()
`, foundOldLnk, targetLnkPath, selfExeAbs, arg, selfDir, targetExe)
	} else {
		// 如果找不到原快捷方式，直接创建一个新的
		if targetExe == "" {
			return fmt.Errorf("找不到 %s 的安装路径，无法创建快捷方式", cfg.Name)
		}
		arg := "--app --nogui"
		if strings.Contains(strings.ToLower(cfg.Name), "ide") {
			arg = "--ide --nogui"
		}
		psScript = fmt.Sprintf(`
$sh = New-Object -ComObject WScript.Shell
$newLnk = $sh.CreateShortcut(%q)
$newLnk.TargetPath = %q
$newLnk.Arguments = %q
$newLnk.WorkingDirectory = %q
$newLnk.IconLocation = %q + ",0"
$newLnk.Save()
`, targetLnkPath, selfExeAbs, arg, selfDir, targetExe)
	}

	// 执行 PowerShell 脚本
	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", psScript)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("PowerShell 快捷方式生成失败: %v, 输出: %s", err, string(output))
	}

	fmt.Printf("[成功] 已在桌面创建快捷方式: %s\n", targetLnkPath)
	return nil
}

func getDesktopPath() string {
	k, err := registry.OpenKey(registry.CURRENT_USER, `Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders`, registry.QUERY_VALUE)
	if err == nil {
		defer k.Close()
		val, _, err := k.GetStringValue("Desktop")
		if err == nil && val != "" {
			if expanded, err := registry.ExpandString(val); err == nil {
				return expanded
			}
			return os.ExpandEnv(val)
		}
	}
	return filepath.Join(os.Getenv("USERPROFILE"), "Desktop")
}

func getPublicDesktopPath() string {
	k, err := registry.OpenKey(registry.LOCAL_MACHINE, `SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders`, registry.QUERY_VALUE)
	if err == nil {
		defer k.Close()
		val, _, err := k.GetStringValue("Common Desktop")
		if err == nil && val != "" {
			if expanded, err := registry.ExpandString(val); err == nil {
				return expanded
			}
			return os.ExpandEnv(val)
		}
	}
	return `C:\Users\Public\Desktop`
}
