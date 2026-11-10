# Antigravity 2.30.0 与 IDE 2.6.0 适配

## 修改

- IDE 的智能体和独立设置页使用本地内嵌页面。动态监视器在确认页面地址、本地监听进程及其 IDE 进程归属后注入；导航后重新校验，不对任意网页持续注入。新增 `--attach-only`，用于仅连接已有调试端口。
- 补充设置、悬浮提示、斜杠命令及其他界面词条。对话名称、命令、路径、URL 和快捷键等动态内容按原样保留；斜杠命令菜单保留实际命令和技能名称。
- 补充 IDE 2.6.0 原生工作台中部分未翻译的 NLS 条目。补充项仅在 `zh-cn`、版本锚点和对应英文原文均匹配时生效；部分译文来自微软 [vscode-loc](https://github.com/microsoft/vscode-loc/tree/1f1da543fbfa92484caffb835b13294d66878457)，许可证见 [MICROSOFT-VSCODE-LOC.txt](licenses/MICROSOFT-VSCODE-LOC.txt)。
- 更新词库时恢复仍为旧译文的节点，再应用新规则；不会覆盖应用已经修改的内容。

## 验证与限制

- Windows 上验证了 Antigravity 2.30.0 斜杠菜单，以及 IDE 2.6.0 工作台、智能体页、独立设置页和部分快捷设置悬浮提示。
- 自动化测试覆盖注入目标与进程归属、仅连接模式、权限与变量保留、语言切换、悬浮提示、斜杠菜单和 NLS 版本校验。
- 已初始化并缓存的原生控件可能需要重新创建后才读取补充译文。系统对话框、第三方扩展、未加载页面以及未来版本仍可能出现英文；macOS 未实机验证。
- IDE 工作台资源 `workbench.desktop.main.js` 的 SHA-256 为 `0a7127d6df014109a4bd7921fdd0e2548601c0cdb9193ae14ed860c8439eb647`；英文 `nls.messages.json` 的 SHA-256 为 `d8841e7c53cee2a8f2185f2d70fd65cd4b1b81167a282bfce3c45eb18499f466`。
