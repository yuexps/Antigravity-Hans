# Antigravity-Hans 项目开发规范

## 1. 目录结构

```text
Antigravity-Hans/
├── main.go                 # 程序入口、信号处理、CLI 参数分发
├── build.sh / build.bat    # Unix / Windows 交叉编译脚本
├── resources/              # 汉化词库源码与内嵌资源包（package resources）
│   ├── embed.go
│   ├── antigravity-hans-overlay.js   # 由 tools/build-overlay.mjs 自动生成，禁止手改
│   ├── swarm-overlay.js              # 由 tools/build-overlay.mjs 自动生成，禁止手改
│   ├── custom-translations.example.txt
│   └── src/                # 模块化词库唯一维护入口（runtime/ + dict/*.json + plugins/*.json + ide-nls.json）
├── internal/               # Go 内部功能模块（严格单向依赖）
│   ├── cli/                # 交互式主菜单与静态补丁菜单
│   ├── safeio/             # 防 TOCTOU 安全读写、文件属主校验、文件锁、shell/ps 转义
│   ├── app/                # 应用配置模型、三平台安装路径探测、Linux 路径解析、进程匹配
│   ├── overlay/            # 外部词库校验加载、自定义翻译名单解析与前导生成
│   ├── process/            # 调试模式启动、优雅退出、Windows 后台清理、聚焦、监视器单实例锁
│   ├── cdp/                # CDP 传输、端口归属校验、目标过滤、Swarm/IDE Agent 注入、监视循环
│   ├── patch/              # IDE 静态补丁安装/还原、校验和更新、官方中文语言包检测
│   └── shortcut/           # Windows / macOS / Linux 桌面快捷方式生成
├── docs/                   # 版本适配记录与设计文档
├── tools/                  # 本地构建脚本、词库体检与 Node 回归测试
└── .agents/skills/         # 项目级 Agent 技能（新版本适配与 CDP 排查）
```

## 2. 模块依赖约束

- 严禁出现循环依赖，必须保持自顶向下单向引用：
  - `main` → `cli` / `cdp` / `shortcut` / `overlay` / `process` / `app`
  - `cli` → `cdp` / `patch` / `shortcut` / `app`
  - `cdp` → `app` / `process` / `overlay` / `resources`
  - `patch` → `app` / `safeio` / `resources`
  - `shortcut` → `app` / `overlay` / `safeio`
  - `overlay` → `resources` / `safeio`
  - `process` → `app` / `safeio`
  - `app` → `safeio`
- 词库统一存放在 `resources/`，由 `resources/embed.go` 通过 `//go:embed` 导出。

## 3. 代码与跨平台规范

- Go 源码与测试保持跨平台 LF 换行；Windows 脚本（`.bat`、`.ps1`）使用 CRLF 换行并输出 UTF-8（`.bat` 使用 `chcp 65001 >nul`）。
- 平台专属文件统一使用后缀：`*_windows.go`、`*_darwin.go`、`*_linux.go`、`*_unix.go`（macOS/Linux 共享 POSIX 实现）。
- 禁止新增包级可变全局状态或 `init()` 隐式副作用；配置通过 `app.DefaultNormal()` / `app.DefaultIDE()` 获取。
- 涉及文件读写与进程操作必须保留 `safeio`（`os.Root`）与进程身份校验，不得降低安全边界。

## 4. 词库协作与翻译口径

- **禁止手改 `resources/antigravity-hans-overlay.js` 与 `resources/swarm-overlay.js`**；静态词条用 `node tools/dict.mjs <add|set|remove|import>` 维护（插件分组用 `plugin:swarm`），特殊正则/DOM 规则改 `resources/src/runtime/` 后执行 `node tools/build-overlay.mjs`。
- **分组归属**：主词库 `dict/` 含 `common`（通用短控件）、`settings`（设置页/模型/编排器/账户/权限）、`chat-agent`（对话/智能体/进度/斜杠命令）、`marketplace`（插件市场与技能描述）、`ide`（IDE 专属界面）；独立 `plugin://` 面板归入 `plugins/`（如 `plugins/swarm.json`），运行期保持独立产物不并入主词库。
- **版本适配技能**：适配 Antigravity / IDE 新版本或排查界面漏翻时，按 [.agents/skills/antigravity-hans-adaptation/SKILL.md](.agents/skills/antigravity-hans-adaptation/SKILL.md) 执行（含 CDP 截图、实时帧抓取与静态资源对比脚本）。
- **翻译口径**：AI `Agent` 统一译“智能体”，`Orchestrator` 译“编排器”；模型名、按键名（`Enter`/`Ctrl`/`Shift`/`Alt`）、产品名与协议/技术词（`Swarm`/`MCP`/`CLI`/`Git`/`Token`/`WSL`）保持英文原文。

## 5. 构建与验证命令

```bash
# 格式化与静态检查
gofmt -l .
go vet ./...

# Go 单元测试
go test -count=1 ./...

# 词库维护、构建、回归测试与体检
node tools/dict.mjs stats
node tools/build-overlay.mjs --check
node --test tools/overlay.test.mjs tools/swarm-overlay.test.mjs tools/main-hook.test.mjs
node tools/lint-overlay.mjs resources/antigravity-hans-overlay.js

# 跨平台构建
./build.sh      # Unix / macOS / Linux
build.bat       # Windows
```
