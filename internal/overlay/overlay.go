package overlay

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"antigravity-hans/internal/safeio"
	"antigravity-hans/resources"
)

// ExternalFileName 是可执行文件同目录下用于免编译更新词库的外部脚本名。
const ExternalFileName = "antigravity-hans-overlay.js"

// overlaySentinel 是汉化脚本必须包含的标记，用于挡掉同目录下同名的无关文件。
const overlaySentinel = "__antigravityZhPatchInstalled"

// maxExternalOverlaySize 是外部脚本体积上限（正常约 80KB）。
const maxExternalOverlaySize = 2 << 20

// Fingerprint 返回脚本内容的 SHA-256 前 16 位，便于核对实际注入版本。
func Fingerprint(js string) string {
	sum := sha256.Sum256([]byte(js))
	return hex.EncodeToString(sum[:])[:16]
}

// verifyExternalOverlay 校验外部脚本是否可以安全注入。
func verifyExternalOverlay(path string, data []byte) error {
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	return verifyExternalOverlayInfo(info, data)
}

func verifyExternalOverlayInfo(info os.FileInfo, data []byte) error {
	if !info.Mode().IsRegular() {
		return fmt.Errorf("不是普通文件（符号链接或特殊文件）")
	}
	if info.Mode().Perm()&0o022 != 0 {
		return fmt.Errorf("同组或其他用户可写 (%#o)", info.Mode().Perm())
	}
	if err := safeio.VerifyOverlayOwner(info); err != nil {
		return err
	}
	if info.Size() > maxExternalOverlaySize || len(data) > maxExternalOverlaySize {
		return fmt.Errorf("体积超出上限 (%d 字节)", info.Size())
	}
	if !strings.Contains(string(data), overlaySentinel) {
		return fmt.Errorf("内容缺少汉化脚本标记 %q", overlaySentinel)
	}
	return nil
}

func readExternalOverlay(path string, allowExternal bool) (string, error) {
	// 信任标记仅跳过来源校验，保留文件类型、大小与安全读取限制。
	data, info, err := safeio.ReadRegularFile(path, maxExternalOverlaySize)
	if err != nil {
		return "", err
	}
	if !allowExternal {
		if err := verifyExternalOverlayInfo(info, data); err != nil {
			return "", err
		}
		parent, err := os.Stat(filepath.Dir(path))
		if err != nil {
			return "", err
		}
		if err := safeio.VerifyOverlayOwner(parent); err != nil {
			return "", err
		}
	}
	return string(data), nil
}

// LoadSource 优先从可执行文件同目录加载外部 JS，若不存在或校验不通过则回退至内嵌版本。
func LoadSource(allowExternal bool) string {
	exePath, err := os.Executable()
	if err == nil {
		exeDir := filepath.Dir(exePath)
		extPath := filepath.Join(exeDir, ExternalFileName)
		if source, err := readExternalOverlay(extPath, allowExternal); err == nil {
			if allowExternal {
				fmt.Printf("[警告] 已显式信任外部汉化脚本: %s (SHA-256 %s)\n", extPath, Fingerprint(source))
			} else {
				fmt.Printf("[提示] 使用外部汉化脚本: %s (SHA-256 %s)\n", extPath, Fingerprint(source))
			}
			fmt.Println("       升级 Hans 后，同目录的外部汉化脚本仍会优先加载。")
			return source
		} else if !os.IsNotExist(err) {
			fmt.Printf("[警告] 已忽略外部汉化脚本: %v\n       路径: %s\n", err, extPath)
		}
	}
	fmt.Printf("[提示] 使用内嵌汉化脚本 (SHA-256 %s)\n", Fingerprint(string(resources.OverlayJS)))
	return string(resources.OverlayJS)
}
