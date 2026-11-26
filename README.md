# Antigravity 汉化工具 (Antigravity-Hans)

专为 **Google Antigravity** 及 **Antigravity IDE** 开发的中文汉化工具。

> **适配版本**：**Antigravity `2.35.2`** 与 **Antigravity IDE `2.8.0`**。

## 快速使用

前往 [Releases](../../releases) 下载对应平台单文件（未测试最新构建见 [GitHub Actions Artifacts](https://github.com/yuexps/Antigravity-Hans/actions/workflows/test.yml)）：

- **Windows**：双击 `antigravity-hans-windows-amd64.exe` 按菜单选择。
- **macOS**：`chmod +x antigravity-hans-macos-* && ./antigravity-hans-macos-arm64`（Intel 用 `amd64`）。
- **Linux**：`chmod +x antigravity-hans-linux-* && ./antigravity-hans-linux-amd64`（ARM64 用 `arm64`，兼容 `.deb` / `.rpm` / Arch AUR / `.tar.gz`）。

> 首次使用 IDE 时，工具会自动检测并提示安装[官方简体中文语言包](https://marketplace.visualstudio.com/items?itemName=MS-CEINTL.vscode-language-pack-zh-hans)，以保证菜单栏与编辑器完整汉化。

## 命令行参数

```bash
# 启动汉化
antigravity-hans --app                 # 动态汉化 Antigravity
antigravity-hans --ide                 # 动态汉化 Antigravity IDE
antigravity-hans --patch               # 静态补丁管理（仅支持 IDE）
antigravity-hans --app --attach-only   # 仅连接已有调试端口，不重启应用
antigravity-hans --ide --attach-only   # 仅连接 IDE 已有调试端口

# 桌面快捷方式
antigravity-hans --shortcut            # 为两者生成一键汉化快捷方式（可加 --app 或 --ide）

# Windows 自动代理
antigravity-hans --app --with-proxy             # 读取代理并启动 Antigravity
antigravity-hans --ide --with-proxy             # 读取代理并启动 Antigravity IDE
antigravity-hans --shortcut --app --with-proxy  # 创建「Antigravity 中文（代理）」快捷方式，可换成 --ide

# 维护与自定义
antigravity-hans --stop                                 # 结束汉化监视器
antigravity-hans --trust-external-overlay               # 显式信任同目录外部汉化脚本
antigravity-hans --app --trust-custom-translations      # 显式信任同目录自定义翻译名单
```

Windows 主菜单和快捷方式菜单均提供「自动代理」选项。每次代理启动优先读取当前用户已启用的 Windows 手动代理，其次读取 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY`。如果没有固定代理地址（例如仅设置了 PAC），或代理端口无法连接，启动器会在退出已有应用前提示。使用普通启动时，应用仍按原有方式读取代理设置。

代理设置仅传递给新启动的应用及其子进程，本机 CDP 连接保持直连。切换启动方式或在代理地址变更后重新读取时，如果已有汉化监视器运行，请先执行 `antigravity-hans --stop`，再从对应入口启动。`--with-proxy` 与 `--attach-only` 互斥。

## 汉化模式与切换

- **动态汉化（推荐）**：通过 CDP 实时翻译，不改动安装目录；支持普通版 Swarm 面板及 IDE 智能体/独立设置页面，可配合 `--shortcut` 生成一键启动图标。
- **静态补丁（仅 IDE）**：通过 `workbench.html` + Electron 主进程跨域子帧钩子（`out/main.js`）实现一劳永逸全界面汉化（含智能体侧边栏与 Antigravity 设置页），无需后台监视器，支持一键还原（Linux 系统目录需 `sudo`；IDE 升级后重跑 `--patch` 即可）。
- **中英切换按钮**：汉化生效后窗口右下角会出现半透明圆钮，单击切换中/英文，拖动可调整并记住位置，**双击或右键**可打开菜单勾选「**选项名保留英文**」（中文界面下保留对话权限及模型推理强度 `Extra High / High / Medium / Low` 等英文选项名）。

### 自定义翻译名单

在程序同目录放置 `custom-translations.txt`（参考 [resources/custom-translations.example.txt](resources/custom-translations.example.txt)），每行一条，整段匹配（不区分大小写），优先级高于内置预设：

```text
# 只写英文：保留原文不翻译
Request Review
# 英文 = 译文：自定义译法
Turbo = 快速模式
```

- Windows 需显式传入 `--trust-custom-translations`（生成快捷方式时同样附带该参数以保留配置）；macOS 自动校验文件属主与写权限。
- 修改名单后，动态模式执行 `antigravity-hans --stop` 后重连生效；静态模式需关闭 IDE 后重新执行 `--patch`。

## 常见问题

- **杀毒软件误报（火绒 / Defender / 360 等）**：未签名 Go 单文件常触发启发式误报。下载后按 Release 页 `SHA256SUMS` 核对哈希一致即可放行，或自行源码编译。
- **macOS 快捷方式未生效**：查看监视器日志 `~/Library/Logs/antigravity-hans.log`。
- **提示监视器已在运行 / 更新后仍是旧词库**：先执行 `antigravity-hans --stop` 结束旧监视器，再重新启动。
- **Windows 退出超时或后台进程残留**：无可见窗口的后台进程会在交互模式下提示确认结束，无交互快捷方式（`--nogui`）会直接清理已校验的同会话无窗口残留进程；若仍有可见窗口则会中止重启，请保存后手动退出。

## 源码编译与贡献

需要 **Go 1.27.4+**（词库维护与回归测试需 Node.js）：

```bash
./build.sh                                # Unix 交叉编译全平台产物到 dist/
build.bat                                 # Windows 交叉编译全平台产物到 dist/
pwsh -File .\tools\build-windows.ps1      # 仅构建 Windows 本地测试版
```

欢迎提交 PR 补充词条或适配新版本。项目结构、词库工具流（`tools/dict.mjs`、`tools/build-overlay.mjs`）与提交前校验命令见 [AGENTS.md](AGENTS.md) 与 [适配技能](.agents/skills/antigravity-hans-adaptation/SKILL.md)。

## 致谢

- 感谢所有为本项目提交代码、文档、测试、Issue 的贡献者。

<a href="https://github.com/yuexps/Antigravity-Hans/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=yuexps/Antigravity-Hans" alt="contributors" />
</a>
