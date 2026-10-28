# Release checklist

## Package contents

- `dsh-plugin.json`: plugin identity, Host facet, permissions, and right-sidebar contribution.
- `package.json`: runtime peers, DSH compatibility range, and client injection point.
- `lib/host.js`: Agent-owned PTY policy, title lookup, event audit log, bounded output archive, API routes, and WebSocket transport.
- `lib/client.js`: multi-Agent Shell selector, one-terminal view, live input, reconnect handling, appearance settings, and archived output view.
- `vendor/`: xterm.js browser distribution and FitAddon. See `THIRD_PARTY_NOTICES.md`.

## Checks used for this release

- Parse plugin/package manifests and locale JSON.
- Run `node --check` for Host, Client, and entry modules.
- Run `npm pack --dry-run --json` and inspect the package ID and file list.
- In DSH NEXT, verify multiple-Agent selection, real PTY input, switching without shell termination, delete isolation, reopening the plugin, and output recovery after restarting DSH.

## Known constraints

- Live PTYs are owned by DSH and end when DSH exits.
- Saved terminal output is limited to 512 KiB per PTY.
- Conversation title lookup follows DSH's local `session_projcache` format and falls back to the Agent/session label if metadata cannot be read.
- The audit/data directory remains `%USERPROFILE%\\.dsh\\itatmn` for compatibility.
