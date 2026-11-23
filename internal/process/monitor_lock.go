package process

import (
	"debug/buildinfo"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"sync"

	goprocess "github.com/shirou/gopsutil/v4/process"

	"antigravity-hans/internal/app"
	"antigravity-hans/internal/safeio"
)

type monitorIdentity struct {
	PID        int32  `json:"pid"`
	CreatedAt  int64  `json:"createdAt"`
	Executable string `json:"executable"`
}

// monitorStateDirOverride 仅用于测试时改写监视器状态目录
var monitorStateDirOverride string

// SetMonitorStateDirForTest 仅用于测试时覆写监视器状态目录。
func SetMonitorStateDirForTest(dir string) {
	monitorStateDirOverride = dir
}

// monitorStateDir 返回存放监视器锁文件的目录
func monitorStateDir() string {
	if monitorStateDirOverride != "" {
		return monitorStateDirOverride
	}
	if base, err := os.UserConfigDir(); err == nil && base != "" {
		return filepath.Join(base, "antigravity-hans")
	}
	return filepath.Join(os.TempDir(), "antigravity-hans")
}

// monitorLockPath 按应用区分锁文件：既能同时为 Antigravity 与 Antigravity IDE 各跑一个监视器，
// 又不能以端口为键——首选端口被占用时运行期会改用备用端口。
func monitorLockPath(cfg app.Config) string {
	return filepath.Join(monitorStateDir(), "monitor-"+appSlug(cfg)+".pid")
}

// appSlug 把应用名转换成稳定的文件名片段
func appSlug(cfg app.Config) string {
	slug := strings.ToLower(strings.TrimSpace(cfg.Name))
	slug = strings.NewReplacer(" ", "-", "/", "-", "\\", "-", "..", "-").Replace(slug)
	if slug == "" {
		return "app"
	}
	return slug
}

// MonitorTargets 根据 --app / --ide 参数决定目标；未指定时两者都算。
func MonitorTargets(args []string) []app.Config {
	isApp := slices.Contains(args, "--app") || slices.Contains(args, "-app")
	isIDE := slices.Contains(args, "--ide") || slices.Contains(args, "-ide")
	switch {
	case isApp && !isIDE:
		return []app.Config{app.DefaultNormal()}
	case isIDE && !isApp:
		return []app.Config{app.DefaultIDE()}
	default:
		return []app.Config{app.DefaultNormal(), app.DefaultIDE()}
	}
}

// readLockPID 读取锁文件中记录的 PID
func readLockPID(path string) (int32, bool) {
	identity, ok := readMonitorIdentity(path)
	return identity.PID, ok
}

func readMonitorIdentity(path string) (monitorIdentity, bool) {
	data, info, err := safeio.ReadRegularFile(path, 4096)
	if err != nil {
		return monitorIdentity{}, false
	}
	var identity monitorIdentity
	if safeio.VerifyMonitorStorage(info) != nil {
		return identity, false
	}
	if json.Unmarshal(data, &identity) == nil && identity.PID > 0 {
		return identity, true
	}
	// 兼容旧版纯 PID 文本格式。
	pid, err := strconv.ParseInt(strings.TrimSpace(string(data)), 10, 32)
	if err != nil || pid <= 0 {
		return monitorIdentity{}, false
	}
	return monitorIdentity{PID: int32(pid)}, true
}

// isOwnMonitor 判断某个 PID 是否确实是本工具的监视器进程，避免 PID 复用导致误杀
func isOwnMonitor(pid int32) bool {
	proc, err := goprocess.NewProcess(pid)
	if err != nil {
		return false
	}
	if exe, err := proc.Exe(); err == nil && exe != "" {
		self, err := os.Executable()
		return err == nil && isMonitorExecutable(exe, self)
	}
	return false
}

func isMonitorExecutable(exe, self string) bool {
	if safeio.SamePath(exe, self) {
		return true
	}
	// 通过 Go 模块路径校验不同路径下的旧版或重命名监视器二进制。
	info, err := buildinfo.ReadFile(exe)
	return err == nil && info.Path == "antigravity-hans"
}

// AcquireMonitorLock 为某个应用获取独占的监视器锁。
// OS 文件锁持有到监视器退出；状态文件不可写时拒绝启动。
func AcquireMonitorLock(cfg app.Config) (func(), bool) {
	path := monitorLockPath(cfg)
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		fmt.Printf("[错误] 无法创建监视器状态目录: %v\n", err)
		return nil, false
	}
	root, err := os.OpenRoot(filepath.Dir(path))
	if err != nil {
		fmt.Printf("[错误] 无法打开状态目录: %v\n", err)
		return nil, false
	}
	defer root.Close()
	directory, err := root.Stat(".")
	if err != nil {
		fmt.Printf("[错误] 无法检查状态目录: %v\n", err)
		return nil, false
	}
	if err := safeio.VerifyMonitorStorage(directory); err != nil {
		fmt.Printf("[错误] %v\n", err)
		return nil, false
	}
	name := filepath.Base(path)
	if info, err := root.Lstat(name); err == nil && !info.Mode().IsRegular() {
		fmt.Println("[错误] 监视器状态路径不是普通文件，已拒绝启动。")
		return nil, false
	} else if err != nil && !os.IsNotExist(err) {
		fmt.Printf("[错误] 无法检查状态文件: %v\n", err)
		return nil, false
	}
	f, err := root.OpenFile(name, os.O_CREATE|os.O_RDWR|safeio.SafeReadFlags(), 0o600)
	if err != nil {
		fmt.Printf("[错误] 无法打开监视器锁: %v\n", err)
		return nil, false
	}
	info, err := f.Stat()
	if err != nil || !info.Mode().IsRegular() {
		_ = f.Close()
		fmt.Println("[错误] 监视器锁不是普通文件。")
		return nil, false
	}
	if err := safeio.VerifyMonitorStorage(info); err != nil {
		_ = f.Close()
		fmt.Printf("[错误] %v\n", err)
		return nil, false
	}
	if err := safeio.LockFile(f); err != nil {
		_ = f.Close()
		fmt.Printf("[提示] %s 的汉化监视器已在运行或状态文件无法加锁: %v\n", cfg.Name, err)
		fmt.Println("       更新词库或自定义名单时，请先执行 --stop，再重新启动汉化。")
		return nil, false
	}
	closeLock := func() { _ = safeio.UnlockFile(f); _ = f.Close() }

	if identity, ok := readMonitorIdentity(path); ok {
		pid := identity.PID
		if alive, _ := goprocess.PidExists(pid); alive && isOwnMonitor(pid) && matchesMonitorIdentity(identity) {
			fmt.Printf("[提示] 检测到 %s 的汉化监视器已在运行 (PID: %d)，本次不再重复启动。\n", cfg.Name, pid)
			fmt.Printf("       如需结束它，请执行: %s --stop\n", filepath.Base(os.Args[0]))
			closeLock()
			return nil, false
		}
	}

	self, err := goprocess.NewProcess(int32(os.Getpid()))
	if err != nil {
		closeLock()
		return nil, false
	}
	created, err := self.CreateTime()
	if err != nil {
		closeLock()
		fmt.Printf("[错误] 无法核对监视器进程身份: %v\n", err)
		return nil, false
	}
	exe, err := os.Executable()
	if err != nil {
		closeLock()
		return nil, false
	}
	data, _ := json.Marshal(monitorIdentity{PID: int32(os.Getpid()), CreatedAt: created, Executable: exe})
	if err := f.Truncate(0); err != nil {
		closeLock()
		return nil, false
	}
	if _, err := f.WriteAt(data, 0); err != nil {
		closeLock()
		return nil, false
	}
	if err := f.Sync(); err != nil {
		closeLock()
		return nil, false
	}
	var once sync.Once
	return func() { once.Do(func() { _ = f.Truncate(0); closeLock() }) }, true
}

// StopMonitors 结束由本工具启动的汉化监视器进程；不会结束被汉化的应用本身。
func StopMonitors(cfgs []app.Config) {
	stopped := 0
	for _, cfg := range cfgs {
		path := monitorLockPath(cfg)
		identity, ok := readMonitorIdentity(path)
		if !ok {
			continue
		}
		pid := identity.PID
		if alive, _ := goprocess.PidExists(pid); !alive {
			continue
		}
		if !isOwnMonitor(pid) || !matchesMonitorIdentity(identity) {
			fmt.Printf("[警告] PID %d 已不是本工具的监视器（PID 可能被复用），已跳过。\n", pid)
			continue
		}
		p, err := os.FindProcess(int(pid))
		if err != nil {
			fmt.Printf("[错误] 无法定位 %s 的监视器 (PID: %d): %v\n", cfg.Name, pid, err)
			continue
		}
		if err := p.Kill(); err != nil {
			fmt.Printf("[错误] 结束 %s 的监视器 (PID: %d) 失败: %v\n", cfg.Name, pid, err)
			continue
		}
		// 不删除已加锁的状态文件，防止新 inode 绕过文件锁。
		fmt.Printf("[成功] 已结束 %s 的汉化监视器 (PID: %d)。\n", cfg.Name, pid)
		stopped++
	}
	if stopped == 0 {
		fmt.Println("[提示] 未发现正在运行的汉化监视器。")
	}
	fmt.Println("[提示] 被汉化应用的调试端口会保留到该应用退出为止。")
}

func matchesMonitorIdentity(identity monitorIdentity) bool {
	if identity.CreatedAt == 0 {
		return isOwnMonitor(identity.PID)
	}
	p, err := goprocess.NewProcess(identity.PID)
	if err != nil {
		return false
	}
	created, err := p.CreateTime()
	if err != nil || created != identity.CreatedAt {
		return false
	}
	exe, err := p.Exe()
	return err == nil && safeio.SamePath(exe, identity.Executable)
}
