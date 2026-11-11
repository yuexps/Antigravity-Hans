//go:build !windows

package main

import (
	"fmt"
	"os"
	"syscall"
)

func verifyOverlayOwner(info os.FileInfo) error {
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok || stat.Uid != uint32(os.Geteuid()) {
		return fmt.Errorf("外部脚本或所在目录不属于当前运行用户")
	}
	if info.Mode().Perm()&0o022 != 0 {
		return fmt.Errorf("外部脚本或所在目录对同组/其他用户开放写权限")
	}
	return nil
}

func verifyCustomTranslationsOwner(info os.FileInfo) error {
	return verifyOverlayOwner(info)
}
