//go:build windows

package safeio

import (
	"fmt"
	"os"

	"golang.org/x/sys/windows"
)

// SafeReadFlags 在 Windows 上返回 0。
func SafeReadFlags() int { return 0 }

// LockFile 在元数据字节之后加排他锁，以便 --stop 仍能读取 PID 记录。
func LockFile(f *os.File) error {
	return windows.LockFileEx(windows.Handle(f.Fd()), windows.LOCKFILE_EXCLUSIVE_LOCK|windows.LOCKFILE_FAIL_IMMEDIATELY, 0, 1, 0, &windows.Overlapped{OffsetHigh: 1})
}

// UnlockFile 释放文件排他锁。
func UnlockFile(f *os.File) error {
	return windows.UnlockFileEx(windows.Handle(f.Fd()), 0, 1, 0, &windows.Overlapped{OffsetHigh: 1})
}

// VerifyOverlayOwner 在 Windows 上要求通过 CLI 参数显式信任外部脚本。
func VerifyOverlayOwner(_ os.FileInfo) error {
	return fmt.Errorf("Windows 外部脚本需要通过 --trust-external-overlay 显式信任")
}

// VerifyCustomTranslationsOwner 在 Windows 上要求通过 CLI 参数显式信任自定义翻译名单。
func VerifyCustomTranslationsOwner(_ os.FileInfo) error {
	return fmt.Errorf("Windows 自定义翻译名单需要通过 --trust-custom-translations 显式信任")
}

// VerifyMonitorStorage 在 Windows 上不做 POSIX 权限位校验。
func VerifyMonitorStorage(_ os.FileInfo) error { return nil }
