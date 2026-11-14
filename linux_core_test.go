//go:build linux

package main

import (
	"bufio"
	"io"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"reflect"
	"strings"
	"syscall"
	"testing"
	"time"
)

func TestLinuxConfigDefaults(t *testing.T) {
	if !IsLinux {
		t.Fatal("IsLinux 在 linux 构建下应为 true")
	}
	normal := buildAppNormal()
	if normal.Exe != "antigravity" {
		t.Fatalf("AppNormal.Exe = %q, want %q", normal.Exe, "antigravity")
	}
	ide := buildAppIDE()
	if ide.Exe != "antigravity-ide" {
		t.Fatalf("AppIDE.Exe = %q, want %q", ide.Exe, "antigravity-ide")
	}
}

func TestParseDesktopExecCommand(t *testing.T) {
	tests := []struct {
		name   string
		exec   string
		want   string
		wantOK bool
	}{
		{
			name:   "standard deb/aur desktop entry",
			exec:   "/usr/bin/antigravity %U",
			want:   "/usr/bin/antigravity",
			wantOK: true,
		},
		{
			name:   "double quoted path with spaces",
			exec:   `"/opt/Antigravity IDE/antigravity-ide" --unity-launch %F`,
			want:   "/opt/Antigravity IDE/antigravity-ide",
			wantOK: true,
		},
		{
			name:   "backslash escaped space in path",
			exec:   `/opt/Antigravity\ IDE/antigravity-ide %F`,
			want:   "/opt/Antigravity IDE/antigravity-ide",
			wantOK: true,
		},
		{
			name:   "env wrapper with wayland variables",
			exec:   `env ELECTRON_OZONE_PLATFORM_HINT=auto "/opt/Antigravity/antigravity" %U`,
			want:   "/opt/Antigravity/antigravity",
			wantOK: true,
		},
		{
			name:   "usr bin env with unset flag",
			exec:   `/usr/bin/env -u WAYLAND_DISPLAY GDK_BACKEND=x11 /opt/Antigravity/antigravity %u`,
			want:   "/opt/Antigravity/antigravity",
			wantOK: true,
		},
		{
			name:   "bare command name",
			exec:   "antigravity %U",
			want:   "antigravity",
			wantOK: true,
		},
		{
			name:   "escaped literal percent in path",
			exec:   `"/opt/Antigravity%%20Test/antigravity" %U`,
			want:   "/opt/Antigravity%20Test/antigravity",
			wantOK: true,
		},
		{
			name:   "reject shell launcher from antigravity-hans shortcut",
			exec:   `/bin/sh -c "nohup '/tmp/antigravity-hans' '--app' --nogui &"`,
			want:   "",
			wantOK: false,
		},
		{
			name:   "reject direct antigravity-hans binary",
			exec:   `/usr/local/bin/antigravity-hans --app --nogui`,
			want:   "",
			wantOK: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := parseDesktopExecCommand(tt.exec)
			if ok != tt.wantOK || got != tt.want {
				t.Fatalf("parseDesktopExecCommand(%q) = (%q, %v), want (%q, %v)", tt.exec, got, ok, tt.want, tt.wantOK)
			}
		})
	}
}

func TestLinuxNormalVsIDEDirectoryDisambiguation(t *testing.T) {
	root := t.TempDir()
	home := filepath.Join(root, "home", "tester")

	// 1. 2.x 普通版（/opt/Antigravity/antigravity + resources/app.asar）
	normalDir := filepath.Join(root, "opt", "Antigravity")
	normalExe := filepath.Join(normalDir, "antigravity")
	mustWriteRegularFile(t, normalExe, "elf-normal", 0o755)
	mustWriteRegularFile(t, filepath.Join(normalDir, "resources", "app.asar"), "asar", 0o644)

	// 2. 同名二进制的 1.x IDE（/usr/share/antigravity/antigravity + workbench 目录）
	sameNameIDEDir := filepath.Join(root, "usr", "share", "antigravity")
	sameNameIDEExe := filepath.Join(sameNameIDEDir, "antigravity")
	mustWriteRegularFile(t, sameNameIDEExe, "elf-ide-samename", 0o755)
	if err := os.MkdirAll(filepath.Join(sameNameIDEDir, "resources", "app", "out", "vs", "code", "electron-browser", "workbench"), 0o755); err != nil {
		t.Fatal(err)
	}

	// 3. 标准命名的 1.x IDE（/opt/Antigravity IDE/antigravity-ide + workbench 目录）
	stdIDEDir := filepath.Join(root, "opt", "Antigravity IDE")
	stdIDEExe := filepath.Join(stdIDEDir, "antigravity-ide")
	mustWriteRegularFile(t, stdIDEExe, "elf-ide-std", 0o755)
	if err := os.MkdirAll(filepath.Join(stdIDEDir, "resources", "app", "out", "vs", "code", "electron-browser", "workbench"), 0o755); err != nil {
		t.Fatal(err)
	}

	if got := classifyLinuxInstallDir(normalDir); got != linuxAppNormal {
		t.Fatalf("classifyLinuxInstallDir(normalDir) = %v, want linuxAppNormal", got)
	}
	if got := classifyLinuxInstallDir(sameNameIDEDir); got != linuxAppIDE {
		t.Fatalf("classifyLinuxInstallDir(sameNameIDEDir) = %v, want linuxAppIDE", got)
	}
	if got := classifyLinuxInstallDir(stdIDEDir); got != linuxAppIDE {
		t.Fatalf("classifyLinuxInstallDir(stdIDEDir) = %v, want linuxAppIDE", got)
	}

	env := linuxDiscoveryEnv{
		HomeDir:     home,
		DesktopDirs: []string{},
		RootPrefix:  root,
		LookPath: func(name string) (string, error) {
			if name == "antigravity" {
				// 即使 PATH 中的 antigravity 指向 1.x IDE 目录，普通版探测也不得误收
				return sameNameIDEExe, nil
			}
			return "", os.ErrNotExist
		},
	}

	normalPaths := discoverLinuxPathsWith(false, env)
	if !reflect.DeepEqual(normalPaths, []string{normalExe}) {
		t.Fatalf("Normal paths = %v, want [%s]", normalPaths, normalExe)
	}

	idePaths := discoverLinuxPathsWith(true, env)
	wantIDE := []string{sameNameIDEExe, stdIDEExe}
	if !reflect.DeepEqual(idePaths, wantIDE) {
		t.Fatalf("IDE paths = %v, want %v", idePaths, wantIDE)
	}

	// 校验 isExpectedExecutable 与 isProcessMatch 的跨版本互斥性
	normalCfg := AppConfig{Name: "Antigravity", Exe: "antigravity"}
	ideCfg := AppConfig{Name: "Antigravity IDE", Exe: "antigravity-ide"}

	if !isExpectedExecutable(normalExe, normalCfg) || isExpectedExecutable(normalExe, ideCfg) {
		t.Fatal("2.x 普通版二进制应仅匹配 AppNormal，拒绝匹配 AppIDE")
	}
	if !isExpectedExecutable(sameNameIDEExe, ideCfg) || isExpectedExecutable(sameNameIDEExe, normalCfg) {
		t.Fatal("含 workbench 的同名 /usr/share/antigravity/antigravity 应仅匹配 AppIDE，拒绝匹配 AppNormal")
	}
	if !isExpectedExecutable(stdIDEExe, ideCfg) || isExpectedExecutable(stdIDEExe, normalCfg) {
		t.Fatal("标准 antigravity-ide 应仅匹配 AppIDE")
	}

	if !isProcessMatch("antigravity", normalExe, normalCfg) || isProcessMatch("antigravity", normalExe, ideCfg) {
		t.Fatal("isProcessMatch 对 2.x 普通版区分有误")
	}
	if !isProcessMatch("antigravity", sameNameIDEExe, ideCfg) || isProcessMatch("antigravity", sameNameIDEExe, normalCfg) {
		t.Fatal("isProcessMatch 对同名 1.x IDE 区分有误")
	}
}

func TestLinuxPathDiscoverySymlinksDesktopEnvBinWrapperAndAppImage(t *testing.T) {
	root := t.TempDir()
	home := filepath.Join(root, "home", "tester")
	appsDir := filepath.Join(home, ".local", "share", "applications")
	if err := os.MkdirAll(appsDir, 0o755); err != nil {
		t.Fatal(err)
	}

	// 真实安装：/opt/Antigravity/antigravity，软链接：/usr/bin/antigravity -> /opt/Antigravity/antigravity
	realNormal := filepath.Join(root, "opt", "Antigravity", "antigravity")
	mustWriteRegularFile(t, realNormal, "elf", 0o755)
	mustWriteRegularFile(t, filepath.Join(filepath.Dir(realNormal), "resources", "app.asar"), "asar", 0o644)

	usrBin := filepath.Join(root, "usr", "bin")
	if err := os.MkdirAll(usrBin, 0o755); err != nil {
		t.Fatal(err)
	}
	symlinkNormal := filepath.Join(usrBin, "antigravity")
	if err := os.Symlink(realNormal, symlinkNormal); err != nil {
		t.Fatal(err)
	}

	// .desktop 同时存在原版 antigravity.desktop 与本工具生成的 antigravity-hans-app.desktop
	mustWriteRegularFile(t, filepath.Join(appsDir, "antigravity.desktop"), "[Desktop Entry]\nName=Antigravity\nExec="+symlinkNormal+" %U\n", 0o644)
	mustWriteRegularFile(t, filepath.Join(appsDir, "antigravity-hans-app.desktop"), "[Desktop Entry]\nName=Antigravity 中文\nExec=/bin/sh -c \"antigravity-hans --app --nogui\"\n", 0o644)

	// AppImage 位于 ~/Applications
	normalAppImage := filepath.Join(home, "Applications", "Antigravity-2.32.0-x86_64.AppImage")
	ideAppImage := filepath.Join(home, "Applications", "Antigravity-IDE-1.10.0-x86_64.AppImage")
	mustWriteRegularFile(t, normalAppImage, "appimage-normal", 0o755)
	mustWriteRegularFile(t, ideAppImage, "appimage-ide", 0o755)

	// Flatpak 部署结构
	flatpakNormal := filepath.Join(root, "var", "lib", "flatpak", "app", "com.google.Antigravity", "current", "active", "files", "extra", "antigravity", "antigravity")
	mustWriteRegularFile(t, flatpakNormal, "flatpak-normal", 0o755)
	mustWriteRegularFile(t, filepath.Join(filepath.Dir(flatpakNormal), "resources", "app.asar"), "asar", 0o644)

	// 环境变量覆盖（通过软链接指向自定义目录）
	customReal := filepath.Join(root, "custom", "Antigravity", "antigravity")
	mustWriteRegularFile(t, customReal, "custom-normal", 0o755)
	customLink := filepath.Join(root, "custom-link-antigravity")
	if err := os.Symlink(customReal, customLink); err != nil {
		t.Fatal(err)
	}

	env := linuxDiscoveryEnv{
		HomeDir:     home,
		EnvAppPath:  customLink,
		DesktopDirs: []string{appsDir},
		RootPrefix:  root,
		LookPath: func(name string) (string, error) {
			if name == "antigravity" {
				return symlinkNormal, nil
			}
			return "", os.ErrNotExist
		},
	}

	gotNormal := discoverLinuxPathsWith(false, env)
	wantNormal := []string{customReal, realNormal, flatpakNormal, normalAppImage}
	if !reflect.DeepEqual(gotNormal, wantNormal) {
		t.Fatalf("gotNormal = %v\nwantNormal = %v", gotNormal, wantNormal)
	}
	normalCfg := AppConfig{Name: "Antigravity", Exe: "antigravity"}
	for _, p := range gotNormal {
		if !isExpectedExecutable(p, normalCfg) {
			t.Fatalf("发现的路径未通过非符号链接可执行文件校验: %s", p)
		}
	}

	// 验证 IDE 的 bin/ 包装脚本回溯到父目录真实 Electron 主程序
	ideRoot := filepath.Join(root, "usr", "share", "antigravity-ide")
	realIDE := filepath.Join(ideRoot, "antigravity-ide")
	cliWrapper := filepath.Join(ideRoot, "bin", "antigravity-ide")
	mustWriteRegularFile(t, realIDE, "elf-ide", 0o755)
	mustWriteRegularFile(t, cliWrapper, "#!/usr/bin/env sh\n", 0o755)
	if err := os.MkdirAll(filepath.Join(ideRoot, "resources", "app", "out", "vs", "code", "electron-browser", "workbench"), 0o755); err != nil {
		t.Fatal(err)
	}
	usrBinIDE := filepath.Join(usrBin, "antigravity-ide")
	if err := os.Symlink(cliWrapper, usrBinIDE); err != nil {
		t.Fatal(err)
	}

	ideEnv := linuxDiscoveryEnv{
		HomeDir:     home,
		DesktopDirs: []string{appsDir},
		RootPrefix:  root,
		LookPath: func(name string) (string, error) {
			if name == "antigravity-ide" {
				return usrBinIDE, nil
			}
			return "", os.ErrNotExist
		},
	}
	gotIDE := discoverLinuxPathsWith(true, ideEnv)
	wantIDE := []string{realIDE, ideAppImage}
	if !reflect.DeepEqual(gotIDE, wantIDE) {
		t.Fatalf("gotIDE = %v\nwantIDE = %v", gotIDE, wantIDE)
	}
}

func TestDetectAppResolvesSymlinksAndDeduplicates(t *testing.T) {
	dir := t.TempDir()
	realDir := filepath.Join(dir, "real")
	realExe := filepath.Join(realDir, "agy-detect-dummy")
	mustWriteRegularFile(t, realExe, "dummy", 0o755)

	link1 := filepath.Join(dir, "link1")
	link2 := filepath.Join(dir, "link2")
	if err := os.Symlink(realExe, link1); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(link1, link2); err != nil {
		t.Fatal(err)
	}

	cfg := AppConfig{
		Name:          "TestDetectDummy",
		Exe:           "agy-detect-dummy",
		Port:          59999,
		PossiblePaths: []string{link1, link2, realExe},
	}
	detected := DetectApp(cfg)
	if !reflect.DeepEqual(detected.AllPaths, []string{realExe}) {
		t.Fatalf("DetectApp AllPaths 未正确解软链去重: got %v, want [%s]", detected.AllPaths, realExe)
	}
	if detected.Path != realExe {
		t.Fatalf("单实例 Path = %q, want %q", detected.Path, realExe)
	}
}

func TestSelectLinuxMainProcessPIDs(t *testing.T) {
	dir := t.TempDir()
	normalExe := filepath.Join(dir, "opt", "Antigravity", "antigravity")
	mustWriteRegularFile(t, normalExe, "elf", 0o755)
	mustWriteRegularFile(t, filepath.Join(filepath.Dir(normalExe), "resources", "app.asar"), "asar", 0o644)

	lsExe := filepath.Join(dir, "opt", "Antigravity", "resources", "bin", "language_server")
	mustWriteRegularFile(t, lsExe, "ls", 0o755)

	cfg := AppConfig{Name: "Antigravity", Exe: "antigravity"}
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

	testCfg := AppConfig{
		Name:          "TestDummyElectron",
		Exe:           "agy-test-app",
		Port:          59998,
		PossiblePaths: []string{}, // 故意留空，验证自定义目录软链接启动时 AllPaths 自动收录真实路径
	}

	// 1. 验证 DetectApp 对软链接启动的自定义目录实例能解析出真实路径并写入 AllPaths
	detected := DetectApp(testCfg)
	if !detected.Running {
		t.Fatal("受控测试进程树运行中，DetectApp.Running 应为 true")
	}
	if detected.Path != realDummyExe {
		t.Fatalf("DetectApp.Path = %q, want %q", detected.Path, realDummyExe)
	}
	if !reflect.DeepEqual(detected.AllPaths, []string{realDummyExe}) {
		t.Fatalf("DetectApp.AllPaths = %v, want [%s]", detected.AllPaths, realDummyExe)
	}
	if pids := CheckProcessRunning(testCfg, symlinkLauncher); len(pids) < 3 {
		t.Fatalf("CheckProcessRunning 应匹配主进程及同二进制子进程，实际 PIDs=%v", pids)
	}

	// 2. 验证 requestGracefulQuit 仅向主进程发送 SIGTERM 并等待全部进程优雅退出
	if err := quitAndWait(testCfg, requestGracefulQuit, waitForAppExit); err != nil {
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

	normal := buildAppNormal()
	detected := DetectApp(normal)
	if !containsStr(detected.AllPaths, hostExe) {
		t.Fatalf("DetectApp(AppNormal).AllPaths = %v，未包含 %s", detected.AllPaths, hostExe)
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
		// 使用纯记录空函数（不发任何信号！）核查主进程筛选结果
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
