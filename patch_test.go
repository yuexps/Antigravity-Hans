package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestInstallPatchUpdatesExistingScriptWithoutOverwritingOtherFiles(t *testing.T) {
	previousIDE := AppIDE
	AppIDE = AppConfig{Name: "patch-test-never-running", Exe: "patch-test-never-running.exe"}
	t.Cleanup(func() { AppIDE = previousIDE })

	installDir := filepath.Join(t.TempDir(), "installation")
	appDir := filepath.Join(installDir, "resources", "app")
	workbenchDir := filepath.Join(appDir, "out", "vs", "code", "electron-browser", "workbench")
	if err := os.MkdirAll(workbenchDir, 0700); err != nil {
		t.Fatal(err)
	}
	for name, content := range map[string]string{
		filepath.Join(appDir, "package.json"):             "{}",
		filepath.Join(workbenchDir, "workbench.html"):     "<html><body></body></html>",
		filepath.Join(workbenchDir, ".write_test"):        "existing user data",
		filepath.Join(workbenchDir, "workbench.html.tmp"): "existing temporary data",
	} {
		if err := os.WriteFile(name, []byte(content), 0600); err != nil {
			t.Fatal(err)
		}
	}
	inst := PatchAppInstance{Name: "isolated fixture", Dir: installDir, ExePath: filepath.Join(installDir, "patch-test-never-running.exe")}
	oldSource := customTranslationsPrelude([]customTranslation{{Source: "Turbo", Target: "OLD"}}) + "old script"
	if !InstallPatch(inst, oldSource) {
		t.Fatal("initial install failed")
	}
	htmlPath := filepath.Join(workbenchDir, "workbench.html")
	htmlBefore, err := os.ReadFile(htmlPath)
	if err != nil {
		t.Fatal(err)
	}
	backupBefore, err := os.ReadFile(htmlPath + ".bak")
	if err != nil {
		t.Fatal(err)
	}
	newSource := customTranslationsPrelude(nil) + "new script"
	if !InstallPatch(inst, newSource) {
		t.Fatal("updating the installed script failed")
	}
	for name, want := range map[string]string{
		filepath.Join(workbenchDir, "antigravity-hans-overlay.js"): newSource,
		filepath.Join(workbenchDir, ".write_test"):                 "existing user data",
		filepath.Join(workbenchDir, "workbench.html.tmp"):          "existing temporary data",
		htmlPath:          string(htmlBefore),
		htmlPath + ".bak": string(backupBefore),
	} {
		data, err := os.ReadFile(name)
		if err != nil || string(data) != want {
			t.Fatalf("unexpected contents in %s: %q, %v", name, data, err)
		}
	}
	entries, err := os.ReadDir(workbenchDir)
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".agy-hans-write-") {
			t.Fatalf("write probe left behind: %s", entry.Name())
		}
	}
}

func TestWritePatchOverlayDoesNotFollowSymlink(t *testing.T) {
	root := t.TempDir()
	victim := filepath.Join(t.TempDir(), "victim")
	if err := os.WriteFile(victim, []byte("keep"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(victim, filepath.Join(root, "antigravity-hans-overlay.js")); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}
	if err := writePatchOverlay(root, "replacement"); err == nil {
		t.Fatal("accepted a symlink as the overlay destination")
	}
	data, err := os.ReadFile(victim)
	if err != nil || string(data) != "keep" {
		t.Fatalf("symlink target changed: %q, %v", data, err)
	}
}
