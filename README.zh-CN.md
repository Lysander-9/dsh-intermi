# dsh-intermi — 交互式终端

简体中文 | [English](README.md)

dsh-intermi 在 DSH NEXT 右侧边栏中，让用户和 Agent 共同查看、操作 Agent 自己使用的持久 PTY。插件不会创建另一个看起来相似的终端。

## 功能

- 每个 Agent 会话使用自己的持久 PTY。Agent 通过 DSH 原生终端工具创建和操作 Shell，dsh-intermi 连接同一个 PTY。
- 一个紧凑的会话选择器集中列出多个 Agent 的终端，并使用 DSH 保存的会话标题作为名称。切换只更换当前显示的终端，不会关闭其他 Shell；插件会记住上次选择。
- 右侧终端通过 WebSocket 连接 Agent 的 PTY，显示实时输出和滚动历史。用户可以直接输入，Agent 也能继续使用同一个 Shell。
- 每个 PTY 的近期输出会保存在本机，最多 512 KiB；超出上限后优先丢弃较早内容。退出 DSH 会结束运行中的进程，但已保存的终端输出仍可查看。
- 支持高对比度深色、浅色主题及自定义文字和背景颜色，配色保存在浏览器中。
- 用户可以删除选中的 Agent Shell；删除会结束该 Shell 中的进程，不影响其他会话。
- 历史命令事件继续保存在 `%USERPROFILE%\.dsh\itatmn\events.jsonl`，以兼容此前版本的数据。
- 禁止 Agent 使用独立的 `ops_bash`、`bash` 和 `pwsh` 工具执行 Shell 命令，确保终端操作都发生在 Agent 自己的持久 PTY 中。

## 使用方法

1. 在 DSH NEXT 右侧边栏打开 **dsh-intermi**。
2. 让一个或多个 Agent 执行终端操作，它们使用的 PTY 会出现在会话选择器中。
3. 选择会话即可连接对应终端。切换会话不会关闭之前的 Shell；Agent 可继续通过 `terminal_send` 和 `terminal_read` 使用它。
4. 点击终端后即可输入命令；按 `Ctrl+C` 可中断前台命令，同时保留 Shell。

如果 Agent 还没有持久 PTY，先让它执行终端操作以创建 Shell。顶部数量只统计仍在运行的持久 PTY，不包括已结束终端的历史记录。关闭或切换侧边栏只会断开界面连接；用户删除终端或 DSH 关闭时，Shell 才会结束。DSH 退出后进程不会继续运行，但 dsh-intermi 会保留每个 Shell 最多 512 KiB 的输出供后续查看。重新打开插件时会恢复上次选择，并连接仍存活的 PTY 或显示已保存的终端内容。

## 开发说明

Host 入口为 `lib/index.js`，右侧边栏客户端由 DSH 的客户端 facet 加载。浏览器端终端资源来自 Termcp Desktop 使用的 xterm.js 发行包，许可信息见 `THIRD_PARTY_NOTICES.md`。插件沿用 Termcp 的长连接传输方式，同时始终连接 Agent 自己的 PTY。
