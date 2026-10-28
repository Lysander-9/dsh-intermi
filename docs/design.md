# dsh-intermi

## Purpose

A DSH NEXT right-sidebar terminal workspace for viewing and switching between the real persistent PTYs owned by multiple Agent conversations.

## Current behavior

- The selector lists each live Agent Shell using the conversation title stored by DSH. Multiple Shells in one conversation include their terminal names.
- Selecting a Shell attaches the single xterm.js view to its existing DSH PTY. Switching or closing the sidebar view never closes the other PTYs.
- Agent and user keyboard input share the same PTY. Ctrl+C is sent as normal terminal input.
- The last selected conversation and Shell are saved in browser local storage.
- Each PTY has a bounded 512 KiB output buffer persisted under `%USERPROFILE%\\.dsh\\itatmn\\terminals`. After DSH exits, the shell process itself ends; saved output remains available for review.
- Historical tool audit events remain at `%USERPROFILE%\\.dsh\\itatmn\\events.jsonl` for compatibility with earlier releases.
- Dark, light, and custom terminal colors are supported.

## Architecture

The Host facet uses DSH's `agents` and `terminals` services as the source of truth for live PTYs. It enforces one Agent-owned PTY per Agent command flow, records tool events, persists bounded terminal output, and exposes same-origin HTTP and WebSocket routes. The Client facet registers the right-sidebar panel and renders one xterm.js terminal at a time.

Conversation labels are read from DSH's local `session_projcache` storage, keyed by the Agent/session ID. If title metadata is unavailable, the UI falls back to the Agent/session label.

## Boundaries

- The plugin does not create a shadow shell or modify DSH's installed application bundle.
- DSH owns PTY lifetime. A process cannot continue after DSH exits; only its saved terminal output can be reviewed.
- Saved output is bounded to 512 KiB per PTY. Older output is discarded first when the limit is reached.
- Audit records contain Agent tool inputs and results. User keystrokes are visible in the live terminal but are not stored as structured command events.
- The package targets DSH `0.2.1-rc.2` and Node.js 22 or newer.
- The historical data directory keeps its original `itatmn` name to preserve existing user data.
