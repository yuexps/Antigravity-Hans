package patch

import (
	"crypto/sha256"
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"strings"

	"antigravity-hans/internal/app"
	"antigravity-hans/internal/safeio"
	"antigravity-hans/resources"
)

//go:embed main_hook.mjs
var mainHookScript []byte

const (
	mainHookFileName    = "antigravity-hans-main.mjs"
	swarmOverlayName    = "antigravity-hans-swarm-overlay.js"
	mainHookMarkerStart = "/* antigravity-hans-main-start */"
	mainHookMarkerEnd   = "/* antigravity-hans-main-end */"
	mainHookSnippet     = mainHookMarkerStart + "\nimport('./" + mainHookFileName + "').catch(() => {});\n" + mainHookMarkerEnd
)

// AppInstance 表示静态补丁操作的目标应用实例。
type AppInstance struct {
	Name    string
	Exe     string
	ExePath string
	Dir     string
}

// GetInstalledIDEApps 获取本机已安装的 Antigravity IDE 实例。
func GetInstalledIDEApps(cfg app.Config) []AppInstance {
	var installed []AppInstance

	rawPaths := []string{}
	for _, p := range cfg.PossiblePaths {
		if _, err := os.Stat(p); err == nil {
			rawPaths = append(rawPaths, p)
		}
	}
	if len(rawPaths) == 0 {
		for _, p := range app.GetPathsFromRegistry(cfg.Name, cfg.Exe) {
			if !slices.Contains(rawPaths, p) {
				rawPaths = append(rawPaths, p)
			}
		}
	}

	seen := make(map[string]bool)
	for _, p := range rawPaths {
		resolved := p
		if realPath, err := filepath.EvalSymlinks(p); err == nil {
			resolved = realPath
		}
		resolved = filepath.Clean(resolved)
		info, err := os.Stat(resolved)
		if err != nil || info.IsDir() || seen[resolved] {
			continue
		}
		seen[resolved] = true
		installed = append(installed, AppInstance{
			Name:    fmt.Sprintf("%s (%s)", cfg.Name, resolved),
			Exe:     cfg.Exe,
			ExePath: resolved,
			Dir:     filepath.Dir(resolved),
		})
	}
	return installed
}

// getResourcesDir 获取资源目录路径。
func getResourcesDir(inst AppInstance) string {
	if app.IsMac {
		parent := filepath.Dir(inst.Dir) // .../Contents
		resources := filepath.Join(parent, "Resources")
		if _, err := os.Stat(resources); err == nil {
			return resources
		}
	}
	return filepath.Join(inst.Dir, "resources")
}

// Install 为指定实例安装静态汉化补丁。
func Install(cfg app.Config, inst AppInstance, overlaySource string) bool {
	fmt.Printf("\n[正在注入] 正在为 %s 注入汉化补丁...\n", inst.Name)

	pids := app.CheckProcessRunning(cfg, inst.ExePath)
	if len(pids) > 0 {
		fmt.Printf("[警告] 检测到 %s 正在运行 (PID: %v)。\n", inst.Name, pids)
		fmt.Println("[提示] 为了避免文件被占用，请先关闭该应用后重新执行本操作。")
		return false
	}

	resourcesDir := getResourcesDir(inst)
	appDir := filepath.Join(resourcesDir, "app")

	// 检测核心资源目录
	if _, err := os.Stat(filepath.Join(appDir, "package.json")); os.IsNotExist(err) {
		fmt.Println("[错误] 未找到核心资源目录 app 目录或 package.json 缺失")
		return false
	}

	workbenchDir := filepath.Join(appDir, "out", "vs", "code", "electron-browser", "workbench")
	if _, err := os.Stat(workbenchDir); os.IsNotExist(err) {
		fmt.Println("[错误] 无法识别应用架构（未找到 workbench 目录）")
		return false
	}

	// 使用独占创建的临时文件探测写权限，不能覆盖已有的用户文件。
	probe, err := os.CreateTemp(workbenchDir, ".agy-hans-write-*")
	if err != nil {
		fmt.Println("[错误] 目录写入权限不足，无法安装补丁。")
		fmt.Println(patchPermissionHint())
		return false
	}
	probeName := probe.Name()
	if err := probe.Close(); err != nil {
		_ = os.Remove(probeName)
		fmt.Printf("[错误] 关闭写入探测文件失败: %v\n", err)
		return false
	}
	if err := os.Remove(probeName); err != nil {
		fmt.Printf("[错误] 清理写入探测文件失败: %v\n", err)
		return false
	}

	// 检测是否已注入
	outDir := filepath.Join(appDir, "out")
	htmlFiles := []string{"workbench.html", "workbench-jetski-agent.html"}
	for _, htmlName := range htmlFiles {
		htmlPath := filepath.Join(workbenchDir, htmlName)
		if content, err := os.ReadFile(htmlPath); err == nil {
			if strings.Contains(string(content), `<script src="./antigravity-hans-overlay.js"></script>`) {
				if err := writePatchOverlay(workbenchDir, overlaySource); err != nil {
					fmt.Printf("[错误] 更新补丁文件失败: %v\n", err)
					return false
				}
				if err := writePatchFile(workbenchDir, swarmOverlayName, []byte(resources.SwarmOverlayJS)); err != nil {
					fmt.Printf("[错误] 更新 Swarm 补丁文件失败: %v\n", err)
					return false
				}
				if err := installMainHook(outDir); err != nil {
					fmt.Printf("[错误] 更新主进程跨域注入模块失败: %v\n", err)
					return false
				}
				fmt.Printf("[完成] 已更新 %s 的静态汉化脚本和跨域注入模块。\n", inst.Name)
				return true
			}
		}
	}

	fmt.Println("[提示] 识别为 VS Code 架构，将通过 HTML + 主进程钩子注入静态汉化补丁...")

	// 写出 overlay 与 Swarm 脚本（0644 保证普通用户启动 IDE 时可读）
	overlayDest := filepath.Join(workbenchDir, "antigravity-hans-overlay.js")
	if err := writePatchOverlay(workbenchDir, overlaySource); err != nil {
		fmt.Printf("[错误] 写入补丁文件失败: %v\n", err)
		return false
	}
	if err := writePatchFile(workbenchDir, swarmOverlayName, []byte(resources.SwarmOverlayJS)); err != nil {
		fmt.Printf("[错误] 写入 Swarm 补丁文件失败: %v\n", err)
		return false
	}
	fmt.Printf("[成功] 写出补丁源文件至: %s\n", overlayDest)

	// 修改 HTML 文件
	scriptTag := `<script src="./antigravity-hans-overlay.js"></script>`
	for _, htmlName := range htmlFiles {
		htmlPath := filepath.Join(workbenchDir, htmlName)
		if _, err := os.Stat(htmlPath); os.IsNotExist(err) {
			continue
		}
		bakPath := htmlPath + ".bak"

		// 创建备份
		if _, err := os.Stat(bakPath); os.IsNotExist(err) {
			if err := copyFile(htmlPath, bakPath); err != nil {
				fmt.Printf("[错误] 创建备份失败: %v\n", err)
				return false
			}
			fmt.Printf("[成功] 已创建备份: %s\n", bakPath)
		}

		content, err := os.ReadFile(htmlPath)
		if err != nil {
			fmt.Printf("[错误] 读取 %s 失败: %v\n", htmlName, err)
			return false
		}
		html := string(content)

		if strings.Contains(html, scriptTag) {
			fmt.Printf("[提示] %s 已经包含汉化注入标签，跳过。\n", htmlName)
			continue
		}

		if strings.Contains(html, "<!-- Startup") {
			html = strings.Replace(html, "<!-- Startup", scriptTag+"\n<!-- Startup", 1)
		} else {
			html = strings.Replace(html, "</body>", scriptTag+"\n</body>", 1)
		}

		// 原子替换 HTML，避免覆盖已有的 .tmp 文件或跟随符号链接。
		if err := writePatchFile(workbenchDir, htmlName, []byte(html)); err != nil {
			fmt.Printf("[错误] 替换 %s 失败: %v\n", htmlName, err)
			return false
		}
		fmt.Printf("[成功] 已更新 HTML 文件: %s\n", htmlName)
	}

	// 更新 product.json 校验和
	productJSONPath := filepath.Join(appDir, "product.json")
	if _, err := os.Stat(productJSONPath); err == nil {
		productBak := productJSONPath + ".bak"
		if _, err := os.Stat(productBak); os.IsNotExist(err) {
			if err := copyFile(productJSONPath, productBak); err != nil {
				fmt.Printf("[错误] 备份 product.json 失败: %v\n", err)
			} else {
				fmt.Printf("[成功] 已创建备份: %s\n", productBak)
			}
		}

		rawJSON, err := os.ReadFile(productJSONPath)
		if err != nil {
			fmt.Printf("[错误] 读取 product.json 失败: %v\n", err)
		} else {
			var productData map[string]interface{}
			if err := json.Unmarshal(rawJSON, &productData); err == nil {
				if checksums, ok := productData["checksums"].(map[string]interface{}); ok {
					for _, htmlName := range htmlFiles {
						htmlPath := filepath.Join(workbenchDir, htmlName)
						if data, err := os.ReadFile(htmlPath); err == nil {
							sum := sha256.Sum256(data)
							b64 := base64.StdEncoding.EncodeToString(sum[:])
							b64 = strings.TrimRight(b64, "=")
							key := "vs/code/electron-browser/workbench/" + htmlName
							checksums[key] = b64
						}
					}
					productData["checksums"] = checksums
				}
				if out, err := json.MarshalIndent(productData, "", "\t"); err == nil {
					if err := os.WriteFile(productJSONPath, out, 0644); err == nil {
						fmt.Println("[成功] 已更新 product.json 校验和")
					}
				}
			}
		}
	}

	// 挂载 Electron 主进程跨域子帧注入模块（覆盖智能体侧边栏、Antigravity 设置与 Swarm 面板）
	if err := installMainHook(outDir); err != nil {
		fmt.Printf("[错误] 挂载主进程跨域注入模块失败: %v\n", err)
		return false
	}

	fmt.Printf("[完成] %s 静态注入完成！请启动应用查看效果。\n", inst.Name)
	return true
}

// installMainHook 将主进程跨域注入模块写入 out/ 并在 out/main.js 末尾幂等挂载导入语句。
func installMainHook(outDir string) error {
	mainJSPath := filepath.Join(outDir, "main.js")
	if _, err := os.Stat(mainJSPath); os.IsNotExist(err) {
		return nil
	}
	if err := writePatchFile(outDir, mainHookFileName, mainHookScript); err != nil {
		return err
	}
	content, err := os.ReadFile(mainJSPath)
	if err != nil {
		return err
	}
	src := string(content)
	if strings.Contains(src, mainHookMarkerStart) {
		return nil
	}
	bakPath := mainJSPath + ".bak"
	if _, err := os.Stat(bakPath); os.IsNotExist(err) {
		if err := copyFile(mainJSPath, bakPath); err != nil {
			return err
		}
		fmt.Printf("[成功] 已创建备份: %s\n", bakPath)
	}
	patched := appendMainHookSnippet(src)
	if err := writePatchFile(outDir, "main.js", []byte(patched)); err != nil {
		return err
	}
	fmt.Println("[成功] 已挂载主进程跨域子帧注入模块: out/main.js")
	return nil
}

func appendMainHookSnippet(src string) string {
	const mapPrefix = "//# sourceMappingURL="
	if idx := strings.LastIndex(src, mapPrefix); idx >= 0 {
		prefix := strings.TrimRight(src[:idx], "\r\n")
		return prefix + "\n" + mainHookSnippet + "\n\n" + src[idx:]
	}
	return strings.TrimRight(src, "\r\n") + "\n" + mainHookSnippet + "\n"
}

func stripMainHookSnippet(src string) (string, bool) {
	start := strings.Index(src, mainHookMarkerStart)
	if start < 0 {
		return src, false
	}
	end := strings.Index(src[start:], mainHookMarkerEnd)
	if end < 0 {
		return src, false
	}
	after := start + end + len(mainHookMarkerEnd)
	if after < len(src) && src[after] == '\r' {
		after++
	}
	if after < len(src) && src[after] == '\n' {
		after++
	}
	before := src[:start]
	if strings.HasSuffix(before, "\n") && strings.HasPrefix(src[after:], "\n") {
		before = before[:len(before)-1]
	}
	return before + src[after:], true
}

func uninstallMainHook(outDir string) (bool, bool) {
	restored := false
	permissionDenied := false
	mainJSPath := filepath.Join(outDir, "main.js")
	bakPath := mainJSPath + ".bak"

	if _, err := os.Stat(bakPath); err == nil {
		if err := os.Rename(bakPath, mainJSPath); err == nil {
			fmt.Println("[成功] 已根据备份文件还原: out/main.js")
			restored = true
		} else {
			fmt.Printf("[错误] 还原 out/main.js 失败: %v\n", err)
			if errors.Is(err, os.ErrPermission) {
				permissionDenied = true
			}
		}
	} else if content, err := os.ReadFile(mainJSPath); err == nil {
		if cleaned, changed := stripMainHookSnippet(string(content)); changed {
			if err := writePatchFile(outDir, "main.js", []byte(cleaned)); err == nil {
				fmt.Println("[成功] 已清除 out/main.js 中的主进程注入钩子")
				restored = true
			} else {
				fmt.Printf("[错误] 清理 out/main.js 失败: %v\n", err)
				if errors.Is(err, os.ErrPermission) {
					permissionDenied = true
				}
			}
		}
	}

	hookPath := filepath.Join(outDir, mainHookFileName)
	if _, err := os.Stat(hookPath); err == nil {
		if err := os.Remove(hookPath); err == nil {
			fmt.Printf("[成功] 已删除主进程注入模块: %s\n", hookPath)
			restored = true
		} else {
			fmt.Printf("[错误] 删除主进程注入模块失败: %v\n", err)
			if errors.Is(err, os.ErrPermission) {
				permissionDenied = true
			}
		}
	}
	return restored, permissionDenied
}

// writePatchOverlay 原子写入汉化脚本，不跟随符号链接。
func writePatchOverlay(workbenchDir, overlaySource string) error {
	return writePatchFile(workbenchDir, "antigravity-hans-overlay.js", []byte(overlaySource))
}

func writePatchFile(workbenchDir, name string, data []byte) error {
	root, err := os.OpenRoot(workbenchDir)
	if err != nil {
		return err
	}
	defer root.Close()
	return safeio.WriteRootFileAtomic(root, name, data, 0644)
}

// Uninstall 还原静态汉化补丁。
func Uninstall(cfg app.Config, inst AppInstance) bool {
	fmt.Printf("\n[正在还原] 正在为 %s 还原至原始状态...\n", inst.Name)

	pids := app.CheckProcessRunning(cfg, inst.ExePath)
	if len(pids) > 0 {
		fmt.Printf("[警告] 检测到 %s 正在运行 (PID: %v)。\n", inst.Name, pids)
		fmt.Println("[提示] 为了避免文件被占用，请先关闭该应用后重新执行本操作。")
		return false
	}

	resourcesDir := getResourcesDir(inst)
	appDir := filepath.Join(resourcesDir, "app")
	workbenchDir := filepath.Join(appDir, "out", "vs", "code", "electron-browser", "workbench")

	restored := false
	permissionDenied := false
	htmlFiles := []string{"workbench.html", "workbench-jetski-agent.html"}

	if _, err := os.Stat(workbenchDir); err == nil {
		scriptTag := `<script src="./antigravity-hans-overlay.js"></script>`
		for _, htmlName := range htmlFiles {
			htmlPath := filepath.Join(workbenchDir, htmlName)
			bakPath := htmlPath + ".bak"

			if _, err := os.Stat(bakPath); err == nil {
				if err := os.Rename(bakPath, htmlPath); err == nil {
					fmt.Printf("[成功] 已根据备份文件还原: %s\n", htmlName)
					restored = true
				} else {
					fmt.Printf("[错误] 还原 %s 失败: %v\n", htmlName, err)
					if errors.Is(err, os.ErrPermission) {
						permissionDenied = true
					}
				}
			} else if _, err := os.Stat(htmlPath); err == nil {
				content, err := os.ReadFile(htmlPath)
				if err == nil && strings.Contains(string(content), scriptTag) {
					html := strings.Replace(string(content), scriptTag+"\n", "", 1)
					html = strings.Replace(html, scriptTag, "", 1)
					if err := os.WriteFile(htmlPath, []byte(html), 0644); err == nil {
						fmt.Printf("[成功] 清除了 %s 中的注入标签\n", htmlName)
						restored = true
					} else {
						fmt.Printf("[错误] 清理 %s 失败: %v\n", htmlName, err)
						if errors.Is(err, os.ErrPermission) {
							permissionDenied = true
						}
					}
				}
			}
		}

		// 删除补丁文件
		for _, scriptName := range []string{"antigravity-hans-overlay.js", swarmOverlayName} {
			scriptDest := filepath.Join(workbenchDir, scriptName)
			if _, err := os.Stat(scriptDest); err == nil {
				if err := os.Remove(scriptDest); err == nil {
					fmt.Printf("[成功] 已删除补丁文件: %s\n", scriptDest)
					restored = true
				} else {
					fmt.Printf("[错误] 删除补丁文件失败: %v\n", err)
					if errors.Is(err, os.ErrPermission) {
						permissionDenied = true
					}
				}
			}
		}

		// 还原主进程钩子与模块
		mainRestored, mainPermDenied := uninstallMainHook(filepath.Join(appDir, "out"))
		if mainRestored {
			restored = true
		}
		if mainPermDenied {
			permissionDenied = true
		}

		// 还原 product.json
		productJSONPath := filepath.Join(appDir, "product.json")
		productBak := productJSONPath + ".bak"
		if _, err := os.Stat(productBak); err == nil {
			if err := os.Rename(productBak, productJSONPath); err == nil {
				fmt.Println("[成功] 已根据备份文件还原: product.json")
				restored = true
			} else {
				fmt.Printf("[错误] 还原 product.json 失败: %v\n", err)
				if errors.Is(err, os.ErrPermission) {
					permissionDenied = true
				}
			}
		}
	}

	if permissionDenied {
		fmt.Println("[错误] 目录写入权限不足，无法完整还原补丁。")
		fmt.Println(patchPermissionHint())
		return false
	}

	if restored {
		fmt.Printf("[完成] %s 还原操作完毕。\n", inst.Name)
	} else {
		fmt.Println("[提示] 未检测到有效的汉化备份或文件，无需还原。")
	}
	return true
}

func patchPermissionHint() string {
	return patchPermissionHintForOS(runtime.GOOS)
}

func patchPermissionHintForOS(goos string) string {
	switch goos {
	case "darwin":
		return "       若该 .app 由安装包部署在 /Applications 且属主为 root，请用 sudo 运行本工具；\n       或者直接改用动态汉化（无需改动任何文件）。"
	case "linux":
		return "       若应用安装在 /opt 或 /usr/share 等 root 目录，请使用 sudo ./antigravity-hans --patch 运行；\n       或者直接改用动态汉化（无需改动任何文件）。"
	default:
		return "       如果应用安装在系统敏感目录（如 Program Files），请尝试“以管理员身份运行”此程序。"
	}
}

// copyFile 拷贝文件
func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return out.Sync()
}
