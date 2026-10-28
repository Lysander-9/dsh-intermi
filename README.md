# dsh-intermi — Interactive Terminal

dsh-intermi gives a person and a DSH Agent a shared view of the Agent's existing persistent PTY. It does not create a second user-owned terminal.

## What it does

- One persistent PTY per Agent conversation. The Agent opens it through DSH's native terminal tools; dsh-intermi attaches to that same DSH PTY. No duplicate shell is created.
- A single compact session selector lists terminals across Agents using each DSH conversation's saved title. Selecting another entry switches the view to its existing PTY; it does not close the previous shell. The last selection is remembered in the browser.
- A right-sidebar xterm.js screen attaches to the Agent's existing PTY over one duplex WebSocket, restores recent scrollback when reopened, streams raw PTY output, and sends keyboard input and resize events to that same session. The user can click the terminal and type into the live shell, including while the Agent is using it.
- Recent output is buffered per live PTY and persisted locally (up to 512 KiB per terminal). If the buffer fills, oldest output is discarded first. After DSH exits and a PTY ends, its saved output remains available as a read-only archived terminal.
- Terminal colors offer high-contrast dark and light presets plus custom background and text colors. The choice is saved in the browser.
- The delete button closes the selected Agent-owned PTY and its processes after confirmation; the Agent can open a new persistent shell later.
- The session list shows every conversation with a live persistent Shell, including idle conversations whose Agent turn has ended. Historical command events remain available in `%USERPROFILE%\.dsh\itatmn\events.jsonl` for compatibility with earlier releases.
- Standalone `ops_bash`, `bash`, and `pwsh` tools are denied so shell work stays on the Agent's one persistent PTY.

## Use

1. Open the **dsh-intermi** card in the right sidebar.
2. Ask Agents to run terminal operations. dsh-intermi lists their existing PTYs together in the session selector, labeled with the Agent conversation title.
3. Choose an Agent/Shell to attach the large terminal view to that PTY. Switching entries leaves other Shells running. The Agent can continue using the selected shell through `terminal_send` and `terminal_read`.
4. Click the terminal to focus it. Press Ctrl+C to interrupt a foreground command without closing the shell.

If the Agent has no persistent PTY yet, ask it to open its terminal first. Shell count reports live persistent PTYs, not archived records or independent commands. Closing or switching the sidebar view disconnects only the view; a Shell ends when the user deletes it or DSH closes it. DSH cannot resume a process after application exit, but dsh-intermi preserves up to 512 KiB of terminal output per Shell as read-only history. Reopening the plugin restores the last selection and reconnects live PTYs or displays their archived output.

## Development

The Host entry is `lib/index.js`; the sidebar client is loaded through the DSH right-sidebar client facet. Browser terminal assets are vendored from Termcp Desktop's xterm.js distribution; see `THIRD_PARTY_NOTICES.md`. The transport follows Termcp's long-lived WebSocket model while attaching only to the Agent-owned PTY.
