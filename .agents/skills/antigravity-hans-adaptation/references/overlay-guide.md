# overlay 适配指南

## 文件与结构

- **源码维护入口**（`resources/src/`）：
  - `dict/{common,settings,chat-agent,marketplace,ide}.json`：主窗口按 UI 领域分组的静态词条（纯 JSON，使用 `tools/dict.mjs` 维护，无需手动排序）。
  - `plugins/swarm.json`：独立 `plugin://` 插件面板的域名规则、选择器白名单与词条（可用 `node tools/dict.mjs <add|set|remove|find|stats>` 配合 `plugin:swarm` 分组维护）。
  - `runtime/rules.js`：特殊匹配规则（任务进度栏、权限模板、动态正则、首页问候语、DOM 白名单、`composedSentences` 与歧义上下文）。
  - `runtime/engine.js`：主窗口生命周期、默认指纹、偏好持久化、跨帧同步、DOM 遍历与 `MutationObserver`、悬浮中英切换球。
  - `runtime/swarm.js`：Swarm 插件面板运行时模板。
  - `ide-nls.json`：IDE 原生语言包补充映射。
- **生成产物**（均由 `node tools/build-overlay.mjs` 自动编译生成，禁止手改）：
  - [resources/antigravity-hans-overlay.js](../../../../resources/antigravity-hans-overlay.js)（主窗口与 IDE 词库）
  - [resources/swarm-overlay.js](../../../../resources/swarm-overlay.js)（Swarm 独立沙盒插件脚本，运行期与主词库保持隔离）

## 匹配流水线

`translate(value)` 的顺序（改动顺序会影响结果）：

1. 项目删除模板等特殊句式。
2. `translatePermission`：权限模板优先，命中后立即返回。
3. WSL 安装等含发行版名称的模板。
4. `matchExactPhrase`：完整文本精确匹配、大小写不敏感匹配、快捷键后缀、标点后缀。
5. `Last N days` 等历史半翻译修复。
6. `translateAgentProgress`：任务进度栏。
7. 长度大于 15 的词条做子串替换（按长度倒序）。
8. `dynamicPatterns`：动态变量规则。
9. `patternsPost`：后置微调。

关键推论：

- 长度不超过 15 的词条不会在长句中做子串替换，只适合完整控件文本。
- 长词条会先于动态规则执行，新增词条时避免覆盖动态规则依赖的原文。
- 任何规则都必须幂等，因为 MutationObserver 会再次观察并处理译文。

## 词条规则

词典体检脚本：[tools/lint-overlay.mjs](../../../../tools/lint-overlay.mjs)

硬性错误：

- 源文长度必须按数组顺序非递增。
- 键或译文为空。
- 键包含字面反斜杠、控制字符。
- 键与译文完全相同。
- 重复键。
- 权限类词条出现语义反转（allow/deny 与允许/禁止矛盾）。

警告：

- 译文残留小写英文单词。产品名、协议名、命令名、路径名在 `ALLOWED_LATIN` 白名单内。

编写建议：

- 保持原文大小写、标点、省略号、空格；界面文本以真实资源或截图为准。
- 一个源文只写一条，优先复用已有词条，避免近似重复。
- 短词（如 `View`、`More`）只用于独立控件，不要用于长句中间。
- 中文尽量简洁，符合界面用语；不要添加原文没有的解释。
- 不翻译代码、命令、路径、URL、工具名、变量值。

## 动态文案

适用场景：数字、时间、文件名、项目名、模型名、配额等会变化的文本。

写法：

```js
[/Show (\d+)\s*breakdowns?/gi, '显示 $1 个明细'],
[/Worked for ((?:\d+\s*[dhms]\b\s*)+)/gi, (_m, dur) => '已工作 ' + formatShortDuration(dur)],
```

规则：

- 使用捕获组保留变量；替换串中的 `$1`、`$2` 只在没有歧义时使用。
- 目标文本可能包含 `$&`、`$'`、`` $` `` 时，使用回调返回译文，避免被当成替换指令。
- 多条规则可能叠加，新增规则要检查是否会二次改写已翻译文本。
- 数字单位统一走现有 `formatRelativeTime`、`formatShortDuration` 等函数，避免重复实现。

## 权限文案

权限提示中的命令、路径、URL、工具名、规则内容都是数据，只能翻译固定模板。

- 模板匹配使用 `^...([\s\S]+)$` 保留目标原文。
- 返回时必须使用 `value.replace(text, () => translated)`，防止目标中的 `$` 序列被解释。
- 已翻译权限文本要在函数开头识别并原样返回，保证二次处理不变。
- 未知权限模板必须保留原文，不能猜测翻译。
- 修改权限相关规则后，必须运行 [tools/overlay.test.mjs](../../../../tools/overlay.test.mjs) 中的权限目标用例。

## DOM 翻译范围

- 跳过 `script`、`style`、`code`、`pre`、`.xterm`、`.monaco-editor`。
- 输入框、文本域、可编辑区域的正文不翻译，但其 `placeholder`、`aria-label`、`title` 可以翻译。
- 智能体回复正文默认跳过，只保留控件、步骤栏、变更概览和系统提示。
- IDE 主窗口通过 `antigravityContainerSelector` 白名单限定范围；新增界面区域若不在白名单内，需要补充选择器。
- React 把一句话拆成多个文本节点时，用 `composedSentences` 按节点改写；不要用整句替换，否则会破坏行内链接。

## 指纹与注入

- 默认指纹格式：`app-<普通版版本>-<YYYYMMDD>-r<N>`。
- Go 启动器注入时会用 overlay 内容的 SHA-256 作为实际指纹，并覆盖默认值。
- 静态补丁会把 overlay 复制到 IDE 的 workbench 目录，并修改 `workbench.html`、`workbench-jetski-agent.html` 与 `product.json` 校验和。
- 更新词库后必须更新默认指纹，便于人工核对和静态注入场景识别版本。

## 普通版与 IDE 差异

| 项目 | Antigravity 普通版 | Antigravity IDE |
|------|-------------------|-----------------|
| 调试端口 | 58321 | 58322 |
| 版本来源 | `resources/app.asar` 内 `package.json` | `resources/app/product.json` 的 `ideVersion` |
| 前端资源 | 运行时页面，asar 内只有主进程代码 | `resources/app/out` 可直接检索 |
| 静态补丁 | 不支持 | 支持 |
| 词库 | 共用同一份 overlay | 共用同一份 overlay |

适配时分别验证两个应用；同一词条出现在两个应用中时，确保译文在两边语境下都成立。

## 资源结构变化排查

若新版启动或静态补丁失败：

1. 运行 skill 脚本 `info`，确认安装路径和版本识别正常。
2. 检查 IDE 的 `resources/app/out/vs/code/electron-browser/workbench` 是否存在。
3. 若目录变化，对照 [patch.go](../../../../internal/patch/patch.go) 中的 `getResourcesDir`、`workbenchDir`、`htmlFiles` 做最小调整。
4. 检查普通版的 `resources/app.asar` 是否仍存在，`package.json` 是否仍包含 `version`。
5. 不要为了绕过结构变化而放宽路径、权限或校验逻辑。

## 验证命令

```bash
node tools/build-overlay.mjs --check
node tools/lint-overlay.mjs resources/antigravity-hans-overlay.js
node --test tools/overlay.test.mjs
go vet ./...
go test ./...
```

发布构建见 [build.sh](../../../../build.sh)。Windows 本地至少执行 `go build ./...`。
