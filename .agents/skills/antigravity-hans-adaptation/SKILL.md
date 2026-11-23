---
name: antigravity-hans-adaptation
description: '为 Antigravity 普通版或 Antigravity IDE 新版本适配汉化。用于升级后界面仍有英文、需要定位新 UI 文案、补充或修正 overlay 词库、处理动态文案与权限模板、更新适配版本、运行词库 lint 与回归测试时。'
argument-hint: '说明目标版本，或提供截图、英文原文'
---

# Antigravity 汉化新版本适配

## 适用场景

- Antigravity 或 Antigravity IDE 升级后出现新的英文界面。
- 用户提供截图，需要把其中英文文案补进词库。
- 需要核对某条文案是否真实存在于前端资源。
- 修改 `resources/antigravity-hans-overlay.js` 后做发布前验证。

## 前置条件

- 在仓库根目录执行命令。
- Node.js ≥ 22（脚本使用全局 `fetch`、`WebSocket` 与 `node:vm`）。
- 需要抓取运行中界面时，先用本工具启动目标应用；调试端口为普通版 `58321`、IDE `58322`。
- 只读适配：不要修改用户安装目录中的资源，不要重启或强杀用户应用。
- 覆盖判断会加载 overlay 并提取真实 `translate` 函数；若提示“无法定位 run 函数”，说明 overlay 结构与脚本预期不一致，先核对 `translate` 与 `run` 的定义位置。

## 适配流程

### 1. 确认版本与资源

```bash
node .agents/skills/antigravity-hans-adaptation/scripts/antigravity-resources.mjs info
```

记录两个应用的实际版本。普通版版本取自 `resources/app.asar` 内 `package.json`，IDE 版本取自 `resources/app/product.json` 的 `ideVersion`。

与 [README.md](../../../README.md) 顶部的“适配版本”对比；若版本变化，最后同步更新。

### 2. 收集新文案（推荐先 CDP 截图再分析代码）

优先通过 CDP 对运行中的应用截图并抓取实时文本，结合真实 UI 上下文确认未汉化项：

```bash
node .agents/skills/antigravity-hans-adaptation/scripts/antigravity-resources.mjs screenshot --app normal --out /tmp/main.png
node .agents/skills/antigravity-hans-adaptation/scripts/antigravity-resources.mjs live --app normal
node .agents/skills/antigravity-hans-adaptation/scripts/antigravity-resources.mjs live --app ide
```

脚本会输出页面中疑似未翻译的文本。它只读取 DOM 文本以及 `aria-label`、`placeholder`、`title`，不会修改页面。

没有运行中的应用时：

- 从用户截图逐条抄录英文原文；保留大小写、标点、省略号和变量位置。
- IDE 可用静态检索核对原文：

```bash
node .agents/skills/antigravity-hans-adaptation/scripts/antigravity-resources.mjs search "Open Settings" --app ide
```

- 普通版界面由运行时页面提供，`app.asar` 中只有主进程代码，静态检索通常找不到界面文案；以 `live` 或截图为准。
- `missing` 可扫描 IDE 静态资源中的疑似候选，但噪音较大，只作线索：

```bash
node .agents/skills/antigravity-hans-adaptation/scripts/antigravity-resources.mjs missing --app ide --limit 40
```

不要把 `missing` 的整批输出直接加入词库。只挑选用户截图、`live` 结果或资源上下文中确认出现在界面上的控件文案。`live` 结果也可能混入聊天内容、文件名、路径和代码，逐条人工核对后再收录。带时间、数量的动态文本先确认 `dynamicPatterns` 是否已有对应规则，不要重复添加静态词条。

### 3. 设计词条

先用 `check` 判断是否已有覆盖，命令会输出真实译文：

```bash
node .agents/skills/antigravity-hans-adaptation/scripts/antigravity-resources.mjs check "Give Feedback"
```

规则：

- 界面控件、菜单项、按钮等完整短文本 → 加入 `phrases`。
- 带数字、时间、文件名、项目名等变量的句子 → 优先生成 `dynamicPatterns` 正则，变量必须原样保留。
- 只出现一次且无变量的完整句子 → 加入 `phrases`；长度大于 15 的词条才参与子串替换。
- 长度不超过 15 的词条只做完整匹配与标点/快捷键后缀匹配，不要依赖它去翻译长句中间。
- 权限、命令、路径、URL、工具名属于数据，不得改写；权限模板只翻译固定文案。
- 译文避免残留英文；产品名、协议名、命令名、路径名按白名单保留。

详细结构与规则见 [overlay 适配指南](./references/overlay-guide.md)。

### 4. 修改词库（优先使用 CLI 工具，不手改产物）

- 词库唯一维护入口为 `resources/src/`（`dict/*.json` 按 UI 领域分组，`plugins/*.json` 存放独立 `plugin://` 面板词库，`ide-nls.json` 存放 IDE 原生映射，`runtime/` 存放纯 JS 引擎与规则）。
- **禁止直接手改 `resources/antigravity-hans-overlay.js` 与 `resources/swarm-overlay.js`**，增删改静态词条优先使用（插件分组用 `plugin:swarm`）：
  ```bash
  node tools/dict.mjs add settings "Input Box" "输入框"
  node tools/dict.mjs set chat-agent "1 agent running" "1 个智能体正在运行"
  node tools/dict.mjs import new-terms.json --group settings
  ```
- 修改 `resources/src/runtime/` 后运行 `node tools/build-overlay.mjs` 重新生成产物（自动查重、校验、按源文长度倒序排列）。
- 每次修改词库后更新 `resources/src/runtime/engine.js` 顶部的默认指纹，格式 `app-<普通版版本>-<YYYYMMDD>-r<N>`。

### 5. 补回归测试

在 [tools/overlay.test.mjs](../../../tools/overlay.test.mjs) 末尾按现有风格新增测试块，测试名按实际适配版本命名：

```js
test('2.27.0 normal app new controls are localized', () => {
  for (const [input, expected] of [
    ['New Control', '新控件'],
    ['Worked for 2h 5m', '已工作 2 小时 5 分钟'],
  ]) assert.equal(translate(input), expected);
});
```

要求：

- 覆盖本次新增的每条关键文案，至少覆盖一个动态变量场景。
- 涉及权限、路径、URL、命令时，断言目标原文保持不变，并检查二次翻译幂等。
- 不要在测试中连接真实应用或依赖安装路径。

### 6. 更新版本与记录

- [README.md](../../../README.md) 顶部“适配版本”同步为本次验证的版本。
- 按仓库惯例在 `docs/` 新增或更新本地适配记录，写明词库增量、前端资源 SHA-256（如已计算）、验证结果与未验证项。
- 不修改 `VERSION`，除非用户明确要求发版。

### 7. 验证

按顺序执行最小验证集：

```bash
node tools/build-overlay.mjs --check
node tools/lint-overlay.mjs resources/antigravity-hans-overlay.js
node --test tools/overlay.test.mjs
go vet ./...
go test ./...
```

需要交付可执行文件时，Unix 执行 `./build.sh`、Windows 执行 `build.bat`（均交叉编译 Windows / macOS / Linux 共 5 个产物到 `dist/`）。

通过标准：

- lint 零错误；警告必须逐条确认，残留英文只能是白名单词汇。
- 回归测试全部通过，包括既有测试。
- Go 静态检查与单元测试通过。
- 若修改了资源路径或启动逻辑，额外用 `info` 确认版本和路径仍能识别。

## 关键约束

- 不复制原应用资源进仓库，不提交密钥、账号信息或用户数据。
- 不把代码块、编辑区、终端内容纳入翻译范围。
- 不为了覆盖率翻译不可见、仅内部使用或由功能开关控制的文案。
- 不修改与本次适配无关的 Go 代码、构建配置或安全校验。
- 发现新版资源目录结构变化时，先对照 [patch.go](../../../internal/patch/patch.go) 中的 `out/vs/code/electron-browser/workbench` 路径确认，再做最小调整。
