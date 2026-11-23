//go:build !windows

package safeio

import (
	"fmt"
	"os"
	"syscall"

	"golang.org/x/sys/unix"
)

// SafeReadFlags 返回防止跟踪符号链接与阻塞打开的 Unix 文件标志。
func SafeReadFlags() int { return unix.O_NOFOLLOW | unix.O_NONBLOCK }

// LockFile 对文件加非阻塞排他锁。
func LockFile(f *os.File) error { return unix.Flock(int(f.Fd()), unix.LOCK_EX|unix.LOCK_NB) }

// UnlockFile 释放文件排他锁。
func UnlockFile(f *os.File) error { return unix.Flock(int(f.Fd()), unix.LOCK_UN) }

// VerifyOverlayOwner 校验外部脚本或目录是否归当前用户所有且不对同组/其他用户可写。
func VerifyOverlayOwner(info os.FileInfo) error {
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok || stat.Uid != uint32(os.Geteuid()) {
		return fmt.Errorf("外部脚本或所在目录不属于当前运行用户")
	}
	if info.Mode().Perm()&0o022 != 0 {
		return fmt.Errorf("外部脚本或所在目录对同组/其他用户开放写权限")
	}
	return nil
}

// VerifyCustomTranslationsOwner 校验自定义翻译名单或目录的属主与写权限。
func VerifyCustomTranslationsOwner(info os.FileInfo) error {
	return VerifyOverlayOwner(info)
}

// VerifyMonitorStorage 校验监视器状态文件或目录的属主、权限与硬链接安全性。
func VerifyMonitorStorage(info os.FileInfo) error {
	if err := VerifyOverlayOwner(info); err != nil {
		return fmt.Errorf("监视器状态文件/目录权限不安全: %w", err)
	}
	if stat, ok := info.Sys().(*syscall.Stat_t); ok && info.Mode().IsRegular() && stat.Nlink > 1 {
		return fmt.Errorf("监视器状态文件不能是硬链接")
	}
	return nil
}
