package patch

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"antigravity-hans/internal/app"
	"antigravity-hans/internal/overlay"
)

func TestInstallPatchUpdatesExistingScriptWithoutOverwritingOtherFiles(t *testing.T) {
	cfg := app.Config{Kind: app.KindIDE, Name: "patch-test-never-running", Exe: "patch-test-never-running.exe"}

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
	inst := AppInstance{Name: "isolated fixture", Dir: installDir, ExePath: filepath.Join(installDir, "patch-test-never-running.exe")}
	oldSource := overlay.CustomTranslationsPrelude([]overlay.CustomTranslation{{Source: "Turbo", Target: "OLD"}}) + "old script"
	if !Install(cfg, inst, oldSource) {
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
	newSource := overlay.CustomTranslationsPrelude(nil) + "new script"
	if !Install(cfg, inst, newSource) {
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

func TestUninstallPatchRestoresWorkbenchAndChecksums(t *testing.T) {
	cfg := app.Config{Kind: app.KindIDE, Name: "patch-test-never-running", Exe: "patch-test-never-running.exe"}

	installDir := filepath.Join(t.TempDir(), "installation")
	appDir := filepath.Join(installDir, "resources", "app")
	workbenchDir := filepath.Join(appDir, "out", "vs", "code", "electron-browser", "workbench")
	if err := os.MkdirAll(workbenchDir, 0700); err != nil {
		t.Fatal(err)
	}

	const origHTML = "<html><body><main>IDE</main></body></html>"
	const checksumKey = "vs/code/electron-browser/workbench/workbench.html"
	origProduct := `{"checksums":{"` + checksumKey + `":"old-checksum"}}`

	htmlPath := filepath.Join(workbenchDir, "workbench.html")
	productPath := filepath.Join(appDir, "product.json")
	for name, content := range map[string]string{
		filepath.Join(appDir, "package.json"): "{}",
		htmlPath:                              origHTML,
		productPath:                           origProduct,
	} {
		if err := os.WriteFile(name, []byte(content), 0600); err != nil {
			t.Fatal(err)
		}
	}

	inst := AppInstance{Name: "isolated fixture", Dir: installDir, ExePath: filepath.Join(installDir, "patch-test-never-running.exe")}
	if !Install(cfg, inst, "console.log('zh');") {
		t.Fatal("Install failed")
	}

	// 验证 product.json 校验和已同步为修改后 workbench.html 的真实 SHA-256
	patchedHTML, err := os.ReadFile(htmlPath)
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(patchedHTML)
	wantChecksum := strings.TrimRight(base64.StdEncoding.EncodeToString(sum[:]), "=")

	productData, err := os.ReadFile(productPath)
	if err != nil {
		t.Fatal(err)
	}
	var prod struct {
		Checksums map[string]string `json:"checksums"`
	}
	if err := json.Unmarshal(productData, &prod); err != nil {
		t.Fatalf("patched product.json invalid JSON: %v", err)
	}
	if prod.Checksums[checksumKey] != wantChecksum {
		t.Fatalf("checksum = %q, want %q", prod.Checksums[checksumKey], wantChecksum)
	}

	// 还原后应完整恢复原始文件并清理补丁与备份
	if !Uninstall(cfg, inst) {
		t.Fatal("Uninstall failed")
	}
	if got, err := os.ReadFile(htmlPath); err != nil || string(got) != origHTML {
		t.Fatalf("workbench.html not restored: %q, %v", got, err)
	}
	if got, err := os.ReadFile(productPath); err != nil || string(got) != origProduct {
		t.Fatalf("product.json not restored: %q, %v", got, err)
	}
	for _, removed := range []string{
		filepath.Join(workbenchDir, "antigravity-hans-overlay.js"),
		htmlPath + ".bak",
		productPath + ".bak",
	} {
		if _, err := os.Stat(removed); !os.IsNotExist(err) {
			t.Fatalf("expected %s to be removed after Uninstall", removed)
		}
	}
}

func TestSetAndGetIDELocalePreservesJSONComments(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("APPDATA", filepath.Join(home, "AppData", "Roaming"))
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(home, ".config"))

	// 1. 首次写入应自动创建 argv.json
	if err := setIDELocale("zh-cn"); err != nil {
		t.Fatalf("initial setIDELocale failed: %v", err)
	}
	if got := getIDELocale(); got != "zh-cn" {
		t.Fatalf("getIDELocale() = %q, want zh-cn", got)
	}

	paths := getIDEArgvPaths()
	if len(paths) == 0 {
		t.Fatal("getIDEArgvPaths returned empty")
	}

	// 2. 替换已有 locale 字段时应保留 // 注释
	withLocale := "{\n\t// comment about locale\n\t\"locale\": \"en\",\n\t\"enable-crash-reporter\": false\n}\n"
	for _, p := range paths {
		if err := os.WriteFile(p, []byte(withLocale), 0644); err != nil {
			t.Fatal(err)
		}
	}
	if err := setIDELocale("zh-cn"); err != nil {
		t.Fatalf("replace setIDELocale failed: %v", err)
	}
	if got := getIDELocale(); got != "zh-cn" {
		t.Fatalf("after replace getIDELocale() = %q, want zh-cn", got)
	}
	raw, err := os.ReadFile(paths[0])
	if err != nil || !strings.Contains(string(raw), "// comment about locale") {
		t.Fatalf("comment lost after replace: %q, %v", raw, err)
	}

	// 3. 无 locale 字段时应补逗号插入并保持合法 JSON
	withoutLocale := "{\n\t// keep comment\n\t\"enable-crash-reporter\": false\n}\n"
	for _, p := range paths {
		if err := os.WriteFile(p, []byte(withoutLocale), 0644); err != nil {
			t.Fatal(err)
		}
	}
	if err := setIDELocale("zh-cn"); err != nil {
		t.Fatalf("insert setIDELocale failed: %v", err)
	}
	if got := getIDELocale(); got != "zh-cn" {
		t.Fatalf("after insert getIDELocale() = %q, want zh-cn", got)
	}
	raw, err = os.ReadFile(paths[0])
	if err != nil {
		t.Fatal(err)
	}
	var parsed map[string]interface{}
	if err := json.Unmarshal(removeJSONComments(raw), &parsed); err != nil {
		t.Fatalf("inserted argv.json is not valid JSON: %v\n%s", err, raw)
	}
	if parsed["enable-crash-reporter"] != false || parsed["locale"] != "zh-cn" {
		t.Fatalf("unexpected parsed argv.json: %+v", parsed)
	}
}
