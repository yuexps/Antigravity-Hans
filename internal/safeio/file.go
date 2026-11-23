package safeio

import (
	"crypto/rand"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// ReadRegularFile 在打开前后校验普通文件身份，防止符号链接与 TOCTOU 替换。
func ReadRegularFile(path string, limit int64) ([]byte, os.FileInfo, error) {
	root, err := os.OpenRoot(filepath.Dir(path))
	if err != nil {
		return nil, nil, err
	}
	defer root.Close()
	return ReadRootRegularFile(root, filepath.Base(path), limit)
}

// ReadRootRegularFile 在受限根目录内安全读取普通文件，防止符号链接与 TOCTOU 替换。
func ReadRootRegularFile(root *os.Root, name string, limit int64) ([]byte, os.FileInfo, error) {
	info, err := root.Lstat(name)
	if err != nil {
		return nil, nil, err
	}
	if !info.Mode().IsRegular() || info.Size() > limit {
		return nil, nil, fmt.Errorf("拒绝非普通文件或超出体积上限的文件: %s", name)
	}
	f, err := root.OpenFile(name, os.O_RDONLY|SafeReadFlags(), 0)
	if err != nil {
		return nil, nil, err
	}
	defer f.Close()
	opened, err := f.Stat()
	if err != nil {
		return nil, nil, err
	}
	if !opened.Mode().IsRegular() || !os.SameFile(info, opened) {
		return nil, nil, fmt.Errorf("读取期间文件身份发生变化: %s", name)
	}
	data, err := io.ReadAll(io.LimitReader(f, limit+1))
	if err != nil {
		return nil, nil, err
	}
	if int64(len(data)) > limit {
		return nil, nil, fmt.Errorf("文件超出体积上限: %s", name)
	}
	return data, opened, nil
}

// EnsureRootDirectory 确保受限根目录内的相对路径均为普通目录且不含符号链接。
func EnsureRootDirectory(root *os.Root, name string) error {
	if !filepath.IsLocal(name) {
		return fmt.Errorf("无效的相对目录: %s", name)
	}
	current := ""
	for _, part := range strings.Split(filepath.Clean(name), string(filepath.Separator)) {
		current = filepath.Join(current, part)
		info, err := root.Lstat(current)
		if os.IsNotExist(err) {
			if err = root.Mkdir(current, 0755); err != nil && !os.IsExist(err) {
				return err
			}
			info, err = root.Lstat(current)
		}
		if err != nil {
			return err
		}
		if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("目录不是安全的普通目录: %s", current)
		}
	}
	return nil
}

// WriteRootFileAtomic 在受限根目录内通过临时文件与原子重命名安全写入普通文件。
func WriteRootFileAtomic(root *os.Root, name string, data []byte, mode os.FileMode) error {
	if !filepath.IsLocal(name) {
		return fmt.Errorf("无效的相对路径: %s", name)
	}
	if err := EnsureRootDirectory(root, filepath.Dir(name)); err != nil {
		return err
	}
	if info, err := root.Lstat(name); err == nil {
		if !info.Mode().IsRegular() {
			return fmt.Errorf("拒绝覆盖非普通文件: %s", name)
		}
	} else if !os.IsNotExist(err) {
		return err
	}
	var nonce [16]byte
	if _, err := rand.Read(nonce[:]); err != nil {
		return err
	}
	tmp := filepath.Join(filepath.Dir(name), fmt.Sprintf(".agy-hans-%x.tmp", nonce))
	f, err := root.OpenFile(tmp, os.O_CREATE|os.O_EXCL|os.O_WRONLY, mode)
	if err != nil {
		return err
	}
	defer root.Remove(tmp)
	if _, err = f.Write(data); err == nil {
		err = f.Chmod(mode)
	}
	if err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	// 原子替换目录项，不跟随目标符号链接。
	return root.Rename(tmp, name)
}

// FileExists 判断路径是否存在。
func FileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// SamePath 判断两个路径是否指向同一文件或等价路径。
func SamePath(a, b string) bool {
	if left, err := os.Stat(a); err == nil {
		if right, err := os.Stat(b); err == nil {
			return os.SameFile(left, right)
		}
	}
	if runtime.GOOS == "windows" {
		return strings.EqualFold(filepath.Clean(a), filepath.Clean(b))
	}
	return filepath.Clean(a) == filepath.Clean(b)
}
