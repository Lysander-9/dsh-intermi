# dsh-intermi Multi-Agent Terminal Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first DSH sidebar where a developer can identify, switch between, and interact with multiple Agents' existing persistent PTYs while preserving each shell across view changes.

**Architecture:** Keep DSH as the owner of Agent PTYs. The Host facet will expose a stable session inventory and bounded per-session terminal recovery state; the client will show a compact Agent/Shell selector and mount one xterm view for the selected PTY. Selection changes only the view connection and never create, close, or transfer ownership of a PTY.

**Tech Stack:** DSH Host API, Node.js, WebSocket, xterm.js, browser localStorage for view preference, JSONL/file persistence under DSH home.

**Spec:** `docs/superpowers/specs/2026-10-28-dsh-intermi-multi-agent-terminal-design.md`

## Global Constraints

- Reuse DSH's registered Agent object and actual `sessionId` for all PTY operations.
- A view disconnect or Agent selection change must not close the PTY.
- Keep one rendered terminal at a time; multi-terminal tiling is out of scope.
- Keep data local; no cloud services, accounts, or team backend.
- Keep legacy audit data at `%USERPROFILE%\\.dsh\\itatmn\\events.jsonl` readable.
- Bound terminal recovery data and handle corrupt/partial persisted records without blocking session discovery.

## Review Focus

- Agent PTY exists before or after UI load: inventory refresh must discover it without duplicating it.
- Two PTYs emit output while switching: no output may be routed to the wrong terminal.
- View closes/reopens or websocket reconnects: PTY survives and the correct snapshot is restored.
- PTY exits or Agent is removed during a connection: UI transitions to ended state and cleans listeners.
- Terminal output includes binary-like data, ANSI control sequences, or exceeds history limits: transport remains responsive and replay stays bounded.

---

## File Map

- Modify `lib/host.js`: inventory API, session identity, PTY lifecycle subscriptions, per-session recovery store, WebSocket attach/detach and state reporting.
- Modify `lib/client.js`: compact session selector, persisted selection, one-terminal view lifecycle, clear connection states and keyboard focus behavior.
- Modify `README.md`: document multi-Agent discovery, selection, reconnect behavior, and data retention limits.
- Create `docs/superpowers/specs/2026-10-28-dsh-intermi-multi-agent-terminal-design.md`: accepted product requirements.
- Create `docs/superpowers/plans/2026-10-28-dsh-intermi-multi-agent-terminal.md`: this implementation plan.

## Task 1: Define the session inventory contract

**Files:**
- Modify `lib/host.js`

**Interfaces:**
- Produce `GET /api/dsh-intermi/sessions` returning `{ agents: [{ agentId, title, status, terminals: [{ terminalId, name, type, status, cwd, pid }] }], shellCount }`.
- Agent and terminal IDs must be stable DSH IDs; `cwd` and title may be null when DSH metadata is missing.
- Include only DSH-owned PTYs in the interactive inventory; keep historical audit-only entries separate from live shells.

- [ ] Add inventory serialization that tolerates missing Agent/session metadata.
- [ ] Reconcile the snapshot with current DSH agent and terminal registries on every request.
- [ ] Preserve existing API consumers or update client parsing atomically with the new contract.
- [ ] Verify the inventory with zero sessions, multiple Agents, multiple PTYs for one Agent, and an Agent removed during refresh.

## Task 2: Make terminal recovery state per-session and bounded

**Files:**
- Modify `lib/host.js`

**Interfaces:**
- Key recovery state by `terminalId`, not selected Agent or websocket client.
- Persist a versioned record containing the serialized xterm snapshot or bounded output replay plus update timestamp and terminal identity.
- Expose attach payload `{ type: "snapshot", terminalId, data, resumable }` before streaming new output.

- [ ] Replace volatile-only history with a versioned local recovery format while retaining a bounded in-memory hot buffer.
- [ ] Serialize writes per terminal and cap both individual history and total recovery storage; prune oldest closed-session data first.
- [ ] Recover from partial/corrupt trailing records without preventing Host startup or live PTY discovery.
- [ ] Preserve current audit JSONL compatibility and do not silently reinterpret old records as live PTYs.
- [ ] Verify recovery after Host/plugin reload, output overflow, partial final write, and missing recovery file.

## Task 3: Isolate websocket attachment and output by PTY

**Files:**
- Modify `lib/host.js`

**Interfaces:**
- Keep one active view attachment per client, identified by `{ agentId, terminalId }`.
- On attach, validate that the exact DSH session belongs to the requested registered Agent; emit snapshot first, then live output.
- On detach, remove view listeners and release the attachment only; never call DSH terminal close.

- [ ] Implement an explicit attach/detach message pair and reject unknown or mismatched PTY ownership.
- [ ] Ensure resize/input messages are applied only to the currently attached PTY.
- [ ] Serialize initial snapshot and output events to prevent duplicate, missing, or cross-session output during attachment.
- [ ] On PTY close, Agent removal, or socket disconnect, clean all listeners and emit/record the correct lifecycle state.
- [ ] Verify two simultaneous PTYs producing distinguishable output while the client switches rapidly between them.

## Task 4: Build the compact Agent/Shell selector and terminal switching

**Files:**
- Modify `lib/client.js`

**Interfaces:**
- Selector uses session inventory and stores last selected `{ agentId, terminalId }` in localStorage.
- One xterm instance may be reused across sessions only after clearing its prior screen and subscriptions; otherwise dispose and recreate it safely.
- The selected terminal receives keyboard input only while its websocket attach is confirmed.

- [ ] Replace the single Agent dropdown with a compact, searchable Agent/Shell list that surfaces name and live status without shrinking the terminal area excessively.
- [ ] Restore the last selection if it still exists; otherwise select the first live PTY.
- [ ] Switch by detaching old PTY and attaching new PTY, preserving both shell processes and selecting the target's recovered screen.
- [ ] Show connecting, disconnected/retrying, ended, and empty states distinctly; disable typing until writable attach confirmation.
- [ ] Keep the existing appearance settings and resize behavior intact.
- [ ] Verify keyboard focus, resize, fast switching, and empty/deleted-session flows.

## Task 5: Lifecycle, deletion, and release documentation

**Files:**
- Modify `lib/host.js`
- Modify `lib/client.js`
- Modify `README.md`

**Interfaces:**
- Delete remains an explicit terminal operation; merely hiding, switching, detaching, or closing the plugin panel never deletes a shell.
- Closed terminal history follows the documented bounded retention policy; live PTY ownership stays with DSH.

- [ ] Ensure deletion updates inventory and recovery metadata without affecting other Agent sessions.
- [ ] Document how to select a session, resume after reopening, input into the shared shell, and what history survives plugin restarts.
- [ ] Confirm the package includes only intended source, docs, and vendored terminal assets.
- [ ] At implementation time, run the agreed checks for syntax/manifests and the manual DSH smoke scenarios from the spec before claiming completion.

## Rollout order

Tasks 1–3 establish the Host contract and session isolation. Task 4 consumes that contract for the UI. Task 5 closes lifecycle and user-facing documentation gaps. Keep each task reviewable and avoid expanding the first release into search, export, team sync, or tiled terminals.
