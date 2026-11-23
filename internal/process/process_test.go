package process

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"sync"
	"testing"
	"time"

	goprocess "github.com/shirou/gopsutil/v4/process"

	"antigravity-hans/internal/app"
)

func TestQuitOrOfferBackgroundCleanup(t *testing.T) {
	quitFailed := errors.New("quit failed")
	cleanupFailed := errors.New("cleanup failed")
	autoFailed := errors.New("auto cleanup failed")
	for _, tt := range []struct {
		name          string
		interactive   bool
		quitErr       error
		cleanupDone   bool
		cleanupErr    error
		autoDone      bool
		autoErr       error
		wantCalls     int
		wantAutoCalls int
		wantErr       error
	}{
		{"normal quit", true, nil, false, nil, false, nil, 0, 0, nil},
		{"noninteractive auto cleanup completed", false, quitFailed, false, nil, true, nil, 0, 1, nil},
		{"noninteractive auto cleanup unavailable", false, quitFailed, false, nil, false, nil, 0, 1, quitFailed},
		{"noninteractive auto cleanup failed", false, quitFailed, false, nil, false, autoFailed, 0, 1, autoFailed},
		{"user declined", true, quitFailed, false, nil, false, nil, 1, 0, quitFailed},
		{"cleanup failed", true, quitFailed, false, cleanupFailed, false, nil, 1, 0, cleanupFailed},
		{"cleanup completed", true, quitFailed, true, nil, false, nil, 1, 0, nil},
	} {
		t.Run(tt.name, func(t *testing.T) {
			calls, autoCalls := 0, 0
			err := quitOrOfferBackgroundCleanup(tt.interactive, func() error { return tt.quitErr }, func() (bool, error) {
				calls++
				return tt.cleanupDone, tt.cleanupErr
			}, func() (bool, error) {
				autoCalls++
				return tt.autoDone, tt.autoErr
			})
			if calls != tt.wantCalls || autoCalls != tt.wantAutoCalls || !errors.Is(err, tt.wantErr) {
				t.Fatalf("cleanup calls=%d auto calls=%d error=%v; want calls=%d auto calls=%d error=%v",
					calls, autoCalls, err, tt.wantCalls, tt.wantAutoCalls, tt.wantErr)
			}
		})
	}
}

func TestQuitCancellationAbortsRestart(t *testing.T) {
	normal := app.DefaultNormal()
	waited := false
	err := quitAndWait(normal, func(app.Config) error { return errors.New("user cancelled") }, func(app.Config, time.Duration) bool { waited = true; return true })
	if err == nil || waited {
		t.Fatalf("cancelled quit must not proceed: error=%v waited=%v", err, waited)
	}
	if err := quitAndWait(normal, func(app.Config) error { return nil }, func(app.Config, time.Duration) bool { return false }); err == nil {
		t.Fatal("timeout accepted as successful exit")
	}
	if err := quitAndWait(normal, func(app.Config) error { return nil }, func(app.Config, time.Duration) bool { return true }); err != nil {
		t.Fatal(err)
	}
}

func TestAcquireMonitorLockIsExclusive(t *testing.T) {
	monitorStateDirOverride = t.TempDir()
	defer func() { monitorStateDirOverride = "" }()

	cfg := app.Config{Kind: app.KindNormal, Name: "Antigravity", Port: 58321}

	release, ok := AcquireMonitorLock(cfg)
	if !ok {
		t.Fatal("首次获取锁应当成功")
	}
	if _, ok := AcquireMonitorLock(cfg); ok {
		t.Fatal("重复获取锁应当失败，避免重复监视器")
	}
	release()

	if release, ok := AcquireMonitorLock(cfg); !ok {
		t.Fatal("释放后应当可以再次获取锁")
	} else {
		t.Cleanup(release)
	}
}

func TestAcquireMonitorLockOverridesStalePID(t *testing.T) {
	monitorStateDirOverride = t.TempDir()
	defer func() { monitorStateDirOverride = "" }()

	cfg := app.Config{Kind: app.KindIDE, Name: "Antigravity IDE", Port: 58322}
	path := monitorLockPath(cfg)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(strconv.Itoa(1<<30)), 0o600); err != nil {
		t.Fatal(err)
	}
	if release, ok := AcquireMonitorLock(cfg); !ok {
		t.Fatal("残留锁文件不应阻断启动")
	} else {
		t.Cleanup(release)
	}
}

func TestMonitorLockPathIsPerApp(t *testing.T) {
	monitorStateDirOverride = t.TempDir()
	defer func() { monitorStateDirOverride = "" }()

	normal := app.DefaultNormal()
	ide := app.DefaultIDE()
	if monitorLockPath(normal) == monitorLockPath(ide) {
		t.Fatal("两个应用应使用不同的锁文件，以便同时汉化")
	}
	if monitorLockPath(normal) != monitorLockPath(app.Config{Name: "Antigravity", Port: 58999}) {
		t.Fatal("锁文件不应随端口变化（运行期可能改用备用端口）")
	}
	want := filepath.Join(monitorStateDirOverride, "monitor-antigravity-ide.pid")
	if got := monitorLockPath(ide); got != want {
		t.Fatalf("锁文件命名不符合预期: %s", got)
	}
}

func TestMonitorLockConcurrentContenders(t *testing.T) {
	monitorStateDirOverride = t.TempDir()
	defer func() { monitorStateDirOverride = "" }()
	normal := app.DefaultNormal()
	start := make(chan struct{})
	releases := make(chan func(), 32)
	var wg sync.WaitGroup
	for i := 0; i < 32; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			if release, ok := AcquireMonitorLock(normal); ok {
				releases <- release
			}
		}()
	}
	close(start)
	wg.Wait()
	close(releases)
	winners := len(releases)
	for release := range releases {
		release()
		release()
	}
	if winners != 1 {
		t.Fatalf("expected exactly one monitor, got %d", winners)
	}
}

func TestMonitorLockAcrossProcesses(t *testing.T) {
	monitorStateDirOverride = t.TempDir()
	defer func() { monitorStateDirOverride = "" }()
	release, ok := AcquireMonitorLock(app.DefaultNormal())
	if !ok {
		t.Fatal("parent cannot acquire lock")
	}
	defer release()
	cmd := exec.Command(os.Args[0], "-test.run=^TestMonitorLockChild$")
	cmd.Env = append(os.Environ(), "AGY_HANS_LOCK_TEST_DIR="+monitorStateDirOverride)
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("second process acquired held lock: %v\n%s", err, output)
	}
}

func TestMonitorLockChild(t *testing.T) {
	dir := os.Getenv("AGY_HANS_LOCK_TEST_DIR")
	if dir == "" {
		t.Skip("subprocess helper")
	}
	monitorStateDirOverride = dir
	if release, ok := AcquireMonitorLock(app.DefaultNormal()); ok {
		release()
		t.Fatal("lock held by parent must be unavailable")
	}
}

func TestMonitorIdentityRejectsPIDReuse(t *testing.T) {
	self, err := readSelfMonitorIdentity()
	if err != nil {
		t.Fatal(err)
	}
	if !matchesMonitorIdentity(self) {
		t.Fatal("current identity rejected")
	}
	self.CreatedAt++
	if matchesMonitorIdentity(self) {
		t.Fatal("creation time mismatch accepted")
	}
}

func readSelfMonitorIdentity() (monitorIdentity, error) {
	p, err := os.Executable()
	if err != nil {
		return monitorIdentity{}, err
	}
	proc, err := goprocess.NewProcess(int32(os.Getpid()))
	if err != nil {
		return monitorIdentity{}, err
	}
	created, err := proc.CreateTime()
	return monitorIdentity{PID: int32(os.Getpid()), CreatedAt: created, Executable: p}, err
}

func TestMonitorLockRejectsSymlink(t *testing.T) {
	monitorStateDirOverride = t.TempDir()
	defer func() { monitorStateDirOverride = "" }()
	normal := app.DefaultNormal()
	victim := filepath.Join(t.TempDir(), "victim")
	if err := os.WriteFile(victim, []byte("original"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(victim, monitorLockPath(normal)); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}
	if release, ok := AcquireMonitorLock(normal); ok {
		release()
		t.Fatal("symlink lock accepted")
	}
	data, _ := os.ReadFile(victim)
	if string(data) != "original" {
		t.Fatal("lock changed unrelated file")
	}
}

func TestMonitorExecutableDoesNotTrustFilenameAlone(t *testing.T) {
	self, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	if !isMonitorExecutable(self, self) {
		t.Fatal("own executable rejected")
	}
	fake := filepath.Join(t.TempDir(), "antigravity-hans-fake")
	if err := os.WriteFile(fake, []byte("not a Go monitor"), 0700); err != nil {
		t.Fatal(err)
	}
	if isMonitorExecutable(fake, self) {
		t.Fatal("process filename accepted without executable identity")
	}
}
