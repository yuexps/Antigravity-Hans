# Antigravity 2.34.0 / IDE 2.8.0 适配与架构整理记录

- **适配日期**：2026-11-23
- **目标版本**：Antigravity 普通版 `2.34.0`、Antigravity IDE `2.8.0`（Windows 本地 CDP 实机截图 + DOM 核验）
- **词库指纹**：`app-2.34.0-20261123-r6` / `swarm-20261123-r1`

## 架构与词库模块化

- **Go 模块拆分**：收敛根目录至唯一入口 [main.go](../main.go)，拆分 `internal/{app,cdp,cli,overlay,patch,process,safeio,shortcut}`（单向依赖、消除全局可变状态与 `*_other.go`），新增 [AGENTS.md](../AGENTS.md) 与 [build.bat](../build.bat)。
- **词库源码化**：将主词库与 Swarm 插件词库拆分为 `resources/src/{dict,plugins,runtime,ide-nls.json}`，通过 [tools/build-overlay.mjs](../tools/build-overlay.mjs)（接入 CI `--check`）与 [tools/dict.mjs](../tools/dict.mjs) 统一维护并自动构建独立运行期产物。

## 2.34.0 普通版适配

- **动态规则**：新增首页问候语（保护用户名）、分支标签、用量浮窗（`5h limit`、`Resets in ...`、`N% left`、`4h`）、模型推理强度（`Thinking effort`、`Extra High`）与智能体运行计数。
- **静态词条**：补齐编排器设置、输入框、外观、快捷键、账户套餐及内置技能文案。
- **Swarm 面板修复**：将宿主正则放宽为 `^swarm--swarm_board-[a-z0-9]{1,16}$`，兼容 2.34.0 的 4 位端口后缀（如 `7192`）。
- **启动器加固**：[internal/process/launcher.go](../internal/process/launcher.go) 启动目标应用时过滤 `ELECTRON_RUN_AS_NODE`，避免从 IDE 终端拉起 Electron 报错。

## 2.8.0 IDE 适配与修复

- **智能体多路由支持**：[internal/cdp/ide_agent.go](../internal/cdp/ide_agent.go) 扩展严格路由白名单，支持 `/c/<id>`、`/history`、`/customizations/...`、`/multi`、`/forked/...`、`/view/<id>`、`/sidecars/...` 等 2.8.0 智能体 iframe 路由。
- **防误翻与漏翻修复**：
  - [resources/src/runtime/rules.js](../resources/src/runtime/rules.js) 在主窗口排除资源管理器/大纲/时间线/SCM 文件树，避免项目名含 `antigravity` 命中图标类名导致 `resources`/`VERSION` 被误翻；
  - 将 `[data-cascade-id]` 跳过规则精确收窄为 `[data-cascade-id]:not([data-testid="conversation-view"])`，修复对话视图输入框占位符（`Ask anything, @ to mention, / for actions`）被跳过的问题；
  - 补齐 IDE 2.8.0 审批/严格模式/工具栏/插件市场等 88 条词条（含 `Split` → `拆分`）。
- **原生 NLS 核验**：`2.8.0` 底层仍为 VS Code `1.107.0`，[resources/src/ide-nls.json](../resources/src/ide-nls.json) 的 1,111 条索引 100% 精确兼容。

## 验证结果

- `node tools/build-overlay.mjs --check`：通过（主词条 2746 条、IDE NLS 1111 条、Swarm 插件 122 条）
- `node --test tools/overlay.test.mjs tools/swarm-overlay.test.mjs`：72/72 全部通过
- `node tools/lint-overlay.mjs resources/antigravity-hans-overlay.js`：0 错误
- `gofmt -l .`、`go vet ./...`、`go test -count=1 ./internal/cdp ./internal/app ./internal/overlay ./internal/shortcut`：全部通过
