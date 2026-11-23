//go:build linux

package patch

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"antigravity-hans/internal/app"
)

func TestLinuxLangcheckPathsAndCLI(t *testing.T) {
	home := t.TempDir()
	configHome := filepath.Join(home, "xdg-cfg")
	t.Setenv("HOME", home)
	t.Setenv("XDG_CONFIG_HOME", configHome)

	argvPaths := getIDEArgvPaths()
	wantArgv := []string{
		filepath.Join(configHome, "Antigravity IDE", "argv.json"),
		filepath.Join(home, ".antigravity-ide", "argv.json"),
	}
	if len(argvPaths) != len(wantArgv) || argvPaths[0] != wantArgv[0] || argvPaths[1] != wantArgv[1] {
		t.Fatalf("getIDEArgvPaths() = %v, want %v", argvPaths, wantArgv)
	}

	extDirs := getIDEExtensionsDirs()
	for _, want := range []string{
		filepath.Join(home, ".antigravity-ide", "extensions"),
		filepath.Join(configHome, "Antigravity IDE", "User", "extensions"),
		filepath.Join(home, ".config", "Antigravity IDE", "extensions"),
	} {
		if !slices.Contains(extDirs, want) {
			t.Fatalf("getIDEExtensionsDirs() = %v missing %q", extDirs, want)
		}
	}

	binDir := t.TempDir()
	fakeCLI := filepath.Join(binDir, "antigravity-ide")
	if err := os.WriteFile(fakeCLI, []byte("#!/bin/sh\nexit 0\n"), 0755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", binDir+string(os.PathListSeparator)+os.Getenv("PATH"))
	if got := getIDECLIPath(); got == "" {
		t.Fatal("getIDECLIPath() returned empty when antigravity-ide is on PATH")
	}
}

func TestPatchSymlinkResolutionAndLinuxPermissionHint(t *testing.T) {
	root := t.TempDir()
	realDir := filepath.Join(root, "opt", "Antigravity IDE")
	binDir := filepath.Join(root, "usr", "bin")
	if err := os.MkdirAll(filepath.Join(realDir, "resources"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(binDir, 0755); err != nil {
		t.Fatal(err)
	}
	realExe := filepath.Join(realDir, "antigravity-ide")
	if err := os.WriteFile(realExe, []byte("bin"), 0755); err != nil {
		t.Fatal(err)
	}
	linkExe := filepath.Join(binDir, "antigravity-ide")
	if err := os.Symlink(realExe, linkExe); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}

	cfg := app.Config{
		Kind:          app.KindIDE,
		Name:          "Antigravity IDE",
		Exe:           "antigravity-ide",
		PossiblePaths: []string{linkExe, realExe},
	}

	apps := GetInstalledIDEApps(cfg)
	if len(apps) != 1 {
		t.Fatalf("expected deduplicated 1 app, got %d: %+v", len(apps), apps)
	}
	if apps[0].ExePath != realExe || apps[0].Dir != realDir {
		t.Fatalf("unexpected resolved app: %+v", apps[0])
	}
	if resDir := getResourcesDir(apps[0]); resDir != filepath.Join(realDir, "resources") {
		t.Fatalf("getResourcesDir = %q, want %q", resDir, filepath.Join(realDir, "resources"))
	}

	hint := patchPermissionHintForOS("linux")
	if !strings.Contains(hint, "sudo ./antigravity-hans --patch") {
		t.Fatalf("unexpected linux permission hint: %q", hint)
	}
	if strings.Contains(hint, "Program Files") || strings.Contains(hint, "管理员") {
		t.Fatalf("linux permission hint contains Windows wording: %q", hint)
	}

	if os.Geteuid() != 0 {
		roDir := filepath.Join(root, "ro-install")
		wbDir := filepath.Join(roDir, "resources", "app", "out", "vs", "code", "electron-browser", "workbench")
		if err := os.MkdirAll(wbDir, 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(roDir, "resources", "app", "package.json"), []byte("{}"), 0644); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(wbDir, "workbench.html.bak"), []byte("<html></html>"), 0644); err != nil {
			t.Fatal(err)
		}
		if err := os.Chmod(wbDir, 0555); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = os.Chmod(wbDir, 0755) })

		inst := AppInstance{
			Name:    "ro-fixture",
			Exe:     "never-running-ide",
			ExePath: filepath.Join(roDir, "never-running-ide"),
			Dir:     roDir,
		}
		if Install(cfg, inst, "test") {
			t.Fatal("Install succeeded on read-only workbenchDir")
		}
		if Uninstall(cfg, inst) {
			t.Fatal("Uninstall succeeded on read-only workbenchDir")
		}
	}
}
