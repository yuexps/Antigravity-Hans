//go:build windows

package main

import (
	"fmt"
	"os"
)

// Unix mode bits do not describe Windows ACLs. Use the embedded script unless
// the user explicitly opts into trusting an external executable script.
func verifyOverlayOwner(_ os.FileInfo) error {
	return fmt.Errorf("Windows 外部脚本需要通过 --trust-external-overlay 显式信任")
}

func verifyCustomTranslationsOwner(_ os.FileInfo) error {
	return fmt.Errorf("Windows 自定义翻译名单需要通过 --trust-custom-translations 显式信任")
}
