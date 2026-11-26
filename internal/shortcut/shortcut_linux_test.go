//go:build linux

package shortcut

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"antigravity-hans/internal/app"
	"antigravity-hans/internal/overlay"
	"antigravity-hans/internal/safeio"
)

func TestCreateChineseShortcutIsolatedXDGAndDesktop(t *testing.T) {
	home := t.TempDir()
	dataHome := filepath.Join(home, "custom-data")
	configHome := filepath.Join(home, "custom-config")
	desktopDir := filepath.Join(home, "桌面")

	if err := os.MkdirAll(configHome, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(desktopDir, 0755); err != nil {
		t.Fatal(err)
	}
	userDirs := "# comment\nXDG_DESKTOP_DIR=\"$HOME/桌面\"\n"
	if err := os.WriteFile(filepath.Join(configHome, "user-dirs.dirs"), []byte(userDirs), 0644); err != nil {
		t.Fatal(err)
	}

	t.Setenv("HOME", home)
	t.Setenv("XDG_DATA_HOME", dataHome)
	t.Setenv("XDG_CONFIG_HOME", configHome)
	t.Setenv("XDG_STATE_HOME", filepath.Join(home, "custom-state"))

	if err := Create(app.DefaultNormal(), Options{}); err != nil {
		t.Fatalf("Create(app.DefaultNormal()) failed: %v", err)
	}

	appDesktop := filepath.Join(dataHome, "applications", "antigravity-hans-app.desktop")
	desktopShortcut := filepath.Join(desktopDir, "antigravity-hans-app.desktop")

	appBytes, err := os.ReadFile(appDesktop)
	if err != nil {
		t.Fatalf("missing menu desktop entry: %v", err)
	}
	appContent := string(appBytes)
	for _, want := range []string{
		"Name=Antigravity 中文",
		"StartupWMClass=Antigravity",
		"--app",
		"--nogui",
		"antigravity-hans.log",
	} {
		if !strings.Contains(appContent, want) {
			t.Fatalf("desktop entry missing %q:\n%s", want, appContent)
		}
	}
	if strings.Contains(appContent, overlay.TrustCustomTranslationsArg) {
		t.Fatalf("unexpected %s in desktop entry", overlay.TrustCustomTranslationsArg)
	}

	info, err := os.Stat(desktopShortcut)
	if err != nil {
		t.Fatalf("missing desktop shortcut: %v", err)
	}
	if info.Mode().Perm() != 0755 {
		t.Fatalf("desktop shortcut mode = %o, want 0755", info.Mode().Perm())
	}

	if validator, err := exec.LookPath("desktop-file-validate"); err == nil {
		if out, err := exec.Command(validator, appDesktop).CombinedOutput(); err != nil {
			t.Fatalf("desktop-file-validate failed: %v\n%s", err, out)
		}
	}
}

func TestCreateLinuxShortcutDesktopEdgeCases(t *testing.T) {
	t.Run("no desktop dir does not create one", func(t *testing.T) {
		home := t.TempDir()
		dataHome := filepath.Join(home, ".local", "share")
		configHome := filepath.Join(home, ".config")
		opts := linuxShortcutOptions{
			SelfExe:    "/usr/local/bin/antigravity-hans",
			HomeDir:    home,
			DataHome:   dataHome,
			ConfigHome: configHome,
		}
		if err := createLinuxShortcut(app.DefaultNormal(), opts); err != nil {
			t.Fatal(err)
		}
		if _, err := os.Stat(filepath.Join(dataHome, "applications", "antigravity-hans-app.desktop")); err != nil {
			t.Fatalf("menu shortcut missing: %v", err)
		}
		if _, err := os.Stat(filepath.Join(home, "Desktop")); !os.IsNotExist(err) {
			t.Fatalf("unexpected Desktop directory created")
		}
	})

	t.Run("desktop dir equal to HOME is skipped", func(t *testing.T) {
		home := t.TempDir()
		dataHome := filepath.Join(home, ".local", "share")
		configHome := filepath.Join(home, ".config")
		if err := os.MkdirAll(configHome, 0755); err != nil {
			t.Fatal(err)
		}
		// 即使存在 ~/Desktop，若 user-dirs.dirs 显式设为 $HOME 也不应写入桌面目录或 $HOME 本身
		if err := os.MkdirAll(filepath.Join(home, "Desktop"), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(configHome, "user-dirs.dirs"), []byte(`XDG_DESKTOP_DIR="$HOME/"`+"\n"), 0644); err != nil {
			t.Fatal(err)
		}
		opts := linuxShortcutOptions{
			SelfExe:    "/usr/local/bin/antigravity-hans",
			HomeDir:    home,
			DataHome:   dataHome,
			ConfigHome: configHome,
		}
		if err := createLinuxShortcut(app.DefaultIDE(), opts); err != nil {
			t.Fatal(err)
		}
		if _, err := os.Stat(filepath.Join(home, "antigravity-hans-ide.desktop")); !os.IsNotExist(err) {
			t.Fatal("wrote desktop file into HOME itself")
		}
		if _, err := os.Stat(filepath.Join(home, "Desktop", "antigravity-hans-ide.desktop")); !os.IsNotExist(err) {
			t.Fatal("wrote desktop file when XDG_DESKTOP_DIR disabled via $HOME")
		}
		if _, err := os.Stat(filepath.Join(dataHome, "applications", "antigravity-hans-ide.desktop")); err != nil {
			t.Fatalf("menu shortcut missing: %v", err)
		}
	})
}

func TestCreateLinuxShortcutReusesOriginalMetadataAndDetectsIcons(t *testing.T) {
	home := t.TempDir()
	dataHome := filepath.Join(home, "data")
	configHome := filepath.Join(home, "config")
	origApps := filepath.Join(dataHome, "applications")
	if err := os.MkdirAll(origApps, 0755); err != nil {
		t.Fatal(err)
	}
	origDesktop := `[Desktop Entry]
Name=Antigravity IDE
Icon=custom-ide-icon
StartupWMClass=Antigravity-IDE-Custom
`
	if err := os.WriteFile(filepath.Join(origApps, "antigravity-ide.desktop"), []byte(origDesktop), 0644); err != nil {
		t.Fatal(err)
	}

	opts := linuxShortcutOptions{
		SelfExe:                 "/opt/hans/antigravity-hans",
		HomeDir:                 home,
		DataHome:                dataHome,
		ConfigHome:              configHome,
		DataDirs:                []string{filepath.Join(home, "empty-sys-data")},
		PixmapDirs:              []string{filepath.Join(home, "empty-pixmaps")},
		TrustCustomTranslations: true,
	}
	if err := createLinuxShortcut(app.DefaultIDE(), opts); err != nil {
		t.Fatal(err)
	}

	gotBytes, err := os.ReadFile(filepath.Join(origApps, "antigravity-hans-ide.desktop"))
	if err != nil {
		t.Fatal(err)
	}
	got := string(gotBytes)
	for _, want := range []string{
		"Name=Antigravity IDE 中文",
		"Icon=custom-ide-icon",
		"StartupWMClass=Antigravity-IDE-Custom",
		"--ide",
		"--nogui",
		overlay.TrustCustomTranslationsArg,
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("missing %q in:\n%s", want, got)
		}
	}

	// 测试应用安装目录下的 resources/app/resources/linux/code.png 探测与兜底
	installDir := filepath.Join(home, "ide-install")
	codeIcon := filepath.Join(installDir, "resources", "app", "resources", "linux", "code.png")
	if err := os.MkdirAll(filepath.Dir(codeIcon), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(codeIcon, []byte("png"), 0644); err != nil {
		t.Fatal(err)
	}
	if icon := detectLinuxIcon(true, "", filepath.Join(home, "no-data"), opts.DataDirs, opts.PixmapDirs, []string{installDir}); icon != codeIcon {
		t.Fatalf("detectLinuxIcon = %q, want %q", icon, codeIcon)
	}
	if icon := detectLinuxIcon(false, "", filepath.Join(home, "no-data"), opts.DataDirs, opts.PixmapDirs, nil); icon != "antigravity" {
		t.Fatalf("fallback icon = %q, want antigravity", icon)
	}
}

func TestCreateLinuxShortcutRejectsSymlinkDestination(t *testing.T) {
	home := t.TempDir()
	dataHome := filepath.Join(home, "data")
	configHome := filepath.Join(home, "config")
	appsDir := filepath.Join(dataHome, "applications")
	if err := os.MkdirAll(appsDir, 0755); err != nil {
		t.Fatal(err)
	}
	victim := filepath.Join(t.TempDir(), "victim")
	if err := os.WriteFile(victim, []byte("keep"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(victim, filepath.Join(appsDir, "antigravity-hans-app.desktop")); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}

	opts := linuxShortcutOptions{
		SelfExe:    "/usr/local/bin/antigravity-hans",
		HomeDir:    home,
		DataHome:   dataHome,
		ConfigHome: configHome,
		DataDirs:   []string{filepath.Join(home, "empty-data")},
		PixmapDirs: []string{filepath.Join(home, "empty-pixmaps")},
	}
	if err := createLinuxShortcut(app.DefaultNormal(), opts); err == nil {
		t.Fatal("accepted symlink destination in applications dir")
	}
	data, err := os.ReadFile(victim)
	if err != nil || string(data) != "keep" {
		t.Fatalf("victim altered: %q %v", data, err)
	}
}

func TestLinuxDesktopExecEscapingSpecialCharacters(t *testing.T) {
	dir := t.TempDir()
	selfDir := filepath.Join(dir, "path with spaces $(touch UNEXPECTED) $HOME `id` 'q' \"dq\" \\bs %20 %U")
	if err := os.MkdirAll(selfDir, 0700); err != nil {
		t.Fatal(err)
	}
	outFile := filepath.Join(dir, "args.txt")
	self := filepath.Join(selfDir, "antigravity-hans")
	script := "#!/bin/sh\nprintf '%s\\n' \"$@\" > " + safeio.ShellQuote(outFile) + "\n"
	if err := os.WriteFile(self, []byte(script), 0700); err != nil {
		t.Fatal(err)
	}

	stateHome := filepath.Join(dir, "state")
	desktopPath := filepath.Join(dir, "test.desktop")
	content := buildLinuxDesktopEntry("Antigravity 中文", "test", self, "--app", "antigravity", "Antigravity", true)
	if err := os.WriteFile(desktopPath, []byte(content), 0755); err != nil {
		t.Fatal(err)
	}

	if validator, err := exec.LookPath("desktop-file-validate"); err == nil {
		if out, err := exec.Command(validator, desktopPath).CombinedOutput(); err != nil {
			t.Fatalf("desktop-file-validate failed: %v\n%s", err, out)
		}
	}

	gio, err := exec.LookPath("gio")
	if err != nil {
		t.Skip("gio not installed, skipping desktop launch execution check")
	}
	cmd := exec.Command(gio, "launch", desktopPath)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "XDG_STATE_HOME="+stateHome)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("gio launch failed: %v\n%s", err, out)
	}

	var got []byte
	for i := 0; i < 40; i++ {
		got, err = os.ReadFile(outFile)
		if err == nil && len(got) > 0 {
			break
		}
		time.Sleep(50 * time.Millisecond)
	}
	want := "--app\n--nogui\n" + overlay.TrustCustomTranslationsArg + "\n"
	if string(got) != want {
		t.Fatalf("launched args = %q, want %q (err=%v)", got, want, err)
	}
	if _, err := os.Stat(filepath.Join(dir, "UNEXPECTED")); !os.IsNotExist(err) {
		t.Fatal("command injection created UNEXPECTED")
	}
	if _, err := os.Stat(filepath.Join(stateHome, "antigravity-hans", "antigravity-hans.log")); err != nil {
		t.Fatalf("expected log file under XDG_STATE_HOME: %v", err)
	}
}
