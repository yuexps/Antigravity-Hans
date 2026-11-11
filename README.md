# Antigravity 汉化工具 (Antigravity-Hans)

专为 **Google Antigravity** 及 **Antigravity IDE** 开发的中文汉化工具。

> **适配版本**：**Antigravity `2.31.0`** 与 **Antigravity IDE `2.6.0`**。
> 普通版的 Swarm 面板，以及 IDE 的智能体和独立设置页面，需要动态监视器；本次适配的验证范围和限制见[更新记录](docs/LOCAL-UPDATE-2026-11-11.md)。

---

## 效果预览

<img width="2560" height="1600" alt="Antigravity 汉化预览 1" src="https://github.com/user-attachments/assets/4afcc033-34e4-47f7-bca1-53c341780b36" />
<img width="2560" height="1600" alt="Antigravity 汉化预览 2" src="https://github.com/user-attachments/assets/db2173c3-6c92-493c-bcb0-d3235133a381" />

---

## 快速使用

前往 [Releases](../../releases) 下载对应平台的单文件即可运行；

未测试的最新构建可从 [GitHub Actions Artifacts](https://github.com/yuexps/Antigravity-Hans/actions/workflows/test.yml) 下载。

- **Windows**：双击 `antigravity-hans-windows-amd64.exe`，在交互菜单中选择对应模式。
- **macOS**：
  ```bash
  chmod +x antigravity-hans-macos-*
  ./antigravity-hans-macos-arm64  # Apple Silicon
  ./antigravity-hans-macos-amd64  # Intel
  ```

```text
Antigravity-Hans 启动器
----------------------------------------
1. 启动 Antigravity (动态汉化)
2. 启动 Antigravity IDE (动态汉化)
3. 静态补丁管理 (仅支持 IDE)
4. 生成桌面快捷启动方式
0. 退出
----------------------------------------
```

> **提示**：首次使用 IDE 时，工具会自动检测并提示安装[官方中文语言包 (Chinese (Simplified) Language Pack)](https://marketplace.visualstudio.com/items?itemName=MS-CEINTL.vscode-language-pack-zh-hans)，确保菜单栏与底层编辑器完整汉化。

---

## 命令行参数

```bash
# 直接启动汉化
antigravity-hans --app         # 动态汉化 Antigravity
antigravity-hans --ide         # 动态汉化 Antigravity IDE
antigravity-hans --patch       # 静态补丁管理 (仅支持 IDE)
antigravity-hans --app --attach-only  # 仅连接已有调试端口，不启动或重启应用
antigravity-hans --ide --attach-only  # 仅连接 IDE 已有调试端口

# 生成一键汉化快捷方式
antigravity-hans --shortcut        # 为两者生成快捷方式
antigravity-hans --shortcut --app  # 仅 Antigravity
antigravity-hans --shortcut --ide  # 仅 Antigravity IDE

# 维护
antigravity-hans --stop                    # 结束由本工具启动的汉化监视器
antigravity-hans --trust-external-overlay  # 显式信任同目录外部汉化脚本（类型与大小限制仍生效）
antigravity-hans --app --trust-custom-translations  # 显式信任同目录自定义翻译名单
```

---

## 汉化模式

1. **动态汉化（推荐）**：
   - 支持 Antigravity 及 Antigravity IDE。
   - 通过 CDP 动态翻译界面，保留应用安装资源；注入状态随应用页面关闭而消失。
   - 普通版 Swarm 面板和 IDE 2.6.0 的智能体及独立设置页面需要动态监视器；静态补丁不会覆盖这些内嵌页面。
   - 可通过 `--shortcut` 参数一键生成桌面快捷方式，日常双击即可自动启动汉化。
2. **静态补丁（仅支持 Antigravity IDE）**：
   - 直接修改本地 IDE 安装包资源并修复校验和，一劳永逸，支持随时一键还原。

### 中英切换按钮

汉化生效后，窗口右下角会出现一个半透明的小圆按钮，可随时在中文与英文之间无缝切换（无需刷新或重启）：

- 按钮显示 **EN**：单击切换为英文；显示 **中**：单击切回中文。
- **双击或右键**按钮：打开选项菜单，可选择语言，以及勾选「**选项名保留英文**」。
- **调整位置**：按住按钮拖动到任意位置后松开即可，位置会自动记住（窗口尺寸变化时会自动保持在可见区域内）。
- 语言、位置与选项会被记住；多个窗口之间会自动同步。
- 也支持键盘操作（聚焦按钮后按回车或空格切换语言）。

#### 选项名保留英文（内置预设，默认关闭）

部分用户觉得「Claude Opus 5.5 高」这类中英拼接读起来别扭。勾选后，中文状态下以下选项名保留英文，**说明文字仍为中文**：

| 位置 | 默认（全中文） | 勾选后 |
| --- | --- | --- |
| 对话权限菜单 | 当前对话 / 请求审核 / 默认 / 自动 / 极速 | This Conversation / Request Review / Default / Auto / Turbo |
| 模型推理强度 | 高 / 中 / 低 | High / Medium / Low |

预设内容内置在程序中，随版本更新自动同步，无需额外文件。

### 自定义翻译名单

除了内置预设，进阶用户还可以按需微调个别译法：在程序同目录放一个 `custom-translations.txt`（参考 [custom-translations.example.txt](custom-translations.example.txt)），一行一条（个人名单优先于内置预设）：

```text
# 只写英文：保留英文，不翻译
Request Review
# 英文 = 译文：使用自己的译法
Turbo = 快速模式
```

- `#` 只在行首时表示注释（不支持行尾注释）。
- 界面文字与原文**整段一致**（不区分大小写）时生效，名单外的内容照常汉化；默认没有名单，即全部汉化。
- 名单可以改变权限等界面文字，请只使用可信的名单。macOS 默认检查名单和所在目录的所有者及写权限；Windows 无法通过该检查验证 ACL，需显式传入 `--trust-custom-translations` 才会加载。文件类型和大小限制始终生效。
- Windows 用户如需通过中文快捷方式加载可信名单，可运行 `antigravity-hans --shortcut --trust-custom-translations` 重新生成快捷方式；这个选项会保留在新快捷方式中。直接启动或安装静态补丁时，也需分别附带该选项。
- 修改或删除名单后，动态模式先运行 `antigravity-hans --stop` 结束旧监视器，再启动汉化，无需重启应用；静态模式则需先关闭 IDE，重新运行工具并选择“注入静态汉化”，以更新已安装的脚本。
- 名单仅作为数据注入（JSON 编码），译文只写入文本，不会被当作脚本或 HTML 执行；删除文件并按上述步骤更新后恢复默认汉化。

---

## 常见问题

- **macOS 双击「中文」图标后没有汉化**：监视进程日志位于 `~/Library/Logs/antigravity-hans.log`，先看该文件。
- **提示汉化监视器已在运行**：说明上一次的监视器仍在工作，可用 `antigravity-hans --stop` 结束它。
- **提示退出取消或超时**：仅在没有可复用调试端口时请求正常退出（macOS 用 AppleScript，Windows 用不带 `/F` 的 `taskkill`）。Windows 若只检测到无可见窗口的后台进程，会在交互控制台列出 PID 并询问是否强制结束：输入 `Y` 或按回车继续，输入 `N` 取消；强制结束可能丢失未保存的后台工作。存在可见窗口、无法确认进程身份或使用 `--nogui` 时会中止重启，请保存内容并手动退出后重试。
- **更新后仍使用旧词库**：先结束旧监视器；如果日志提示旧脚本没有清理入口，重新加载当前应用窗口后再启动新版监视器。

---

## 源码编译

需要 **Go 1.27.4 或更高版本**（`go.mod` 已声明，旧工具链会自动下载对应版本）。

```bash
./build.sh    # 交叉编译 macOS / Windows 2个平台到 dist/
```

在 Windows 上也可使用 PowerShell 7 构建单个本地测试版：

```powershell
pwsh -File .\tools\build-windows.ps1
```

产物为 `dist/antigravity-hans-windows-amd64-local.exe`，内嵌构建时的本地词库。启动时显示的词库指纹可与构建脚本输出的 SHA-256 前 16 位核对；同目录存在通过校验的外部词库时，启动器会优先使用外部词库。

若原程序正在运行，可用 `-OutputPath` 指定另一个输出文件，避免覆盖正在使用的程序：

```powershell
pwsh -File .\tools\build-windows.ps1 -OutputPath .\dist\antigravity-hans-windows-amd64-custom.exe
```

---

## 参与贡献

由于学业繁忙，更新可能不够及时，敬请谅解。欢迎提交 PR 补充词条、适配新版本或修复问题。

新版本适配与词条维护流程见 [适配技能](.github/skills/antigravity-hans-adaptation/SKILL.md)，提交前请运行词库 lint 与回归测试。

---

## 致谢

- 感谢所有为本项目提交代码、文档、测试、Issue 的贡献者。

<a href="https://github.com/yuexps/Antigravity-Hans/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=yuexps/Antigravity-Hans" alt="contributors" />
</a>

---

- 汉化词库参考：[antigravity-chinese](https://github.com/kdczyz/antigravity-chinese)
