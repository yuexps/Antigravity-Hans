//go:build linux

package app

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestLinuxConfigDefaults(t *testing.T) {
	if !IsLinux {
		t.Fatal("IsLinux 在 linux 构建下应为 true")
	}
	normal := DefaultNormal()
	if normal.Exe != "antigravity" {
		t.Fatalf("AppNormal.Exe = %q, want %q", normal.Exe, "antigravity")
	}
	ide := DefaultIDE()
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
	normalCfg := Config{Name: "Antigravity", Exe: "antigravity"}
	ideCfg := Config{Name: "Antigravity IDE", Exe: "antigravity-ide"}

	if !IsExpectedExecutable(normalExe, normalCfg) || IsExpectedExecutable(normalExe, ideCfg) {
		t.Fatal("2.x 普通版二进制应仅匹配 AppNormal，拒绝匹配 AppIDE")
	}
	if !IsExpectedExecutable(sameNameIDEExe, ideCfg) || IsExpectedExecutable(sameNameIDEExe, normalCfg) {
		t.Fatal("含 workbench 的同名 /usr/share/antigravity/antigravity 应仅匹配 AppIDE，拒绝匹配 AppNormal")
	}
	if !IsExpectedExecutable(stdIDEExe, ideCfg) || IsExpectedExecutable(stdIDEExe, normalCfg) {
		t.Fatal("标准 antigravity-ide 应仅匹配 AppIDE")
	}

	if !IsProcessMatch("antigravity", normalExe, normalCfg) || IsProcessMatch("antigravity", normalExe, ideCfg) {
		t.Fatal("isProcessMatch 对 2.x 普通版区分有误")
	}
	if !IsProcessMatch("antigravity", sameNameIDEExe, ideCfg) || IsProcessMatch("antigravity", sameNameIDEExe, normalCfg) {
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
	normalCfg := Config{Name: "Antigravity", Exe: "antigravity"}
	for _, p := range gotNormal {
		if !IsExpectedExecutable(p, normalCfg) {
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

	cfg := Config{
		Name:          "TestDetectDummy",
		Exe:           "agy-detect-dummy",
		Port:          59999,
		PossiblePaths: []string{link1, link2, realExe},
	}
	detected := Detect(cfg)
	if !reflect.DeepEqual(detected.AllPaths, []string{realExe}) {
		t.Fatalf("DetectApp AllPaths 未正确解软链去重: got %v, want [%s]", detected.AllPaths, realExe)
	}
	if detected.Path != realExe {
		t.Fatalf("单实例 Path = %q, want %q", detected.Path, realExe)
	}
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
