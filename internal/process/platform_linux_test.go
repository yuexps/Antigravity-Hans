//go:build linux

package process

import (
	"bufio"
	"io"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"syscall"
	"testing"
	"time"

	"antigravity-hans/internal/app"
)

func TestSelectLinuxMainProcessPIDs(t *testing.T) {
	dir := t.TempDir()
	normalExe := filepath.Join(dir, "opt", "Antigravity", "antigravity")
	mustWriteRegularFile(t, normalExe, "elf", 0o755)
	mustWriteRegularFile(t, filepath.Join(filepath.Dir(normalExe), "resources", "app.asar"), "asar", 0o644)

	lsExe := filepath.Join(dir, "opt", "Antigravity", "resources", "bin", "language_server")
	mustWriteRegularFile(t, lsExe, "ls", 0o755)

	cfg := app.Config{Name: "Antigravity", Exe: "antigravity"}
	const uid = 1000
	const selfPID int32 = 99999

	procs := []linuxProcInfo{
		// 真正的 Electron 主进程
		{
			PID: 1000, PPID: 1, UID: uid, HasUID: true,
			Name: "antigravity", Exe: normalExe,
			Cmdline: []string{normalExe}, CmdlineReadable: true,
		},
		// Chromium zygote / gpu / broker / utility / renderer 子进程
		{
			PID: 1001, PPID: 1000, UID: uid, HasUID: true,
			Name: "antigravity", Exe: normalExe,
			Cmdline: []string{normalExe, "--type=zygote"}, CmdlineReadable: true,
		},
		{
			PID: 1002, PPID: 1001, UID: uid, HasUID: true,
			Name: "antigravity", Exe: normalExe,
			Cmdline: []string{normalExe, "--type=gpu-process"}, CmdlineReadable: true,
		},
		{
			PID: 1003, PPID: 1002, UID: uid, HasUID: true,
			Name: "antigravity", Exe: normalExe,
			Cmdline: []string{normalExe, "--type=broker"}, CmdlineReadable: true,
		},
		{
			PID: 1004, PPID: 1000, UID: uid, HasUID: true,
			Name: "antigravity", Exe: normalExe,
			Cmdline: []string{normalExe, "--type=utility"}, CmdlineReadable: true,
		},
		{
			PID: 1005, PPID: 1001, UID: uid, HasUID: true,
			Name: "antigravity", Exe: normalExe,
			Cmdline: []string{normalExe, "--type=renderer"}, CmdlineReadable: true,
		},
		// 中间非同二进制子进程 language_server -> 孙进程 sidecar（不含 --type=，但带 ELECTRON_RUN_AS_NODE=1 且祖先是 1000）
		{
			PID: 1006, PPID: 1000, UID: uid, HasUID: true,
			Name: "language_server", Exe: lsExe,
		},
		{
			PID: 1007, PPID: 1006, UID: uid, HasUID: true,
			Name: "antigravity", Exe: normalExe,
			Cmdline: []string{normalExe, "--import=register_loader.js", "main.mjs"}, CmdlineReadable: true,
			RunAsNode: true,
		},
		// 不含 --type= 且无 RunAsNode，但父进程链最终归属主进程 1000 的派生子进程
		{
			PID: 1008, PPID: 1006, UID: uid, HasUID: true,
			Name: "antigravity", Exe: normalExe,
			Cmdline: []string{normalExe, "--helper-worker"}, CmdlineReadable: true,
		},
		// 孤儿 ELECTRON_RUN_AS_NODE 进程（PPID=1，但 RunAsNode=true）
		{
			PID: 1009, PPID: 1, UID: uid, HasUID: true,
			Name: "antigravity", Exe: normalExe,
			Cmdline: []string{normalExe, "cli.js"}, CmdlineReadable: true,
			RunAsNode: true,
		},
		// 其他 Linux 用户的实例（UID 不匹配）
		{
			PID: 2000, PPID: 1, UID: 1001, HasUID: true,
			Name: "antigravity", Exe: normalExe,
			Cmdline: []string{normalExe}, CmdlineReadable: true,
		},
		// Cmdline 不可读（如僵尸态退出瞬间）
		{
			PID: 3000, PPID: 1, UID: uid, HasUID: true,
			Name: "antigravity", Exe: normalExe,
			CmdlineReadable: false,
		},
		// 异常环状 PPID 链防死循环验证
		{
			PID: 4000, PPID: 4001, UID: uid, HasUID: true,
			Name: "antigravity", Exe: normalExe,
			Cmdline: []string{normalExe, "--type=renderer"}, CmdlineReadable: true,
		},
		{
			PID: 4001, PPID: 4000, UID: uid, HasUID: true,
			Name: "other", Exe: "/usr/bin/other",
		},
	}

	got := selectLinuxMainProcessPIDs(procs, cfg, uid, selfPID)
	if !reflect.DeepEqual(got, []int32{1000}) {
		t.Fatalf("selectLinuxMainProcessPIDs = %v, want [1000]", got)
	}
}

// TestLinuxControlledHelperProcess 作为受控子进程入口（仅在设置专用环境变量时运行），
// 用于安全测试 SIGTERM 优雅退出与自定义软链接进程检测，绝不触碰宿主机真实 Antigravity。
func TestLinuxControlledHelperProcess(t *testing.T) {
	role := os.Getenv("AGY_HANS_LINUX_TEST_ROLE")
	if role == "" {
		return
	}
	markerDir := os.Getenv("AGY_HANS_LINUX_TEST_MARKER_DIR")
	selfExe, err := os.Executable()
	if err != nil {
		os.Exit(2)
	}

	switch role {
	case "child":
		markerFile := os.Getenv("AGY_HANS_LINUX_TEST_CHILD_MARKER")
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGTERM)
		_, _ = os.Stdout.WriteString("READY\n")
		select {
		case <-sigCh:
			if markerFile != "" {
				_ = os.WriteFile(markerFile, []byte("child-sigterm"), 0o600)
			}
			os.Exit(0)
		case <-time.After(15 * time.Second):
			os.Exit(0)
		}

	case "main":
		// 启动模拟的 --type=renderer 子进程与 ELECTRON_RUN_AS_NODE=1 sidecar 子进程
		rendererMarker := filepath.Join(markerDir, "renderer-sigterm")
		rendererCmd := exec.Command(selfExe, "-test.run=^TestLinuxControlledHelperProcess$", "--", "--type=renderer")
		rendererCmd.Env = append(os.Environ(),
			"AGY_HANS_LINUX_TEST_ROLE=child",
			"AGY_HANS_LINUX_TEST_CHILD_MARKER="+rendererMarker,
		)
		rendererOut, err := rendererCmd.StdoutPipe()
		if err != nil {
			os.Exit(3)
		}
		if err := rendererCmd.Start(); err != nil {
			os.Exit(4)
		}

		sidecarMarker := filepath.Join(markerDir, "sidecar-sigterm")
		sidecarCmd := exec.Command(selfExe, "-test.run=^TestLinuxControlledHelperProcess$", "--", "--import=sidecar.mjs")
		sidecarCmd.Env = append(os.Environ(),
			"AGY_HANS_LINUX_TEST_ROLE=child",
			"ELECTRON_RUN_AS_NODE=1",
			"AGY_HANS_LINUX_TEST_CHILD_MARKER="+sidecarMarker,
		)
		sidecarOut, err := sidecarCmd.StdoutPipe()
		if err != nil {
			_ = rendererCmd.Process.Kill()
			os.Exit(5)
		}
		if err := sidecarCmd.Start(); err != nil {
			_ = rendererCmd.Process.Kill()
			os.Exit(6)
		}

		waitReadyLine(rendererOut)
		waitReadyLine(sidecarOut)

		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGTERM)
		_, _ = os.Stdout.WriteString("READY\n")

		select {
		case <-sigCh:
			_ = os.WriteFile(filepath.Join(markerDir, "main-sigterm"), []byte("graceful"), 0o600)
			// 模拟主进程退出时清理自身子进程（使用 SIGKILL，与外部 SIGTERM 标记区分）
			_ = rendererCmd.Process.Kill()
			_ = sidecarCmd.Process.Kill()
			_ = rendererCmd.Wait()
			_ = sidecarCmd.Wait()
			os.Exit(0)
		case <-time.After(15 * time.Second):
			_ = rendererCmd.Process.Kill()
			_ = sidecarCmd.Process.Kill()
			os.Exit(1)
		}
	}
}

func waitReadyLine(r io.Reader) {
	sc := bufio.NewScanner(r)
	sc.Scan()
}

func copyTestExecutable(t *testing.T, dst string) {
	t.Helper()
	src, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	in, err := os.Open(src)
	if err != nil {
		t.Fatal(err)
	}
	defer in.Close()

	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		t.Fatal(err)
	}
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := io.Copy(out, in); err != nil {
		_ = out.Close()
		t.Fatal(err)
	}
	if err := out.Close(); err != nil {
		t.Fatal(err)
	}
}

func TestRequestGracefulQuitControlledSubprocessTree(t *testing.T) {
	dir := t.TempDir()
	// 使用完全独立的测试专用二进制名 agy-test-app，绝不可能匹配真实 antigravity
	realInstallDir := filepath.Join(dir, "custom-install")
	realDummyExe := filepath.Join(realInstallDir, "agy-test-app")
	copyTestExecutable(t, realDummyExe)

	symlinkLauncher := filepath.Join(dir, "bin", "agy-test-app")
	if err := os.MkdirAll(filepath.Dir(symlinkLauncher), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(realDummyExe, symlinkLauncher); err != nil {
		t.Fatal(err)
	}

	markerDir := filepath.Join(dir, "markers")
	if err := os.MkdirAll(markerDir, 0o755); err != nil {
		t.Fatal(err)
	}

	// 通过软链接启动受控主进程树
	cmd := exec.Command(symlinkLauncher, "-test.run=^TestLinuxControlledHelperProcess$")
	cmd.Env = append(os.Environ(),
		"AGY_HANS_LINUX_TEST_ROLE=main",
		"AGY_HANS_LINUX_TEST_MARKER_DIR="+markerDir,
	)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	waited := false
	t.Cleanup(func() {
		if cmd.Process != nil && !waited {
			_ = cmd.Process.Kill()
			_ = cmd.Wait()
		}
	})

	waitReadyLine(stdout)

	testCfg := app.Config{
		Name:          "TestDummyElectron",
		Exe:           "agy-test-app",
		Port:          59998,
		PossiblePaths: []string{}, // 故意留空，验证自定义目录软链接启动时 AllPaths 自动收录真实路径
	}

	// 1. 验证 DetectApp 对软链接启动的自定义目录实例能解析出真实路径并写入 AllPaths
	detected := app.Detect(testCfg)
	if !detected.Running {
		t.Fatal("受控测试进程树运行中，DetectApp.Running 应为 true")
	}
	if detected.Path != realDummyExe {
		t.Fatalf("DetectApp.Path = %q, want %q", detected.Path, realDummyExe)
	}
	if !reflect.DeepEqual(detected.AllPaths, []string{realDummyExe}) {
		t.Fatalf("DetectApp.AllPaths = %v, want [%s]", detected.AllPaths, realDummyExe)
	}
	if pids := app.CheckProcessRunning(testCfg, symlinkLauncher); len(pids) < 3 {
		t.Fatalf("CheckProcessRunning 应匹配主进程及同二进制子进程，实际 PIDs=%v", pids)
	}

	// 2. 验证 requestGracefulQuit 仅向主进程发送 SIGTERM 并等待全部进程优雅退出
	if err := quitAndWait(testCfg, requestGracefulQuit, WaitForAppExit); err != nil {
		t.Fatalf("quitAndWait 优雅退出失败: %v", err)
	}
	_ = cmd.Wait()
	waited = true

	if _, err := os.Stat(filepath.Join(markerDir, "main-sigterm")); err != nil {
		t.Fatalf("主进程未收到 SIGTERM 优雅退出信号: %v", err)
	}
	if _, err := os.Stat(filepath.Join(markerDir, "renderer-sigterm")); !os.IsNotExist(err) {
		t.Fatal("--type=renderer 子进程绝不应收到 SIGTERM")
	}
	if _, err := os.Stat(filepath.Join(markerDir, "sidecar-sigterm")); !os.IsNotExist(err) {
		t.Fatal("ELECTRON_RUN_AS_NODE=1 sidecar 子进程绝不应收到 SIGTERM")
	}

	// 3. 进程退出后再次调用 requestGracefulQuit 应返回明确错误
	if err := requestGracefulQuit(testCfg); err == nil {
		t.Fatal("无主进程运行时 requestGracefulQuit 应返回错误")
	}
}

// TestReadOnlyHostAntigravityDetection 在本机存在 /opt/Antigravity/antigravity 时做纯只读核验
// （绝不发送任何信号，也不启动或重启任何进程）。

func TestReadOnlyHostAntigravityDetection(t *testing.T) {
	const hostExe = "/opt/Antigravity/antigravity"
	if _, err := os.Stat(hostExe); err != nil {
		t.Skipf("本机未安装 %s，跳过宿主机只读核验", hostExe)
	}

	normal := app.DefaultNormal()
	detected := app.Detect(normal)
	if !slices.Contains(detected.AllPaths, hostExe) {
		t.Fatalf("Detect(AppNormal).AllPaths = %v，未包含 %s", detected.AllPaths, hostExe)
	}
	for _, p := range detected.AllPaths {
		info, err := os.Lstat(p)
		if err != nil || !info.Mode().IsRegular() {
			t.Fatalf("AllPaths 存在非普通文件或未解软链路径: %s (err=%v)", p, err)
		}
	}

	if detected.Running {
		if detected.Path != hostExe {
			t.Fatalf("运行中的宿主机 Antigravity Path = %q, want %q", detected.Path, hostExe)
		}
		var wouldSignal []int
		err := requestLinuxGracefulQuitWith(normal, func(pid int, sig syscall.Signal) error {
			if sig != syscall.SIGTERM {
				t.Errorf("期望信号 SIGTERM，实际 %v", sig)
			}
			wouldSignal = append(wouldSignal, pid)
			return nil
		})
		if err != nil {
			t.Fatalf("只读演练主进程筛选失败: %v", err)
		}
		if len(wouldSignal) != 1 {
			t.Fatalf("宿主机 Antigravity 应仅筛选出 1 个 Electron 主进程，实际筛选出 %v", wouldSignal)
		}
		cmdlineBytes, err := os.ReadFile(filepath.Join("/proc", itoaInt(wouldSignal[0]), "cmdline"))
		if err == nil && strings.Contains(string(cmdlineBytes), "--type=") {
			t.Fatalf("被选中的 PID %d 含有 --type=，严禁命中 Chromium 子进程", wouldSignal[0])
		}
	}
}

func itoaInt(n int) string {
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}

func mustWriteRegularFile(t *testing.T, path, content string, mode os.FileMode) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), mode); err != nil {
		t.Fatal(err)
	}
}
