# Antigravity 2.34.0 普通版适配

## 修改

- 共用词库新增 15 条 Antigravity 2.34.0 普通版静态界面文案，覆盖「模型与用量」中的新版 Ultra 套餐升级提示、`Orchestrator Settings`（协调器设置 / 协调器模型 / 执行器模型及说明）、模型下拉菜单中的 `Thinking effort` 与 `Extra High` 档位，以及主界面中的 `Edits the conversation title`、`You said`、`Agent said`、`Agent working`、`Breadcrumb` 等控件文案。
- 推理强度档位补充 `Extra High`（译为「超高」），同步加入「选项名保留英文」内置预设（`englishLabelsPreset`），并修复 `Select model, current: ...` 将 `Extra High` 错拆为 `Extra 高` 的问题；扩展模型档位匹配规则以覆盖 `Gemini 4 Neon Extra High`、`Gemini 4 Hydrogen Extra High`、`Gemini 4 Neon (Extra High)` 与 `GPT-OSS 120B (Medium)`，开启「选项名保留英文」时均保留档位英文。
- 新增 3 条主界面控件动态模板：`Updated HH:MM`、`Project: <名称>` 与 `Open conversation <UUID>`，保持项目名与会话 ID 原样不变并保证二次扫描幂等。
- 在 `tools/overlay.test.mjs` 补充 `2.34.0` 回归测试，覆盖新增静态词条、推理强度与预设切换、以及动态变量保护。
- 同步更新 `README.md` 顶部的普通版适配版本与「选项名保留英文」说明表格。

## 验证与限制

- 在 macOS (Apple Silicon) 上实机核对了 Antigravity `2.34.0` 普通版的「模型与用量」设置页、模型选择下拉菜单及主对话界面。
- 本次未对 Antigravity IDE `2.7.0` 的原生 NLS 索引与界面做完整核对，因此 README 中 IDE 适配版本保持 `2.6.0` 不变。
- 已运行 `node tools/lint-overlay.mjs antigravity-hans-overlay.js`（0 错误、0 新增警告）、`node --test tools/overlay.test.mjs`（69/69 通过）、`go vet ./...`、`go test ./...`（本机因 Antigravity 运行中仅既有的 `TestInstallPatchUpdatesExistingScriptWithoutOverwritingOtherFiles` 受进程探测影响，其余全部通过）及本地 macOS ARM64 编译。


## 模型选择器徽标勘误（#31）

- Windows x64 普通版 2.34.0 的截图显示，模型和协调器旁的 `New` 是状态徽标。根据本机该版本的前端资源，将「新」限定在模型选择器的徽标内，其他界面中的新建操作保留原译。
- 补充带说明图标和纯文本徽标对应的文本回归用例，并覆盖 `Notice`、普通 `New`、`New Conversation` 及二次处理。词库检查无新增问题；JavaScript 测试 70/70 通过。未将修改后的脚本部署到本机 Antigravity。
