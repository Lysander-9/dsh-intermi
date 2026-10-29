import { randomBytes } from "node:crypto";
import { createReadStream, statSync } from "node:fs";
import { appendFile, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { createLazyRequire } from "@deepseek-ai/dsh-lazy-require";
import { recoverTerminalOutput } from "./terminal-output.js";

const API_PREFIX = "/api/dsh-intermi";
const ASSET_DIR = join(fileURLToPath(new URL("..", import.meta.url)), "vendor");
const DSH_HOME = process.env.DSH_HOME || join(process.env.USERPROFILE || homedir(), ".dsh");
// Keep the original data directory so renaming the plugin does not orphan logs.
const LOG_DIR = join(DSH_HOME, "itatmn");
const LOG_FILE = join(LOG_DIR, "events.jsonl");
const TERMINAL_ARCHIVE_DIR = join(LOG_DIR, "terminals");
const MAX_RECORD_CHARS = 80_000;
const MAX_BODY_BYTES = 65_536;
const MAX_SOCKET_BUFFERED_BYTES = 1_000_000;
const MAX_INPUT_BYTES = 16_384;
const TERMINAL_HISTORY_FRAME_CHARS = 32 * 1024;
const requireSerialize = createLazyRequire("@xterm/addon-serialize", import.meta.url);
const OBSERVED_TOOLS = new Set([
  "terminal_open",
  "terminal_send",
  "terminal_read",
  "terminal_signal",
  "terminal_close",
  "terminal_list",
  "pwsh",
  "ops_bash",
  "bash"
]);

function now() {
  return new Date().toISOString();
}

function boundedJson(value, limit = MAX_RECORD_CHARS) {
  let serialized;
  try {
    serialized = JSON.stringify(value === undefined ? null : value);
  } catch (error) {
    serialized = JSON.stringify({ serializationError: String(error) });
  }
  if (serialized.length <= limit) return JSON.parse(serialized);
  return {
    truncated: true,
    preview: serialized.slice(0, limit)
  };
}

function commandInput(args) {
  if (!args || typeof args !== "object") return String(args ?? "");
  for (const key of ["text", "command", "cmd", "code"]) {
    if (typeof args[key] === "string") return args[key];
  }
  return JSON.stringify(args);
}

function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store"
  });
  response.end(body);
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("Request body is too large");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function isSameOrigin(request) {
  const requestOrigin = request.headers.origin;
  if (typeof requestOrigin === "string") {
    try {
      const origin = new URL(requestOrigin);
      const host = request.headers.host;
      return (origin.protocol === "http:" || origin.protocol === "https:")
        && typeof host === "string"
        && origin.host.toLowerCase() === host.toLowerCase();
    } catch {
      return false;
    }
  }
  return request.headers["sec-fetch-site"] === "same-origin";
}

function sessionSnapshot(ctx, agent) {
  const sessions = ctx.terminals.list(agent);
  return sessions.map((session) => ({
    agentId: agent.id,
    terminalId: session.sessionId,
    name: session.name || defaultTerminalName(agent),
    type: session.type,
    pid: session.pid ?? null,
    status: session.status
  }));
}

function defaultTerminalName(agent) {
  const cwd = agent.session?.header?.cwd;
  const directory = typeof cwd === "string" ? basename(cwd.replace(/[\\/]+$/, "")) : "";
  return directory ? `${directory} 主终端` : "Agent 主终端";
}

function readAgentEvents(events, before, limit) {
  const end = before === undefined ? events.length : Math.min(events.length, before);
  const start = Math.max(0, end - limit);
  return {
    events: events.slice(start, end),
    hasMore: start > 0,
    nextBefore: start
  };
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

export const name = "dsh-intermi";
export const inject = ["agents", "terminals", "webServer", "systemPrompt"];

export function apply(ctx) {
  ctx.systemPrompt.section({
    name: "dsh-intermi:single-shell",
    order: ctx.systemPrompt.getSectionOrder("TOOL_PTY") + 1,
    text: `For this workspace's terminal audit, run every shell command in exactly one persistent PTY for this Agent. Before any shell command, call terminal_list. If it returns a session, copy its sessionId exactly and reuse it. Otherwise call terminal_open with {type:"shell", name:"<meaningful purpose>"}; wait for the result, then copy the returned sessionId exactly. DSH only returns terminal_open after the Shell startup prompt is ready; never send a command before terminal_open succeeds. Pass that same sessionId as a top-level argument to every terminal_send, terminal_read, terminal_signal, and terminal_close call. Example: terminal_read({sessionId:"pty-1", count:40}); never call terminal_read without sessionId. Reuse the same PTY for every later command, including after an interrupted command. Do not use pwsh, ops_bash, bash, or any one-shot shell for command execution, and do not create a second shell through another tool. Keep the PTY open so cwd, environment, SSH, and REPL state persist. Give it a concise, useful name based on its purpose, such as the project, working directory, SSH host alias, or REPL. If terminal_send reports '(no new output)' or waitReason 'inferred_idle' or 'timeout', never resend the same command just because output is missing; inspect the same PTY once with terminal_read({sessionId, offset:0, count:500}). If the command state is still unclear after that read, stop and report the uncertainty instead of polling or resending.`
  });
  const activeCalls = new Map();
  const backgroundCalls = new Map();
  const reservations = new Map();
  const terminalOwners = new Map();
  const knownAgents = new Map();
  const auditByAgent = new Map();
  const socketToken = randomBytes(32).toString("base64url");
  const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: MAX_BODY_BYTES, perMessageDeflate: false });
  const socketClients = new Set();
  const terminalControllers = new Map();
  const terminalHistories = new Map();
  const archivedTerminals = new Map();
  const archiveTimers = new Map();
  const archiveWrites = new Map();
  const sessionTitles = new Map();
  const serializers = new WeakMap();
  let writeQueue = Promise.resolve();

  const knownAgentsReady = (async () => {
    try {
      const text = await readFile(LOG_FILE, "utf8");
      for (const line of text.split(/\r?\n/)) {
        if (!line) continue;
        try {
          const event = JSON.parse(line);
          if (typeof event.agentId === "string") {
            knownAgents.set(event.agentId, event.timestamp || "");
            const events = auditByAgent.get(event.agentId) ?? [];
            events.push(event);
            auditByAgent.set(event.agentId, events);
          }
        } catch {
          // Ignore a partial final line left by an interrupted write.
        }
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  })();

  const terminalArchiveReady = (async () => {
    try {
      for (const file of await readdir(TERMINAL_ARCHIVE_DIR)) {
        if (!file.endsWith(".json")) continue;
        try {
          const record = JSON.parse(await readFile(join(TERMINAL_ARCHIVE_DIR, file), "utf8"));
          if (typeof record?.agentId === "string" && typeof record.terminalId === "string"
            && ((record.version === 1 && typeof record.data === "string") || (record.version === 2 && record.dataFile === true))) {
            archivedTerminals.set(record.terminalId, record);
          }
        } catch (error) {
          ctx.logger.warn(`dsh-intermi: ignoring unreadable terminal archive ${file}: ${errorText(error)}`);
        }
      }
    } catch (error) {
      if (error?.code !== "ENOENT") ctx.logger.warn(`dsh-intermi: terminal archives unavailable: ${errorText(error)}`);
    }
  })();

  function reserve(ownerId, callId, kind) {
    const timer = setTimeout(() => {
      if (reservations.get(ownerId)?.callId === callId) reservations.delete(ownerId);
    }, 120_000);
    timer.unref?.();
    reservations.set(ownerId, { callId, kind, timer });
  }

  function releaseReservation(ownerId, callId) {
    const reservation = reservations.get(ownerId);
    if (reservation?.callId !== callId) return;
    clearTimeout(reservation.timer);
    reservations.delete(ownerId);
  }

  async function recordDenied(exec, reason) {
    await appendEvent({
      type: "tool-denied",
      timestamp: now(),
      agentId: exec.agent.id,
      callId: exec.callId,
      toolName: exec.name,
      input: boundedJson(exec.arguments),
      reason
    });
  }

  async function appendEvent(event) {
    const line = JSON.stringify(event) + "\n";
    writeQueue = writeQueue.catch(() => {}).then(async () => {
      await knownAgentsReady;
      await mkdir(LOG_DIR, { recursive: true });
      await appendFile(LOG_FILE, line, "utf8");
      if (typeof event.agentId === "string") {
        knownAgents.set(event.agentId, event.timestamp || now());
        const events = auditByAgent.get(event.agentId) ?? [];
        events.push(event);
        auditByAgent.set(event.agentId, events);
      }
    });
    await writeQueue;
  }

  function registeredOwner(agent) {
    // DSH's PTY controller checks strict identity against agents.get(id).
    // Keep the exact registered Agent object; wrapping it breaks terminal_open.
    terminalOwners.set(agent.id, agent);
    return agent;
  }

  async function conversationTitle(agent) {
    const fallback = agent.session?.header?.title || agent.session?.title || agent.session?.name;
    const sessionId = agent.id;
    const file = join(DSH_HOME, "storages", "session_projcache", "sessions", `${sessionId}.json`);
    try {
      const info = await stat(file);
      const cached = sessionTitles.get(sessionId);
      if (cached?.mtimeMs === info.mtimeMs) return cached.title;
      const metadata = JSON.parse(await readFile(file, "utf8"));
      const stored = metadata?.record?.rows?.title?.val;
      const title = typeof stored === "string" && stored.trim() ? stored.trim() : fallback;
      const result = typeof title === "string" && title.trim() && title !== sessionId ? title.trim() : "";
      sessionTitles.set(sessionId, { mtimeMs: info.mtimeMs, title: result });
      return result;
    } catch {
      return typeof fallback === "string" && fallback !== sessionId ? fallback : "";
    }
  }

  function ownedSessions(agent) {
    return ctx.terminals.list(registeredOwner(agent));
  }

  function terminalRecord(agent, terminalId) {
    const record = ctx.terminals.sessions.get(terminalId);
    if (!record || record.owner?.id !== agent.id || record.closing) return undefined;
    return record;
  }

  function terminalSnapshot(record) {
    const emulator = record.session.emulator;
    if (!emulator || (typeof emulator !== "object" && typeof emulator !== "function")) return "";
    try {
      let serializer = serializers.get(emulator);
      if (!serializer) {
        const { SerializeAddon } = requireSerialize();
        serializer = new SerializeAddon();
        // SerializeAddon reads xterm's proposed buffer API. DSH's headless
        // emulator is created without this opt-in, so enable it before loading.
        emulator.options.allowProposedApi = true;
        emulator.loadAddon(serializer);
        serializers.set(emulator, serializer);
      }
      return serializer.serialize();
    } catch (error) {
      ctx.logger.warn(`dsh-intermi: terminal screen snapshot unavailable: ${errorText(error)}`);
      return "";
    }
  }

  function terminalArchivePaths(terminalId) {
    const file = Buffer.from(terminalId).toString("hex");
    return {
      metadata: join(TERMINAL_ARCHIVE_DIR, `${file}.json`),
      output: join(TERMINAL_ARCHIVE_DIR, `${file}.log`)
    };
  }

  function startTerminalCapture(agent, terminalId) {
    if (terminalHistories.has(terminalId)) return terminalHistories.get(terminalId);
    const record = terminalRecord(agent, terminalId);
    const output = record?.session.terminal.output;
    if (!record || !output?.on) return undefined;
    const initial = terminalSnapshot(record);
    const paths = terminalArchivePaths(terminalId);
    let existingBytes = 0;
    try { existingBytes = statSync(paths.output).size; }
    catch (error) { if (error?.code !== "ENOENT") throw error; }
    const history = {
      agent,
      paths,
      bytes: existingBytes,
      writeQueue: Promise.resolve(),
      output,
      onData: undefined
    };
    const appendHistory = (value) => {
      if (!value || value.length === 0) return;
      const chunk = Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(String(value), "utf8");
      history.bytes += chunk.length;
      history.writeQueue = history.writeQueue
        .then(async () => {
          await mkdir(TERMINAL_ARCHIVE_DIR, { recursive: true });
          await appendFile(paths.output, chunk);
        })
        .catch((error) => ctx.logger.warn(`dsh-intermi: terminal output append failed: ${errorText(error)}`));
    };
    // A prior plugin instance may already have persisted this live PTY. Its
    // snapshot is then already represented in the log; append a fresh screen
    // snapshot only when initializing a new history file.
    if (initial && existingBytes === 0) appendHistory(initial);
    history.onData = (chunk) => {
      appendHistory(chunk);
      scheduleTerminalArchive(agent, terminalId, history);
    };
    output.on("data", history.onData);
    terminalHistories.set(terminalId, history);
    void persistTerminalArchive(agent, terminalId, history);
    return history;
  }

  function persistTerminalArchive(agent, terminalId, history) {
    const { metadata: target } = history.paths;
    const temporary = target + ".tmp";
    const record = {
      version: 2,
      agentId: agent.id,
      sessionTitle: agent.session?.header?.title || agent.session?.header?.name || defaultTerminalName(agent),
      terminalId,
      terminalName: sessionSnapshot(ctx, agent).find((item) => item.terminalId === terminalId)?.name || defaultTerminalName(agent),
      updatedAt: now(),
      dataFile: true
    };
    const previousWrite = archiveWrites.get(terminalId);
    const write = Promise.resolve(previousWrite).then(() => history.writeQueue)
      .then(() => mkdir(TERMINAL_ARCHIVE_DIR, { recursive: true }))
      .then(() => writeFile(temporary, JSON.stringify(record), "utf8"))
      .then(() => rename(temporary, target))
      .then(() => archivedTerminals.set(terminalId, record))
      .catch((error) => ctx.logger.warn(`dsh-intermi: terminal archive write failed: ${errorText(error)}`));
    archiveWrites.set(terminalId, write);
    void write.finally(() => {
      if (archiveWrites.get(terminalId) === write) archiveWrites.delete(terminalId);
    });
    return write;
  }

  function scheduleTerminalArchive(agent, terminalId, history) {
    clearTimeout(archiveTimers.get(terminalId));
    const timer = setTimeout(() => {
      void persistTerminalArchive(agent, terminalId, history);
    }, 350);
    timer.unref?.();
    archiveTimers.set(terminalId, timer);
  }

  function stopTerminalCapture(terminalId) {
    const history = terminalHistories.get(terminalId);
    if (!history) return;
    history.output.off("data", history.onData);
    terminalHistories.delete(terminalId);
  }

  async function removeTerminalArchive(agentId, terminalId) {
    clearTimeout(archiveTimers.get(terminalId));
    archiveTimers.delete(terminalId);
    const history = terminalHistories.get(terminalId);
    stopTerminalCapture(terminalId);
    if (history) await history.writeQueue;
    const pendingWrite = archiveWrites.get(terminalId);
    if (pendingWrite) await pendingWrite;
    const archive = archivedTerminals.get(terminalId);
    if (archive && archive.agentId !== agentId) return false;
    archivedTerminals.delete(terminalId);
    for (const file of Object.values(terminalArchivePaths(terminalId))) {
      try {
        await unlink(file);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
    return true;
  }

  function sendSocket(ws, message) {
    if (ws.readyState !== WebSocket.OPEN) return false;
    if (ws.bufferedAmount > MAX_SOCKET_BUFFERED_BYTES) {
      ws.close(1013, "Terminal output is backing up");
      return false;
    }
    ws.send(JSON.stringify(message));
    return true;
  }

  function registerTerminalSocket() {
    return ctx.webServer.registerUpgrade({
      path: API_PREFIX + "/terminal",
      handler: (request, socket, head) => {
        const url = new URL(request.url ?? "/", "http://localhost");
        const agentId = url.searchParams.get("agentId");
        const terminalId = url.searchParams.get("terminalId");
        const offeredProtocols = String(request.headers["sec-websocket-protocol"] ?? "").split(",").map((part) => part.trim());
        if (!offeredProtocols.includes(`dsh-intermi-ticket.${socketToken}`) || !agentId || !terminalId) {
          socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
          return;
        }
        const agent = terminalOwners.get(agentId);
        const record = agent && terminalRecord(agent, terminalId);
        const output = record?.session.terminal.output;
        if (!record || !output?.on || !record.session.emulator) {
          socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
          return;
        }

        webSocketServer.handleUpgrade(request, socket, head, (ws) => {
          socketClients.add(ws);
          const previousController = terminalControllers.get(terminalId);
          if (previousController && previousController !== ws && previousController.readyState === WebSocket.OPEN) {
            previousController.close(4001, "Terminal view moved to another client");
          }
          terminalControllers.set(terminalId, ws);
          let outputEnded = false;
          let replayingHistory = true;
          const liveOutput = [];
          let inputQueue = Promise.resolve();
          let stateTimer;
          let lastState = "";
          const history = startTerminalCapture(agent, terminalId);
          const decoder = new TextDecoder("utf-8");
          const onData = (chunk) => {
            const text = decoder.decode(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk), { stream: true });
            if (!text) return;
            if (replayingHistory) liveOutput.push(text);
            else sendSocket(ws, { type: "output", data: text });
          };
          const onEnd = () => {
            if (outputEnded) return;
            outputEnded = true;
            const tail = decoder.decode();
            if (replayingHistory) {
              if (tail) liveOutput.push(tail);
              return;
            }
            if (tail) sendSocket(ws, { type: "output", data: tail });
            sendSocket(ws, { type: "closed" });
            ws.close(1000, "Agent PTY ended");
          };
          const sendState = () => {
            const state = {
              type: "state",
              writable: !record.closing && terminalControllers.get(terminalId) === ws
            };
            const serialized = JSON.stringify(state);
            if (serialized !== lastState) {
              lastState = serialized;
              sendSocket(ws, state);
            }
          };
          const cleanup = () => {
            clearInterval(stateTimer);
            output.off("data", onData);
            output.off("end", onEnd);
            output.off("error", onEnd);
            socketClients.delete(ws);
            if (terminalControllers.get(terminalId) === ws) terminalControllers.delete(terminalId);
          };

          // Subscribe before the baseline so no output is lost during attachment.
          output.on("data", onData);
          output.once("end", onEnd);
          output.once("error", onEnd);
          const historyCutoffBytes = history?.bytes ?? 0;
          const historyCutoffWrites = history?.writeQueue ?? Promise.resolve();
          ws.once("close", cleanup);
          ws.once("error", cleanup);
          try {
            const snapshotSent = sendSocket(ws, {
              type: "snapshot",
              terminalId,
              data: ""
            });
            if (!snapshotSent) {
              cleanup();
              ws.close(1013, "Terminal snapshot could not be delivered");
              return;
            }
            void (async () => {
              const sendHistoryText = async (value) => {
                for (let offset = 0; offset < value.length;) {
                  while (ws.readyState === WebSocket.OPEN && ws.bufferedAmount > MAX_SOCKET_BUFFERED_BYTES / 2) {
                    await new Promise((resolve) => setTimeout(resolve, 8));
                  }
                  if (ws.readyState !== WebSocket.OPEN) return false;
                  let end = Math.min(value.length, offset + TERMINAL_HISTORY_FRAME_CHARS);
                  if (end < value.length && /[\uD800-\uDBFF]/.test(value[end - 1]) && /[\uDC00-\uDFFF]/.test(value[end])) end--;
                  if (!sendSocket(ws, { type: "output", data: value.slice(offset, end) })) return false;
                  offset = end;
                }
                return true;
              };
              if (history) {
                await historyCutoffWrites;
                const size = historyCutoffBytes;
                try { await stat(history.paths.output); }
                catch (error) { if (error?.code !== "ENOENT") throw error; }
                if (size > 0) {
                  const historyDecoder = new TextDecoder("utf-8");
                  for await (const chunk of createReadStream(history.paths.output, { start: 0, end: size - 1 })) {
                    const text = historyDecoder.decode(chunk, { stream: true });
                    if (text && !await sendHistoryText(text)) return;
                  }
                  const tail = historyDecoder.decode();
                  if (tail && !await sendHistoryText(tail)) return;
                }
              }
              while (liveOutput.length > 0) {
                if (!await sendHistoryText(liveOutput.shift())) return;
              }
              replayingHistory = false;
              if (outputEnded && ws.readyState === WebSocket.OPEN) {
                sendSocket(ws, { type: "closed" });
                ws.close(1000, "Agent PTY ended");
              }
            })().catch((error) => {
              sendSocket(ws, { type: "error", message: errorText(error) });
              ws.close(1011, "Terminal history replay failed");
            });
          } catch (error) {
            sendSocket(ws, { type: "error", message: errorText(error) });
            cleanup();
            ws.close(1011, "Terminal snapshot failed");
            return;
          }
          sendState();
          stateTimer = setInterval(sendState, 300);
          stateTimer.unref?.();

          ws.on("message", (raw, isBinary) => {
            if (isBinary) {
              ws.close(1003, "Text messages are required");
              return;
            }
            let message;
            try { message = JSON.parse(raw.toString("utf8")); }
            catch { ws.close(1007, "Invalid JSON message"); return; }

            if (message?.type === "resize") {
              if (terminalControllers.get(terminalId) !== ws) return;
              const cols = Number(message.cols);
              const rows = Number(message.rows);
              if (Number.isSafeInteger(cols) && Number.isSafeInteger(rows)) {
                try {
                  Promise.resolve(record.session.terminal.resize(
                    Math.max(20, Math.min(300, cols)),
                    Math.max(5, Math.min(120, rows))
                  )).catch((error) => sendSocket(ws, { type: "error", message: errorText(error) }));
                } catch (error) {
                  sendSocket(ws, { type: "error", message: errorText(error) });
                }
              }
              return;
            }
            if (message?.type !== "input" || typeof message.data !== "string") return;
            if (Buffer.byteLength(message.data, "utf8") > MAX_INPUT_BYTES) {
              sendSocket(ws, { type: "error", message: "Input chunk is too large" });
              return;
            }
            if (record.closing || terminalControllers.get(terminalId) !== ws) {
              sendState();
              return;
            }
            inputQueue = inputQueue.then(async () => {
              if (ws.readyState !== WebSocket.OPEN || terminalControllers.get(terminalId) !== ws) return;
              const current = terminalRecord(agent, terminalId);
              if (!current) throw new Error("The Agent Shell is no longer available.");
              await current.session.terminal.write(message.data);
            }).catch((error) => sendSocket(ws, { type: "error", message: errorText(error) }));
          });
        });
      }
    });
  }

  function activeCallFor(agent) {
    const foreground = [...activeCalls.values()].find((call) =>
      call.agentId === agent.id
    );
    if (foreground) return foreground;
    const jobs = ctx.get("jobs");
    for (const [jobId, call] of backgroundCalls) {
      if (call.agentId !== agent.id) continue;
      const job = jobs?.get(jobId, agent.id);
      if (job && ["running", "stopping"].includes(job.status)) {
        return { ...call, jobId, background: true };
      }
      backgroundCalls.delete(jobId);
    }
    return undefined;
  }

  function terminalOutputSince(owner, terminalId, startLine, startTail = "") {
    if (!terminalId || !Number.isSafeInteger(startLine)) return Promise.resolve(undefined);
    try {
      return Promise.resolve(recoverTerminalOutput(startLine, startTail, (offset, count) =>
        ctx.terminals.read(registeredOwner(owner), terminalId, { offset, count })));
    } catch (error) {
      return Promise.resolve({ readError: errorText(error) });
    }
  }

  const disposePreExecute = ctx.on("tools/pre-execute", async (exec, next) => {
    if (!exec.agent || !["terminal_open", "pwsh", "ops_bash", "bash"].includes(exec.name)) return next();

    const owner = exec.agent;
    const ownerId = owner.id;
    const existing = ownedSessions(owner);
    const reservation = reservations.get(ownerId);

    if (reservation && reservation.callId !== exec.callId) {
      await recordDenied(exec, "another terminal session is being created");
      return {
        kind: "deny",
        reason: "This Agent already has a terminal operation creating its single persistent Shell. Reuse that Shell."
      };
    }

    if (exec.name === "terminal_open") {
      if (existing.length > 0) {
        await recordDenied(exec, "the Agent already owns its single persistent Shell");
        return {
          kind: "deny",
          reason: "Each Agent has one persistent Shell. Use terminal_list, terminal_send, and terminal_read to reuse it."
        };
      }
      reserve(ownerId, exec.callId, "terminal");
      const decision = await next();
      if (decision?.kind === "deny" || decision?.kind === "cancel") releaseReservation(ownerId, exec.callId);
      return decision;
    }

    if (["ops_bash", "bash", "pwsh"].includes(exec.name)) {
      await recordDenied(exec, "non-persistent shell tools are blocked by dsh-intermi's one persistent PTY rule");
      return {
        kind: "deny",
        reason: existing.length > 0
          ? "Use this Agent's existing persistent Shell with terminal_send and terminal_read; do not start a separate shell."
          : "Open this Agent's one persistent Shell with terminal_open using type=shell before running shell commands."
      };
    }
    return next();
  });

  const disposeExecute = ctx.on("tools/execute", async (exec, next) => {
    if (!exec.agent || !OBSERVED_TOOLS.has(exec.name)) return next();

    const agent = exec.agent;
    const agentId = agent.id;
    const call = {
      callId: exec.callId,
      agentId,
      toolName: exec.name,
      input: commandInput(exec.arguments),
      startedAt: now(),
      terminalId: exec.arguments?.sessionId
    };
    if (exec.name === "terminal_send" && call.terminalId) {
      try {
        const before = ctx.terminals.read(registeredOwner(agent), call.terminalId, { offset: 0, count: 1000 });
        call.startLine = before.totalLines;
        call.startTail = before.text;
      } catch {
        call.startLine = undefined;
      }
    }

    registeredOwner(agent);
    activeCalls.set(exec.callId, call);
    try {
      await appendEvent({
        type: "tool-start",
        timestamp: call.startedAt,
        agentId,
        callId: exec.callId,
        toolName: exec.name,
        terminalId: call.terminalId,
        input: boundedJson(exec.arguments)
      });
    } catch (error) {
      activeCalls.delete(exec.callId);
      releaseReservation(agentId, exec.callId);
      throw new Error("Terminal audit could not be saved; the shell operation was stopped.", { cause: error });
    }

    try {
      let result = await next();
      let terminalId = call.terminalId;
      if (typeof result?.value?.sessionId === "string") terminalId = result.value.sessionId;
      call.terminalId = terminalId;
      if (exec.name === "terminal_send" && !result?.isError && result?.value?.kind === "foreground"
        && typeof result.value.viewport === "string" && result.value.viewport.trim() === "" && terminalId) {
        const recovered = await terminalOutputSince(agent, terminalId, call.startLine, call.startTail);
        const viewport = recovered?.text
          ? `[Recovered from recent PTY scrollback${recovered.truncated ? "; output truncated" : ""}]\n${recovered.text}`
          : `[No new PTY output was captured; wait reason: ${result.value.waitReason}. The command may still be running or awaiting input. Do not resend it; inspect this Shell once with terminal_read. If its state remains unclear, stop and report the uncertainty.]`;
        result = {
          ...result,
          value: {
            ...result.value,
            viewport,
            truncated: result.value.truncated === true || recovered?.truncated === true
          }
        };
      }
      if (exec.name === "terminal_open" && terminalId) {
        const suppliedName = exec.arguments?.name;
        if (typeof suppliedName !== "string" || suppliedName.trim() === "" || /^session[-_]/i.test(suppliedName.trim())) {
          try {
            await ctx.terminals.rename(exec.agent, terminalId, defaultTerminalName(agent));
          } catch (error) {
            ctx.logger.warn(`dsh-intermi: could not apply the default terminal name: ${errorText(error)}`);
          }
        }
        try {
          startTerminalCapture(exec.agent, terminalId);
        } catch (error) {
          // A view/history capture failure must never turn a successfully
          // created DSH PTY into a failed terminal_open tool call.
          ctx.logger.warn(`dsh-intermi: terminal opened but initial capture failed: ${errorText(error)}`);
        }
      }
      const backgroundJobId = exec.name === "terminal_send" && result?.value?.kind === "background"
        ? result.value.jobId
        : undefined;
      if (typeof backgroundJobId === "string") {
        backgroundCalls.set(backgroundJobId, { ...call, terminalId, jobId: backgroundJobId, owner: exec.agent });
        await appendEvent({
          type: "tool-background",
          timestamp: now(),
          agentId,
          callId: exec.callId,
          toolName: exec.name,
          terminalId,
          output: boundedJson({ jobId: backgroundJobId, status: "running" })
        });
      } else {
        if (exec.name === "terminal_close" && terminalId && !ctx.terminals.sessions.has(terminalId)) {
          const history = terminalHistories.get(terminalId);
          stopTerminalCapture(terminalId);
          if (history) await persistTerminalArchive(exec.agent, terminalId, history);
        }
        await appendEvent({
          type: result?.isError ? "tool-error" : "tool-finish",
          timestamp: now(),
          agentId,
          callId: exec.callId,
          toolName: exec.name,
          terminalId,
          output: boundedJson(result?.isError ? result.error ?? result.content : result?.value ?? result?.content)
        });
      }
      return result;
    } catch (error) {
      await appendEvent({
        type: "tool-error",
        timestamp: now(),
        agentId,
        callId: exec.callId,
        toolName: exec.name,
        terminalId: call.terminalId,
        error: errorText(error)
      });
      throw error;
    } finally {
      activeCalls.delete(exec.callId);
      releaseReservation(agentId, exec.callId);
    }
  });

  const jobs = ctx.get("jobs");
  const disposeJobEvents = jobs?.events?.subscribe({ owners: "all" }, (event) => {
    if (event.type !== "settled" || !event.job?.id) return;
    const call = backgroundCalls.get(event.job.id);
    if (!call) return;
    backgroundCalls.delete(event.job.id);
    void (async () => {
      const output = await terminalOutputSince(call.owner, call.terminalId, call.startLine, call.startTail);
      await appendEvent({
        type: event.job.status === "completed" ? "tool-finish" : "tool-error",
        timestamp: now(),
        agentId: call.agentId,
        callId: call.callId,
        toolName: call.toolName,
        terminalId: call.terminalId,
        output: boundedJson({ status: event.job.status, detail: event.job.detail, terminal: output })
      });
    })().catch((error) => ctx.logger.warn(`dsh-intermi: failed to persist background job ${event.job.id}: ${errorText(error)}`));
  });

  ctx.effect(() => ctx.webServer.register({
    kind: "prefix",
    path: API_PREFIX,
    handler: async (request, response) => {
      if (!isSameOrigin(request)) {
        sendJson(response, 403, { error: "Same-origin request required." });
        return;
      }

      const url = new URL(request.url ?? "/", "http://localhost");
      const asset = new Map([
        [API_PREFIX + "/assets/xterm.js", ["xterm.js", "text/javascript; charset=utf-8"]],
        [API_PREFIX + "/assets/xterm.css", ["xterm.css", "text/css; charset=utf-8"]],
        [API_PREFIX + "/assets/addon-fit.js", ["addon-fit.js", "text/javascript; charset=utf-8"]]
      ]).get(url.pathname);
      if (request.method === "GET" && asset) {
        try {
          const body = await readFile(join(ASSET_DIR, asset[0]));
          response.writeHead(200, { "content-type": asset[1], "content-length": body.length, "cache-control": "public, max-age=3600" });
          response.end(body);
        } catch (error) {
          sendJson(response, 500, { error: errorText(error) });
        }
        return;
      }
      if (request.method === "GET" && url.pathname === API_PREFIX + "/sessions") {
        try {
          await knownAgentsReady;
          await terminalArchiveReady;
          const liveAgents = ctx.agents.list();
          const agents = await Promise.all(liveAgents.map(async (currentAgent) => {
            const agent = registeredOwner(currentAgent);
            const terminals = sessionSnapshot(ctx, agent);
            for (const terminal of terminals) startTerminalCapture(agent, terminal.terminalId);
            const active = activeCallFor(currentAgent);
            return {
              agentId: currentAgent.id,
              title: await conversationTitle(currentAgent) || defaultTerminalName(currentAgent),
              live: true,
              lastSeen: knownAgents.get(currentAgent.id) ?? "",
              terminalCount: terminals.length,
              terminals,
              activeCall: active ? {
                callId: active.callId,
                toolName: active.toolName,
                input: active.input,
                startedAt: active.startedAt,
                background: active.background === true,
                terminalId: active.terminalId ?? terminals[0]?.terminalId
              } : null
            };
          }));
          const liveIds = new Set(liveAgents.map((agent) => agent.id));
          for (const [agentId, owner] of terminalOwners) {
            if (liveIds.has(agentId)) continue;
            const terminals = sessionSnapshot(ctx, owner);
            if (terminals.length === 0) continue;
            agents.push({
              agentId,
              title: await conversationTitle(owner) || defaultTerminalName(owner),
              live: false,
              lastSeen: knownAgents.get(agentId) ?? "",
              terminalCount: terminals.length,
              terminals,
              activeCall: null
            });
          }
          const agentsWithShell = new Set(agents.filter((agent) => agent.terminalCount > 0).map((agent) => agent.agentId));
          for (const [agentId, lastSeen] of knownAgents) {
            if (!liveIds.has(agentId) && !agentsWithShell.has(agentId)) agents.push({
              agentId,
              live: false,
              lastSeen,
              terminalCount: 0,
              terminals: [],
              activeCall: null
            });
          }
          const currentTerminalIds = new Set(agents.flatMap((agent) => agent.terminals.map((terminal) => terminal.terminalId)));
          for (const archived of archivedTerminals.values()) {
            if (currentTerminalIds.has(archived.terminalId)) continue;
            const archivedTitle = await conversationTitle({ id: archived.agentId, session: { header: { title: archived.sessionTitle } } });
            let owner = agents.find((agent) => agent.agentId === archived.agentId);
            if (!owner) {
              owner = { agentId: archived.agentId, title: archivedTitle || archived.agentId, live: false, lastSeen: archived.updatedAt, terminalCount: 0, terminals: [], activeCall: null };
              agents.push(owner);
            }
            owner.terminals.push({ agentId: archived.agentId, terminalId: archived.terminalId, name: archived.terminalName || archived.sessionTitle || "Agent 主终端", status: "ended", archived: true, updatedAt: archived.updatedAt });
            owner.terminalCount = owner.terminals.length;
          }
          agents.sort((a, b) => (b.lastSeen || "").localeCompare(a.lastSeen || ""));
          sendJson(response, 200, {
            shellCount: agents.reduce((sum, agent) => sum + agent.terminals.filter((terminal) => !terminal.archived).length, 0),
            socketToken,
            agents
          });
        } catch (error) {
          sendJson(response, 500, { error: errorText(error) });
        }
        return;
      }

      if (request.method === "GET" && url.pathname === API_PREFIX + "/history") {
        await terminalArchiveReady;
        const terminalId = url.searchParams.get("terminalId");
        const agentId = url.searchParams.get("agentId");
        const archived = archivedTerminals.get(terminalId);
        if (!archived || archived.agentId !== agentId) {
          sendJson(response, 404, { error: "Terminal history not found." });
        } else if (archived.dataFile === true) {
          const { output } = terminalArchivePaths(terminalId);
          try {
            const info = await stat(output);
            response.writeHead(200, {
              "content-type": "text/plain; charset=utf-8",
              "content-length": info.size,
              "cache-control": "no-store"
            });
            createReadStream(output).on("error", (error) => response.destroy(error)).pipe(response);
          } catch (error) {
            if (error?.code === "ENOENT") sendJson(response, 404, { error: "Terminal history file not found." });
            else sendJson(response, 500, { error: errorText(error) });
          }
        } else {
          const data = archived.data || "";
          response.writeHead(200, {
            "content-type": "text/plain; charset=utf-8",
            "content-length": Buffer.byteLength(data, "utf8"),
            "cache-control": "no-store"
          });
          response.end(data);
        }
        return;
      }

      if (request.method === "GET" && url.pathname === API_PREFIX + "/events") {
        const agentId = url.searchParams.get("agentId");
        if (!agentId) {
          sendJson(response, 400, { error: "agentId is required." });
          return;
        }
        try {
          const rawLimit = Number(url.searchParams.get("limit"));
          const limit = Number.isSafeInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 500) : 100;
          const rawBefore = url.searchParams.get("before");
          const beforeNumber = rawBefore === null ? undefined : Number(rawBefore);
          if (beforeNumber !== undefined && (!Number.isSafeInteger(beforeNumber) || beforeNumber < 0)) {
            sendJson(response, 400, { error: "before must be a non-negative event offset." });
            return;
          }
          sendJson(response, 200, readAgentEvents(auditByAgent.get(agentId) ?? [], beforeNumber, limit));
        } catch (error) {
          sendJson(response, 500, { error: errorText(error) });
        }
        return;
      }

      if (request.method === "POST" && url.pathname === API_PREFIX + "/delete") {
        try {
          const body = await readJson(request);
          const agentId = typeof body.agentId === "string" ? body.agentId : "";
          const currentAgent = agentId ? ctx.agents.get(agentId) : undefined;
          const agent = agentId
            ? terminalOwners.get(agentId) ?? (currentAgent ? registeredOwner(currentAgent) : undefined)
            : undefined;
          if (!agentId || typeof body.terminalId !== "string") {
            sendJson(response, 400, { error: "agentId and terminalId are required." });
            return;
          }
          await terminalArchiveReady;
          const liveRecord = agent ? terminalRecord(agent, body.terminalId) : undefined;
          const archived = archivedTerminals.get(body.terminalId);
          if (!liveRecord && (!archived || archived.agentId !== agentId)) {
            sendJson(response, 404, { error: "The Agent Shell is no longer available." });
            return;
          }
          await appendEvent({
            type: "user-terminal-delete-request",
            timestamp: now(),
            agentId,
            terminalId: body.terminalId,
            name: liveRecord && agent
              ? sessionSnapshot(ctx, agent).find((item) => item.terminalId === body.terminalId)?.name
              : archived?.terminalName,
            reason: "deleted from dsh-intermi"
          });
          const closed = liveRecord && agent
            ? await ctx.terminals.kill(agent, body.terminalId, "user deleted terminal from dsh-intermi")
            : false;
          await removeTerminalArchive(agentId, body.terminalId);
          await appendEvent({
            type: "user-terminal-delete",
            timestamp: now(),
            agentId,
            terminalId: body.terminalId,
            closed,
            removed: true
          });
          sendJson(response, 200, { ok: true, closed, removed: true });
        } catch (error) {
          sendJson(response, 409, { error: errorText(error) });
        }
        return;
      }

      sendJson(response, 404, { error: "Unknown dsh-intermi endpoint." });
    }
  }), "dsh-intermi: API route");

  ctx.effect(() => registerTerminalSocket(), "dsh-intermi: terminal WebSocket");

  return async () => {
    disposeExecute();
    disposePreExecute();
    if (typeof disposeJobEvents === "function") disposeJobEvents();
    for (const ws of socketClients) ws.terminate();
    socketClients.clear();
    const histories = [...terminalHistories.entries()];
    for (const [terminalId] of histories) {
      clearTimeout(archiveTimers.get(terminalId));
      archiveTimers.delete(terminalId);
      stopTerminalCapture(terminalId);
    }
    await Promise.all(histories.map(([terminalId, history]) => persistTerminalArchive(history.agent, terminalId, history)));
    terminalControllers.clear();
    webSocketServer.close();
    activeCalls.clear();
    backgroundCalls.clear();
    reservations.clear();
    terminalOwners.clear();
  };
}



