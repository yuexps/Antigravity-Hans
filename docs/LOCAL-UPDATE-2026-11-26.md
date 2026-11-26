# Antigravity 2.35.2 普通版汉化补充

- Google 在 2.35.2 重新开放回合运行期间的模型选择，并增加两种提示，分别说明新选择何时应用于后续消息，以及支持时如何应用于 /btw。
- 在 Windows x64 2.35.2 前端资源中核对这两条英文文案。补充两条设置词库译文，覆盖工具提示和模型选择器的读屏标签。测试验证模型名、推理强度和 /btw 的处理，以及二次翻译的稳定性。
- 保留 2.35.0/2.35.1 使用的模型锁定译文。2.35.2 前端仍使用原有的权限锁定提示。
- 生成文件一致性检查通过。词库检查零错误、零新增警告，78 项 JavaScript 回归测试、Go 静态检查和单元测试均通过。本次未部署到运行中的客户端，未发起模型请求实测运行中切换。
- 核对所用 2.35.2 前端资源的 SHA-256 为 494f0599aa61a7fa97eea7d5d7ab6cd14ddf05866a0bfb0c709a2d75ddfcb58c。

## 二次补充（编排器、SSH 完整交互、浏览器数据与 /btw）

- 核对 macOS Apple Silicon `2.35.2` 内嵌前端资源 `main.js`（SHA-256 同为 `494f0599aa61a7fa97eea7d5d7ab6cd14ddf05866a0bfb0c709a2d75ddfcb58c`），补齐此前尚未覆盖的 4 块用户可见界面文案：
  1. 编排器（Orchestrator）路由切换设置项（`Model selection`、默认/自定义路由说明与 `Orchestrator model selection`）以及模型菜单默认项（`Default (Gemini Pro)`、`The Orchestrator's own planner`）。
  2. SSH 远程主机完整流程：连接弹窗（标题、配置路径选择、最近记录移除与列表隐藏/显示操作、空状态与错误提示）、命令面板（`Stop SSH Server…`、`Switch to This Computer`）与机器切换器状态文案。
  3. 内置浏览器设置「浏览数据」行及「清除浏览数据」「按站点管理 Cookie」两个弹窗的静态文案、计数与站点删改模板。
  4. `/btw` 侧边提问空输入校验提示（`Enter a side question after /btw`）。
- 针对 React 将变量拆分为纯文本兄弟节点的 4 处提示（SSH 连接失败、SSH 弹窗空列表、Cookie 删除失败、站点搜索无匹配），新增 `translateSplitVariableText` 保护主机名、配置路径、域名与搜索词不被误译并保证幂等。
- 本次补齐新增 44 条静态词条（`settings` 24 条、`chat-agent` 20 条）、3 条 `dynamicPatterns`、4 条 `dynamicAriaLabels` 与 12 条前置整句模板，指纹更新为 `app-2.35.2-20261126-r2`。
- 通过 `node tools/build-overlay.mjs --check`、`node tools/lint-overlay.mjs`（0 错误、无新增警告）、全套 JS 回归测试与 Go 静态检查/单元测试；尚未通过真实 SSH 远端主机连接实机点测弹窗交互。
