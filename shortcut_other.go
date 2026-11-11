//go:build !windows && !darwin

package main

import "fmt"

// CreateChineseShortcut 空实现
func CreateChineseShortcut(cfg AppConfig, trustCustomTranslations bool) error {
	return fmt.Errorf("当前系统平台暂不支持创建桌面快捷方式/包装应用")
}
