//go:build darwin

package process

import (
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"antigravity-hans/internal/app"
	"antigravity-hans/internal/safeio"
)

func gracefulQuitTimeout() time.Duration {
	return 8 * time.Second
}

// requestGracefulQuit 在 macOS 上通过 AppleScript 请求目标应用正常退出。
func requestGracefulQuit(cfg app.Config) error {
	bundle := macBundlePath(cfg)
	if bundle == "" {
		return fmt.Errorf("未找到应用 bundle")
	}
	if _, err := exec.LookPath("osascript"); err != nil {
		return err
	}

	fmt.Println("       (macOS 可能弹出“想要控制 Antigravity”的授权提示，允许一次即可)")
	script := fmt.Sprintf("tell application %q to quit", bundle)
	ctx, cancel := context.WithTimeout(context.Background(), gracefulQuitTimeout())
	defer cancel()
	return exec.CommandContext(ctx, "osascript", "-e", script).Run()
}

// FocusRunningNormalApp 在 macOS 上聚焦已运行的普通版窗口，避免重复启动竞态。
func FocusRunningNormalApp(cfg app.Config) {
	if cfg.IsIDE() {
		return
	}
	detected := app.Detect(cfg)
	if !detected.Running || !app.IsExpectedExecutable(detected.Path, cfg) {
		return
	}
	bundle := filepath.Dir(filepath.Dir(filepath.Dir(detected.Path)))
	_ = exec.Command("/usr/bin/open", "-a", bundle).Run()
}

func macBundlePath(cfg app.Config) string {
	exe := app.Detect(cfg).Path
	if exe == "" {
		for _, p := range cfg.PossiblePaths {
			if safeio.FileExists(p) {
				exe = p
				break
			}
		}
	}
	if exe == "" {
		return ""
	}
	bundle := filepath.Dir(filepath.Dir(filepath.Dir(exe)))
	if strings.HasSuffix(bundle, ".app") {
		return bundle
	}
	return ""
}
