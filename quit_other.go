//go:build !darwin && !windows && !linux

package main

import "fmt"

// requestGracefulQuit 目前在 macOS（AppleScript）、Windows（taskkill）与 Linux（SIGTERM）上实现，
// 其它平台提示手动退出，不进行强杀。
func requestGracefulQuit(cfg AppConfig) error {
	return fmt.Errorf("当前平台不支持请求应用正常退出")
}
