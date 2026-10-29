# dsh-intermi

**直接查看并操作 DSH Agent 正在使用的终端。** dsh-intermi 将 Agent 自己的持久 Shell 显示在 DSH NEXT 右侧边栏，方便你观察执行过程，并在需要时接手操作。

简体中文 · [English](README.md)

## 界面预览

在会话旁查看 Agent 正在使用的持久终端：

![dsh-intermi 在 DSH 会话旁显示 Agent 的实时终端](docs/images/agent-terminal-in-use.png)

终端选择器使用简洁名称。展开后可以切换 Shell，也可以点击对应条目右侧的红色叉号删除：

![终端选择器显示简洁名称和逐项删除按钮](docs/images/terminal-selector-delete.png)

## 为什么使用 dsh-intermi？

普通终端面板展示的是另一个 Shell。dsh-intermi 连接的是 Agent 已经拥有的 PTY：同一个会话、同一条实时输出流，由你和 Agent 共同使用。

- **实时观察**：查看 Agent 执行期间的终端输入和输出。
- **切换 Agent**：根据 DSH 会话标题选择终端，不会关闭其他 Shell。
- **需要时接手**：点击终端即可在同一个 Shell 中输入；按 `Ctrl+C` 中断前台命令后，Agent 仍可继续使用该 Shell。
- **保留完整输出**：PTY 输出会完整保存在本机磁盘；界面滚动缓冲默认保留 50,000 行，可在“终端显示设置”中调整为 5,000–100,000 行。
- **区分 Agent 结果与用户历史**：Agent 每次只收到当前 `terminal_send` 命令的结果；完整终端历史只在 ITMN 界面提供给用户查看。DSH 没有返回输出时，dsh-intermi 只补回能确认属于本次命令的增量，否则报告状态不确定；不会把保留的历史交给 Agent，也不会重发命令。
- **调整配色**：选择深色、浅色主题，或自定义文字和背景颜色。

## 安装

在 DSH NEXT 的插件市场中，从 GitHub 安装 **dsh-intermi**：

[`Lysander-9/dsh-intermi`](https://github.com/Lysander-9/dsh-intermi)

如果插件市场要求填写仓库地址，请使用：

```text
https://github.com/Lysander-9/dsh-intermi.git
```

如果插件市场提示重启 DSH NEXT，请按提示重启，然后在右侧边栏打开 **dsh-intermi**。

## 快速开始

1. 打开或选择一个 Agent 会话。
2. 让 Agent 执行终端任务。dsh-intermi 会引导 Agent 使用 DSH 原生持久终端。
3. 在终端选择器中选择对应会话，即可查看该 Agent 的实时 PTY。
4. 点击终端即可输入命令；按 `Ctrl+C` 中断前台命令，但不会关闭 Shell。

Agent 打开持久 Shell 后，终端才会出现在选择器中。切换选择器只会切换当前查看的 Shell，其他 Shell 会继续运行。

## Shell 与输出记录

- 每个 Agent 会话使用自己的持久 Shell。dsh-intermi 不会另建一个看起来相似的终端。
- 关闭或切换右侧边栏只会断开界面连接，不会关闭 Shell。
- 删除 Shell 会关闭对应 PTY 及其中运行的进程，并移除该终端保存的输出；审计事件仍保存在本机。
- dsh-intermi 会将观察到的 PTY 输出持续追加到本机每终端日志，重新打开时从头回放。日志没有磁盘容量上限，会持续占用本机磁盘，直到用户删除该终端。界面内存滚动缓冲默认保留 50,000 行，可在“终端显示设置”中自定义为 5,000–100,000 行；上限越高，内存占用越多。退出 DSH NEXT 会结束运行中的 PTY 进程，但已保存的输出仍可只读查看；重启后不会恢复原进程。
- 终端历史和命令事件保存在本机 DSH home 的 `itatmn/` 目录中；`events.jsonl` 保存命令事件。
- 为确保 Shell 操作都经过可审计的 PTY，dsh-intermi 启用时会拦截独立的 `pwsh`、`bash` 和 `ops_bash` Shell 工具。

## 环境要求

- DSH NEXT `>= 0.2.1-rc.2` 且 `< 0.3.0`
- Agent 可使用 DSH 原生持久终端工具

## 开发与致谢

Host 入口为 `lib/index.js`，右侧边栏客户端为 `lib/client.js`。浏览器终端使用了随项目分发的 xterm.js 资源。来源与许可信息见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 许可证

当前 package manifest 声明为 `UNLICENSED`。
