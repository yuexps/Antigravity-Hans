package cli

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"antigravity-hans/internal/process"
)

const (
	hansReleaseAPI  = "https://api.github.com/repos/yuexps/Antigravity-Hans/releases/latest"
	hansReleasePage = "https://github.com/yuexps/Antigravity-Hans/releases/latest"
)

type hansVersion [3]uint64

func parseHansVersion(tag string) (hansVersion, bool) {
	var version hansVersion
	parts := strings.Split(strings.TrimPrefix(tag, "v"), ".")
	if len(parts) != len(version) {
		return version, false
	}
	for i, part := range parts {
		n, err := strconv.ParseUint(part, 10, 64)
		if err != nil || strconv.FormatUint(n, 10) != part {
			return hansVersion{}, false
		}
		version[i] = n
	}
	return version, true
}

func (current hansVersion) olderThan(latest hansVersion) bool {
	for i := range current {
		if current[i] != latest[i] {
			return current[i] < latest[i]
		}
	}
	return false
}

func latestHansRelease(client *http.Client) (string, error) {
	req, err := http.NewRequest(http.MethodGet, hansReleaseAPI, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "Antigravity-Hans")
	response, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return "", fmt.Errorf("GitHub 返回 HTTP %d", response.StatusCode)
	}
	const maxSize = 1 << 20
	body, err := io.ReadAll(io.LimitReader(response.Body, maxSize+1))
	if err != nil || len(body) > maxSize {
		return "", fmt.Errorf("无法完整读取发布信息")
	}
	var release struct {
		Tag        string `json:"tag_name"`
		Draft      bool   `json:"draft"`
		Prerelease bool   `json:"prerelease"`
	}
	if err := json.Unmarshal(body, &release); err != nil {
		return "", fmt.Errorf("无法解析发布信息")
	}
	if _, ok := parseHansVersion(release.Tag); !ok || release.Draft || release.Prerelease {
		return "", fmt.Errorf("发布信息没有有效的稳定版本号")
	}
	return release.Tag, nil
}

func hansReleaseClient() *http.Client {
	return &http.Client{
		Timeout: 7 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}

func checkHansUpdates(version string) {
	fmt.Printf("当前版本：%s\n正在查询项目的 GitHub Releases…\n", version)
	tag, err := latestHansRelease(hansReleaseClient())
	if err != nil {
		fmt.Printf("暂时无法检查更新：%v\n发布页：%s\n", err, hansReleasePage)
		return
	}
	fmt.Printf("最新稳定版：%s\n", tag)
	current, comparable := parseHansVersion(version)
	latest, _ := parseHansVersion(tag)
	switch {
	case !comparable:
		fmt.Println("当前是开发或自编译版本，请在发布页比较。")
	case current.olderThan(latest):
		fmt.Println("有新版可用。请在发布页下载适合自己系统的文件，按 SHA256SUMS 校验。")
	case latest.olderThan(current):
		fmt.Println("当前版本高于最新稳定版。")
	default:
		fmt.Println("已经是最新稳定版。")
	}
	fmt.Println("发布页：" + hansReleasePage)
}

func showHansAbout() {
	fmt.Println("Antigravity-Hans 是第三方汉化工具。动态模式通过本机调试接口，在运行时翻译界面。")
	fmt.Println("这种方式保留原应用安装包，方便切回原版。它需要后台监视，应用更新后也可能出现漏译。")
	fmt.Println("IDE 静态补丁属于单独的模式，可在静态补丁菜单中还原。")
	fmt.Println("检查汉化更新只在点击后查询本项目的 GitHub 发布版本，由你决定是否下载和安装。")
	fmt.Println("退出汉化注入保留 Hans，以后仍可从中文快捷方式重新启用。")
	fmt.Println("如果 Antigravity 已支持你需要的官方中文，可先退出注入试用，再决定是否卸载 Hans。")
}

func stopHansInjection() {
	process.StopMonitors(process.MonitorTargets(nil))
	fmt.Println("请保存工作并完全退出 Antigravity 或 IDE，再从原版图标打开。")
	fmt.Println("已打开的窗口可能仍显示先前翻译过的文字，重新打开后以原应用语言设置为准。")
}

func confirmHansRemoval(reader *bufio.Reader) bool {
	first, err := reader.ReadString('\n')
	if err != nil || strings.TrimSpace(first) != "1" {
		return false
	}
	fmt.Print("如果曾安装 IDE 静态补丁，请确认已还原官方状态。输入 UNINSTALL 继续，其他输入取消：")
	confirmation, err := reader.ReadString('\n')
	return err == nil && strings.TrimSpace(confirmation) == "UNINSTALL"
}

func guideHansRemoval(reader *bufio.Reader) {
	self, err := os.Executable()
	if err != nil {
		fmt.Printf("无法确定 Hans 程序的位置：%v\n", err)
		return
	}
	fmt.Println("卸载后可从原版图标使用 Antigravity 或 IDE。请保留原版应用、对话、项目和自定义词库。")
	fmt.Printf("本次运行的 Hans 程序：%s\n", self)
	fmt.Println("如曾安装 IDE 静态补丁，请先返回主菜单，选择「静态补丁管理 → 还原官方状态」。")
	fmt.Print("按 1 继续查看卸载步骤，按 Enter 返回：")
	if !confirmHansRemoval(reader) {
		fmt.Println("已取消卸载。")
		return
	}

	stopHansInjection()
	switch runtime.GOOS {
	case "darwin":
		fmt.Println("1. 在 Finder 中查看「应用程序」或 ~/Applications，把 Hans 生成的「Antigravity 中文.app」或「Antigravity IDE 中文.app」移到废纸篓。")
	case "windows":
		fmt.Println("1. 在桌面检查 Hans 生成的「Antigravity 中文」及「Antigravity IDE 中文」快捷方式（含代理版），将这些快捷方式移到回收站。")
	default:
		fmt.Println("1. 移除 Hans 生成的中文启动快捷方式。")
	}
	fmt.Printf("2. 退出当前 Hans 菜单后，在文件管理器中移除这个文件：%s\n", self)
	fmt.Println("请核对快捷方式指向的确是 Hans 后再移除。")
	switch runtime.GOOS {
	case "darwin":
		err = exec.Command("/usr/bin/open", "-R", self).Run()
	case "windows":
		root := os.Getenv("SystemRoot")
		explorer := filepath.Join(root, "explorer.exe")
		if root != "" && filepath.IsAbs(explorer) {
			err = exec.Command(explorer, filepath.Dir(self)).Start()
		}
	}
	if err != nil {
		fmt.Printf("无法打开文件管理器，请按上面显示的路径手动打开：%v\n", err)
	}
}

func runHansManagementMenu(reader *bufio.Reader, version string) {
	for {
		fmt.Println("\n管理 Antigravity-Hans")
		fmt.Println("1. 检查汉化更新")
		fmt.Println("2. 退出汉化注入")
		fmt.Println("3. 关于 Antigravity-Hans")
		fmt.Println("4. 卸载 Antigravity-Hans…")
		fmt.Print("0. 返回\n请选择：")
		line, err := reader.ReadString('\n')
		if err != nil {
			return
		}
		switch strings.TrimSpace(line) {
		case "1":
			checkHansUpdates(version)
		case "2":
			stopHansInjection()
		case "3":
			showHansAbout()
		case "4":
			guideHansRemoval(reader)
		case "0", "":
			return
		default:
			fmt.Println("无效的选择。")
		}
	}
}
