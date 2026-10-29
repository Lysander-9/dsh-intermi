window.__ModuleLoader__.load({
  id: "dsh-intermi",
  factory(require) {
    const React = require("react");
    const { useEffect, useRef, useState } = React;

function TerminalGuideIcon({ size = 36, className }) {
  return React.createElement("svg", {
    width: size,
    height: size,
    className,
    "aria-hidden": "true",
    viewBox: "0 0 36 36",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg"
  },
  React.createElement("rect", { x: 5, y: 6, width: 26, height: 24, rx: 5, fill: "#EEF5FF", stroke: "#6D9FE8", strokeWidth: 1.8 }),
  React.createElement("path", { d: "M6 12h24", stroke: "#6D9FE8", strokeWidth: 1.8 }),
  React.createElement("circle", { cx: 9.5, cy: 9, r: 1, fill: "#73A7EF" }),
  React.createElement("circle", { cx: 13, cy: 9, r: 1, fill: "#73A7EF" }),
  React.createElement("path", { d: "m11 17 4 3.5-4 3.5M18 24h6", stroke: "#3977CB", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" }));
}

const PANEL_ID = "dsh-intermi";
const API = "/api/dsh-intermi";
const SESSION_SELECTION_KEY = "dsh-intermi:selected-session:v1";
const zh = () => (document.documentElement.lang || "zh").toLowerCase().startsWith("zh");
const APPEARANCE_KEY = "dsh-intermi:terminal-appearance:v1";
const TERMINAL_THEMES = {
  dark: {
    background: "#0b1220", foreground: "#e2e8f0", cursor: "#f8fafc", cursorAccent: "#0b1220",
    selectionBackground: "#475569", black: "#64748b", red: "#f87171", green: "#4ade80",
    yellow: "#fde047", blue: "#60a5fa", magenta: "#c084fc", cyan: "#22d3ee", white: "#e2e8f0",
    brightBlack: "#94a3b8", brightRed: "#fca5a5", brightGreen: "#86efac", brightYellow: "#fef08a",
    brightBlue: "#93c5fd", brightMagenta: "#d8b4fe", brightCyan: "#67e8f9", brightWhite: "#f8fafc"
  },
  light: {
    background: "#f8fafc", foreground: "#1e293b", cursor: "#0f172a", cursorAccent: "#f8fafc",
    selectionBackground: "#cbd5e1", black: "#475569", red: "#b91c1c", green: "#15803d",
    yellow: "#a16207", blue: "#1d4ed8", magenta: "#a21caf", cyan: "#0e7490", white: "#334155",
    brightBlack: "#64748b", brightRed: "#dc2626", brightGreen: "#16a34a", brightYellow: "#ca8a04",
    brightBlue: "#2563eb", brightMagenta: "#c026d3", brightCyan: "#0891b2", brightWhite: "#0f172a"
  }
};

function validHex(value) {
  return typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
}

function loadAppearance() {
  const fallback = { mode: "dark", background: TERMINAL_THEMES.dark.background, foreground: TERMINAL_THEMES.dark.foreground };
  try {
    const savedValue = localStorage.getItem(APPEARANCE_KEY)
      || localStorage.getItem("itmn:terminal-appearance:v1");
    const saved = JSON.parse(savedValue || "null");
    if (!saved || !["dark", "light", "custom"].includes(saved.mode) || !validHex(saved.background) || !validHex(saved.foreground)) return fallback;
    if (saved.mode === "dark" || saved.mode === "light") return { mode: saved.mode, background: TERMINAL_THEMES[saved.mode].background, foreground: TERMINAL_THEMES[saved.mode].foreground };
    return { mode: "custom", background: saved.background, foreground: saved.foreground };
  } catch {
    return fallback;
  }
}

function terminalTheme(appearance) {
  const rgb = appearance.background.slice(1).match(/.{2}/g).map((part) => parseInt(part, 16));
  const isLight = (rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722) > 140;
  const base = TERMINAL_THEMES[appearance.mode === "light" || (appearance.mode === "custom" && isLight) ? "light" : "dark"];
  return {
    ...base,
    background: appearance.background,
    foreground: appearance.foreground,
    cursor: appearance.foreground,
    cursorAccent: appearance.background
  };
}

const text = {
  title: () => "dsh-intermi",
  count: (count) => zh() ? "持久 Shell：" + count : "Persistent Shells: " + count,
  agents: () => zh() ? "Agent 会话" : "Agent sessions",
  shells: () => zh() ? "Shell 会话" : "Shell sessions",
  attach: () => zh() ? "选择 Agent 的 Shell" : "Select an Agent Shell",
  noTerminal: () => zh() ? "此 Agent 尚未启动持久 Shell。请让 Agent 执行终端操作后再连接。" : "This Agent has not opened a persistent Shell yet.",
  noActiveShells: () => zh() ? "暂无持久终端。让 Agent 执行终端命令后，它的 Shell 会显示在这里。" : "No persistent terminals yet. Ask an Agent to run a terminal command and its Shell will appear here.",
  disconnected: () => zh() ? "终端连接已断开" : "Terminal disconnected",
  choose: () => zh() ? "选择一个 Agent 查看终端记录" : "Select an Agent to review terminal activity",
  noShell: () => zh() ? "该 Agent 尚未启动持久 Shell；下方仍会显示已审计的独立 shell 命令。" : "No persistent Shell is running; audited standalone shell commands may still appear below.",
  ended: () => zh() ? "已结束的会话" : "Ended session",
  activity: () => zh() ? "终端操作记录" : "Terminal activity",
  deleteTerminal: () => zh() ? "删除终端" : "Delete terminal",
  deleteConfirm: (name) => zh()
    ? `确定删除“${name}”并结束其中的进程吗？`
    : `Delete “${name}” and end its processes?`,
  empty: () => zh() ? "暂无终端操作记录。" : "No terminal activity recorded.",
  older: () => zh() ? "加载更早记录" : "Load older activity",
  loading: () => zh() ? "正在读取 dsh-intermi 终端记录…" : "Loading dsh-intermi terminal activity…",
  tool: () => zh() ? "工具" : "Tool",
  input: () => zh() ? "输入" : "Input",
  output: () => zh() ? "输出" : "Output",
  running: () => zh() ? "执行中" : "Running",
  completed: () => zh() ? "已结束" : "Finished",
  failed: () => zh() ? "失败" : "Failed",
  error: () => zh() ? "读取失败：" : "Could not load: "
};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = [...document.scripts].find((script) => script.src.endsWith(src));
    if (existing?.dataset.loaded === "true") return resolve();
    const script = existing || document.createElement("script");
    script.src = src;
    script.onload = () => { script.dataset.loaded = "true"; resolve(); };
    script.onerror = () => reject(new Error("Failed to load terminal renderer"));
    if (!existing) document.head.append(script);
  });
}

function DshIntermiPanel() {
  const [snapshot, setSnapshot] = useState({ shellCount: 0, agents: [] });
  const [selection, setSelection] = useState(() => {
    try { return JSON.parse(localStorage.getItem(SESSION_SELECTION_KEY) || "null") || { agentId: "", terminalId: "" }; }
    catch { return { agentId: "", terminalId: "" }; }
  });
  const { agentId: selectedAgent, terminalId: selectedTerminal } = selection;
  const setSelectedAgent = (agentId) => {
    const agent = snapshot.agents.find((item) => item.agentId === agentId);
    setSelection({ agentId, terminalId: agent?.terminals[0]?.terminalId || "" });
  };
  const setSelectedTerminal = (terminalId) => setSelection((current) => ({ ...current, terminalId }));
  const [state, setState] = useState("loading");
  const [notice, setNotice] = useState("");
  const [appearance, setAppearance] = useState(loadAppearance);
  const [showAppearance, setShowAppearance] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const screenRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const selectedTerminalArchived = snapshot.agents
    .find((item) => item.agentId === selectedAgent)?.terminals
    .find((item) => item.terminalId === selectedTerminal)?.archived === true;

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = API + "/assets/xterm.css";
    link.dataset.plugin = PANEL_ID;
    document.head.append(link);
    let alive = true;
    loadScript(API + "/assets/xterm.js")
      .then(() => loadScript(API + "/assets/addon-fit.js"))
      .then(() => { if (alive) setState("ready"); })
      .catch((error) => { if (alive) setNotice(String(error)); });
    return () => { alive = false; link.remove(); };
  }, []);

  const refresh = async () => {
    const next = await requestJson(API + "/sessions");
    setSnapshot(next);
    const selectableAgents = next.agents.filter((item) => item.terminals.length > 0);
    setSelection((current) => {
      const agent = selectableAgents.find((item) => item.agentId === current.agentId) || selectableAgents[0];
      const terminal = agent?.terminals.find((item) => item.terminalId === current.terminalId) || agent?.terminals[0];
      return { agentId: agent?.agentId || "", terminalId: terminal?.terminalId || "" };
    });
  };

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try { await refresh(); } catch (error) { if (alive) setNotice(String(error)); }
    };
    void poll();
    const timer = setInterval(poll, 1500);
    return () => { alive = false; clearInterval(timer); };
  }, [selectedAgent]);

  useEffect(() => {
    try { localStorage.setItem(SESSION_SELECTION_KEY, JSON.stringify(selection)); } catch {}
  }, [selection]);

  useEffect(() => {
    const element = screenRef.current;
    if (!element || state !== "ready" || !selectedAgent || !selectedTerminal || !window.Terminal) return;
    let alive = true;
    let writable = false;
    let reconnectTimer;
    let reconnectDelay = 250;
    let terminalEnded = false;
    let resizeFrame = 0;
    let socket;
    const term = new window.Terminal({
      cursorBlink: true,
      cursorStyle: "bar",
      convertEol: false,
      scrollback: 12000,
      fontSize: 14,
      lineHeight: 1.2,
      fontFamily: "Consolas, 'Cascadia Mono', monospace",
      theme: terminalTheme(appearance)
    });
    const fit = window.FitAddon?.FitAddon ? new window.FitAddon.FitAddon() : null;
    if (fit) term.loadAddon(fit);
    term.open(element);
    try { fit?.fit(); } catch {}
    termRef.current = term;
    fitRef.current = fit;
    term.focus();
    const input = term.onData((data) => {
      if (writable && socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "input", data }));
      }
    });
    const sendResize = () => {
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = requestAnimationFrame(() => {
          resizeFrame = 0;
          if (!alive || !element.isConnected) return;
          try { fit?.fit(); } catch {}
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
          }
        });
      });
    };
    const connect = () => {
      if (!alive) return;
      const transportBase = globalThis.__DSH_TRANSPORT__?.streamBaseUrl || window.location.href;
      const endpoint = new URL(API + "/terminal", transportBase);
      endpoint.protocol = endpoint.protocol === "https:" || endpoint.protocol === "wss:" ? "wss:" : "ws:";
      endpoint.search = new URLSearchParams({
        agentId: selectedAgent,
        terminalId: selectedTerminal
      }).toString();
      socket = new WebSocket(endpoint, ["dsh-intermi", `dsh-intermi-ticket.${snapshot.socketToken || ""}`]);
      socket.onopen = () => {
        reconnectDelay = 250;
        setNotice("");
        sendResize();
      };
      socket.onmessage = (event) => {
        let message;
        try { message = JSON.parse(event.data); }
        catch { setNotice(zh() ? "终端数据格式错误" : "Invalid terminal data"); return; }
        if (message.type === "snapshot") {
          term.reset();
          if (message.data) term.write(message.data);
        } else if (message.type === "output") {
          if (message.data) term.write(message.data);
        } else if (message.type === "state") {
          writable = message.writable === true;
        } else if (message.type === "error") {
          setNotice(message.message || text.disconnected());
        } else if (message.type === "closed") {
          terminalEnded = true;
          writable = false;
          setNotice(text.disconnected());
        }
      };
      socket.onerror = () => {
        if (alive) setNotice(text.disconnected());
      };
      socket.onclose = () => {
        writable = false;
        if (!alive || terminalEnded) return;
        reconnectTimer = setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(5000, reconnectDelay * 2);
      };
    };
    if (selectedTerminalArchived) {
      let disposed = false;
      let archivedResizeFrame = 0;
      const fitArchived = () => {
        if (archivedResizeFrame) cancelAnimationFrame(archivedResizeFrame);
        archivedResizeFrame = requestAnimationFrame(() => {
          archivedResizeFrame = 0;
          if (!disposed) { try { fit?.fit(); } catch {} }
        });
      };
      const archivedResize = new ResizeObserver(fitArchived);
      archivedResize.observe(element);
      const archivedPane = element.closest(".dsh-intermi-terminal-pane");
      if (archivedPane) archivedResize.observe(archivedPane);
      window.addEventListener("resize", fitArchived);
      window.visualViewport?.addEventListener("resize", fitArchived);
      fitArchived();
      requestJson(API + "/history?agentId=" + encodeURIComponent(selectedAgent) + "&terminalId=" + encodeURIComponent(selectedTerminal))
        .then((result) => { if (!disposed && result.data) term.write(result.data); })
        .catch((error) => { if (!disposed) setNotice(String(error)); });
      return () => {
        disposed = true;
        if (archivedResizeFrame) cancelAnimationFrame(archivedResizeFrame);
        archivedResize.disconnect();
        window.removeEventListener("resize", fitArchived);
        window.visualViewport?.removeEventListener("resize", fitArchived);
        input.dispose();
        fit?.dispose?.();
        term.dispose();
        termRef.current = null;
        fitRef.current = null;
        element.replaceChildren();
      };
    }
    connect();
    const resize = new ResizeObserver(sendResize);
    resize.observe(element);
    const pane = element.closest(".dsh-intermi-terminal-pane");
    if (pane) resize.observe(pane);
    window.addEventListener("resize", sendResize);
    window.visualViewport?.addEventListener("resize", sendResize);
    sendResize();
    return () => {
      alive = false;
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      clearTimeout(reconnectTimer);
      socket?.close();
      resize.disconnect();
      window.removeEventListener("resize", sendResize);
      window.visualViewport?.removeEventListener("resize", sendResize);
      input.dispose();
      fit?.dispose?.();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      element.replaceChildren();
    };
  }, [state, selectedAgent, selectedTerminal, snapshot.socketToken, selectedTerminalArchived]);

  useEffect(() => {
    try { localStorage.setItem(APPEARANCE_KEY, JSON.stringify(appearance)); } catch {}
    if (termRef.current) {
      termRef.current.options.theme = terminalTheme(appearance);
      try { fitRef.current?.fit(); } catch {}
    }
  }, [appearance]);

  const selectableAgents = snapshot.agents.filter((item) => item.terminals.length > 0);
  const agent = selectableAgents.find((item) => item.agentId === selectedAgent);
  const terminals = agent?.terminals || [];
  const terminalChoices = selectableAgents.flatMap((item) => item.terminals.map((terminal) => ({
    agentId: item.agentId,
    terminalId: terminal.terminalId,
    label: item.terminals.length > 1
      ? `${item.title || item.agentId} · ${terminal.name || terminal.terminalId}`
      : item.title || terminal.name || terminal.terminalId,
    status: terminal.archived ? "" : terminal.status,
    archived: terminal.archived === true
  })));
  const choiceLabelCounts = new Map();
  for (const choice of terminalChoices) choiceLabelCounts.set(choice.label, (choiceLabelCounts.get(choice.label) || 0) + 1);
  const deleteTerminal = async () => {
    if (!selectedAgent || !selectedTerminal || deleting) return;
    const terminal = terminals.find((item) => item.terminalId === selectedTerminal);
    const name = terminal?.name || selectedTerminal;
    if (!window.confirm(text.deleteConfirm(name))) return;
    setDeleting(true);
    try {
      await requestJson(API + "/delete", {
        method: "POST",
        body: JSON.stringify({ agentId: selectedAgent, terminalId: selectedTerminal })
      });
      setSelectedTerminal("");
      setNotice(zh() ? "终端已删除" : "Terminal deleted");
      await refresh();
    } catch (error) {
      setNotice(String(error));
    } finally {
      setDeleting(false);
    }
  };
  const setPreset = (mode) => {
    if (mode === "custom") {
      setAppearance((current) => ({ ...current, mode: "custom" }));
      return;
    }
    setAppearance({ mode, background: TERMINAL_THEMES[mode].background, foreground: TERMINAL_THEMES[mode].foreground });
  };
  const setCustomColor = (key, value) => setAppearance((current) => ({ ...current, mode: "custom", [key]: value }));

  return React.createElement("div", { className: "dsh-intermi-root", style: { "--dsh-intermi-terminal-bg": appearance.background } },
    React.createElement("header", { className: "dsh-intermi-header" },
      React.createElement("strong", null, "dsh-intermi"),
      React.createElement("span", null, text.count(snapshot.shellCount)),
      React.createElement("button", { className: "dsh-intermi-delete", disabled: !selectedTerminal || deleting, onClick: deleteTerminal }, deleting ? (zh() ? "正在删除…" : "Deleting…") : text.deleteTerminal())
    ),
    React.createElement("div", { className: "dsh-intermi-workspace" },
      React.createElement("section", { className: "dsh-intermi-terminal-pane" },
        React.createElement("div", { className: "dsh-intermi-toolbar" },
          React.createElement("select", {
            className: "dsh-intermi-session-select",
            value: selectedTerminal,
            disabled: terminalChoices.length === 0,
            onChange: (event) => {
              const choice = terminalChoices.find((item) => item.terminalId === event.target.value);
              if (choice) setSelection({ agentId: choice.agentId, terminalId: choice.terminalId });
            },
            "aria-label": text.agents()
          }, terminalChoices.length === 0
            ? React.createElement("option", { value: "", disabled: true }, zh() ? "暂无持久终端" : "No persistent terminals")
            : terminalChoices.map((choice) => React.createElement("option", { key: choice.terminalId, value: choice.terminalId }, `${choice.label}${choiceLabelCounts.get(choice.label) > 1 ? ` · ${choice.terminalId.slice(-6)}` : ""}${choice.status ? ` · ${choice.status}` : ""}`))),
          React.createElement("button", { className: "dsh-intermi-appearance-button", onClick: () => setShowAppearance((value) => !value), "aria-expanded": showAppearance }, zh() ? "终端颜色" : "Terminal colors")
        ),
        showAppearance ? React.createElement("div", { className: "dsh-intermi-appearance-panel" },
          React.createElement("label", null,
            React.createElement("span", null, zh() ? "配色方案" : "Color scheme"),
            React.createElement("select", { value: appearance.mode, onChange: (event) => setPreset(event.target.value) },
              React.createElement("option", { value: "dark" }, zh() ? "深色高对比" : "High contrast dark"),
              React.createElement("option", { value: "light" }, zh() ? "浅色高对比" : "High contrast light"),
              React.createElement("option", { value: "custom" }, zh() ? "自定义" : "Custom"))
          ),
          React.createElement("label", null,
            React.createElement("span", null, zh() ? "背景" : "Background"),
            React.createElement("input", { type: "color", value: appearance.background, disabled: appearance.mode !== "custom", onChange: (event) => setCustomColor("background", event.target.value) })
          ),
          React.createElement("label", null,
            React.createElement("span", null, zh() ? "文字" : "Text"),
            React.createElement("input", { type: "color", value: appearance.foreground, disabled: appearance.mode !== "custom", onChange: (event) => setCustomColor("foreground", event.target.value) })
          )
        ) : null,
        selectedTerminal ? React.createElement("div", { className: "dsh-intermi-screen", ref: screenRef, onMouseDown: () => termRef.current?.focus(), onClick: () => termRef.current?.focus(), "aria-label": zh() ? "交互式终端，点击后输入命令" : "Interactive terminal; click to type commands" }) : React.createElement("div", { className: "dsh-intermi-empty" }, selectableAgents.length === 0 ? text.noActiveShells() : agent ? text.noTerminal() : text.attach()),
        notice ? React.createElement("div", { className: "dsh-intermi-notice", role: "status" }, notice) : null
      )
    )
  );
}

async function requestJson(url, options) {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
    headers: {
      ...(options?.body ? { "content-type": "application/json" } : {}),
      ...options?.headers
    }
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || response.statusText);
  return payload;
}

function displayValue(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value.preview === "string") return value.preview;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function inputText(event) {
  const args = event.input;
  if (args && typeof args === "object") {
    for (const key of ["text", "command", "cmd", "code"]) {
      if (typeof args[key] === "string") return args[key];
    }
    return JSON.stringify(args, null, 2);
  }
  return displayValue(args);
}

function groupEvents(events) {
  const groups = new Map();
  for (const event of events) {
    const key = event.callId || event.timestamp;
    const group = groups.get(key) || { callId: key, events: [] };
    group.events.push(event);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => {
    const start = group.events.find((event) => event.type === "tool-start");
    const finish = [...group.events].reverse().find((event) =>
      ["tool-finish", "tool-error", "tool-denied"].includes(event.type)
    );
    return {
      callId: group.callId,
      toolName: start?.toolName || finish?.toolName || "terminal",
      input: start?.input ?? finish?.input,
      output: finish?.output,
      error: finish?.error || finish?.reason,
      status: finish?.type || "running",
      timestamp: start?.timestamp || finish?.timestamp || ""
    };
  }).reverse();
}

function TerminalAuditPanel() {
  const [snapshot, setSnapshot] = useState({ shellCount: 0, agents: [] });
  const [selected, setSelected] = useState("");
  const [events, setEvents] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextBefore, setNextBefore] = useState(undefined);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const pageInitialized = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    async function refresh() {
      try {
        const result = await requestJson(API + "/sessions", { signal: controller.signal });
        if (!live) return;
        setSnapshot(result);
        setError("");
        setSelected((current) =>
          current && result.agents.some((agent) => agent.agentId === current)
            ? current
            : result.agents[0]?.agentId || ""
        );
      } catch (cause) {
        if (live && cause.name !== "AbortError") setError(cause.message);
      }
    }
    refresh();
    const timer = window.setInterval(refresh, 1600);
    return () => {
      live = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!selected) {
      setEvents([]);
      setHasMore(false);
      setNextBefore(undefined);
      pageInitialized.current = false;
      return;
    }
    const controller = new AbortController();
    let live = true;
    async function refreshEvents() {
      try {
        const result = await requestJson(
          API + "/events?agentId=" + encodeURIComponent(selected) + "&limit=100",
          { signal: controller.signal }
        );
        if (live) {
          setEvents((current) => {
            const merged = new Map();
            for (const event of [...current, ...(result.events || [])]) {
              merged.set([event.timestamp, event.callId, event.type].join("|"), event);
            }
            return [...merged.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
          });
          if (!pageInitialized.current) {
            setHasMore(result.hasMore);
            setNextBefore(result.nextBefore);
            pageInitialized.current = true;
          }
          setError("");
        }
      } catch (cause) {
        if (live && cause.name !== "AbortError") setError(cause.message);
      }
    }
    refreshEvents();
    const timer = window.setInterval(refreshEvents, 3500);
    return () => {
      live = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [selected]);

  async function loadOlder() {
    if (!selected || nextBefore === undefined || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const result = await requestJson(
        API + "/events?agentId=" + encodeURIComponent(selected) + "&limit=100&before=" + nextBefore
      );
      setEvents((current) => {
        const merged = new Map();
        for (const event of [...(result.events || []), ...current]) {
          merged.set([event.timestamp, event.callId, event.type].join("|"), event);
        }
        return [...merged.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      });
      setHasMore(result.hasMore);
      setNextBefore(result.nextBefore);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoadingOlder(false);
    }
  }

  const selectedAgent = snapshot.agents.find((agent) => agent.agentId === selected);
  const activity = groupEvents(events);

  return React.createElement("div", { className: "dta-root" },
    React.createElement("header", { className: "dta-header" },
      React.createElement("strong", null, text.title()),
      React.createElement("span", { className: "dta-count" }, text.count(snapshot.shellCount || 0))
    ),
    React.createElement("div", { className: "dta-layout" },
      React.createElement("aside", { className: "dta-agents" },
        React.createElement("h3", null, text.agents()),
        snapshot.agents.length === 0
          ? React.createElement("p", { className: "dta-muted" }, text.choose())
          : snapshot.agents.map((agent) =>
            React.createElement("button", {
              key: agent.agentId,
              className: "dta-agent" + (agent.agentId === selected ? " selected" : ""),
              onClick: () => setSelected(agent.agentId),
              title: agent.agentId
            },
              React.createElement("span", { className: "dta-agent-id" }, agent.agentId),
              React.createElement("span", { className: "dta-agent-state" },
                agent.terminalCount > 0
                  ? (agent.terminals[0]?.status || "active")
                  : agent.live ? text.noShell() : text.ended()
              )
            )
          )
      ),
      React.createElement("main", { className: "dta-main" },
        selectedAgent
          ? React.createElement(React.Fragment, null,
            React.createElement("div", { className: "dta-main-head" },
              React.createElement("h3", null, text.activity())
            ),
            selectedAgent.terminalCount === 0 && selectedAgent.live
              ? React.createElement("p", { className: "dta-muted" }, text.noShell())
              : null,
            hasMore
              ? React.createElement("button", {
                  className: "dta-load-older",
                  disabled: loadingOlder,
                  onClick: loadOlder
                }, loadingOlder ? text.loading() : text.older())
              : null,
            activity.length === 0
              ? React.createElement("p", { className: "dta-muted" }, text.empty())
              : React.createElement("div", { className: "dta-events" },
                activity.map((item) =>
                  React.createElement("article", { className: "dta-event", key: item.callId },
                    React.createElement("div", { className: "dta-event-meta" },
                      React.createElement("strong", null, item.toolName),
                      React.createElement("time", null, item.timestamp ? new Date(item.timestamp).toLocaleString() : ""),
                      React.createElement("span", {
                      className: "dta-status " + (["tool-error", "tool-denied"].includes(item.status) ? "failed" : item.status === "running" ? "running" : "")
                      }, item.status === "running" ? text.running() : ["tool-error", "tool-denied"].includes(item.status) ? text.failed() : text.completed())
                    ),
                    React.createElement("label", null, text.input()),
                    React.createElement("pre", null, inputText(item)),
                    item.output !== undefined || item.error
                      ? React.createElement(React.Fragment, null,
                        React.createElement("label", null, item.error ? text.failed() : text.output()),
                        React.createElement("pre", { className: item.error ? "dta-error" : "" },
                          item.error || displayValue(item.output)
                        )
                      )
                      : null
                  )
                )
              )
          )
          : React.createElement("p", { className: "dta-muted" }, text.choose()),
        error ? React.createElement("div", { className: "dta-error-banner", role: "alert" }, text.error() + error) : null
      )
    )
  );
}

function apply(ctx) {
  const style = document.createElement("style");
  style.dataset.plugin = PANEL_ID;
  style.textContent = `
    .dsh-intermi-root{height:100%;min-height:0;display:flex;flex-direction:column;color:var(--dsw-alias-label-primary);font-size:13px}
    .dsh-intermi-header{display:flex;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l3)}
    .dsh-intermi-header>span{margin-left:auto;color:var(--dsw-alias-label-secondary)}
    .dsh-intermi-delete{border:1px solid var(--dsw-alias-border-l3);border-radius:7px;padding:6px 10px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);cursor:pointer}
    .dsh-intermi-delete:disabled{opacity:.5;cursor:default}
    .dsh-intermi-workspace{flex:1;min-height:0;display:flex}
    .dsh-intermi-terminal-pane{display:flex;flex:1;flex-direction:column;min-width:0;min-height:0;padding:8px;gap:6px}
    .dsh-intermi-toolbar{display:flex;align-items:center;gap:8px;min-height:32px}
    .dsh-intermi-terminal-pane select{max-width:100%;height:30px;padding:4px 28px 4px 9px;border:1px solid var(--dsw-alias-border-l3);border-radius:7px;background:var(--dsw-alias-bg-layer-1);color:inherit;font-size:12px}
    .dsh-intermi-session-select{min-width:180px;max-width:min(520px,80%);flex:0 1 440px}
    .dsh-intermi-appearance-button{height:30px;padding:4px 10px;border:1px solid var(--dsw-alias-border-l3);border-radius:7px;background:var(--dsw-alias-bg-layer-1);color:inherit;cursor:pointer;font-size:12px}
    .dsh-intermi-appearance-panel{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:8px 10px;border:1px solid var(--dsw-alias-border-l3);border-radius:8px;background:var(--dsw-alias-bg-layer-1)}
    .dsh-intermi-appearance-panel label{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-secondary);font-size:12px}
    .dsh-intermi-appearance-panel select{height:28px;padding:3px 8px;border:1px solid var(--dsw-alias-border-l3);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
    .dsh-intermi-appearance-panel input[type=color]{width:34px;height:28px;padding:2px;border:1px solid var(--dsw-alias-border-l3);border-radius:6px;background:transparent;cursor:pointer}
    .dsh-intermi-appearance-panel input:disabled{opacity:.5;cursor:default}
    .dsh-intermi-screen{box-sizing:border-box;width:100%;min-width:0;min-height:0;flex:1 1 0;overflow:hidden;background:var(--dsh-intermi-terminal-bg,#0b1220);border:1px solid var(--dsw-alias-border-l3);border-radius:7px;padding:6px;cursor:text}
    .dsh-intermi-screen .xterm{width:100%;height:100%;min-width:0}.dsh-intermi-screen .xterm-screen{width:100%}.dsh-intermi-screen .xterm-viewport{overflow-y:auto!important}
    .dsh-intermi-empty{flex:1;display:grid;place-items:center;color:var(--dsw-alias-label-secondary);text-align:center;padding:20px}
    .dsh-intermi-notice{font-size:12px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
    .dta-root{height:100%;min-height:0;display:flex;flex-direction:column;color:var(--dsw-alias-label-primary);font-size:13px}
    .dta-header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-l3)}
    .dta-count,.dta-muted,.dta-agent-state,.dta-event-meta time{color:var(--dsw-alias-label-secondary)}
    .dta-layout{display:grid;grid-template-columns:minmax(150px,220px) minmax(0,1fr);flex:1;min-height:0}
    .dta-agents{padding:12px;border-right:1px solid var(--dsw-alias-border-l3);overflow:auto}
    .dta-agents h3,.dta-main h3{font-size:13px;margin:0 0 10px}
    .dta-agent{display:flex;flex-direction:column;gap:4px;width:100%;padding:9px 10px;margin:0 0 6px;text-align:left;color:inherit;background:transparent;border:1px solid transparent;border-radius:8px;cursor:pointer}
    .dta-agent:hover,.dta-agent.selected{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l3)}
    .dta-agent-id{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--dsw-font-mono,monospace)}
    .dta-agent-state{font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .dta-main{padding:14px 16px;overflow:auto;min-width:0}
    .dta-main-head{display:flex;justify-content:space-between;align-items:center;gap:12px}
    .dta-events{display:flex;flex-direction:column;gap:10px}
    .dta-event{border:1px solid var(--dsw-alias-border-l3);border-radius:9px;padding:11px;background:var(--dsw-alias-bg-layer-1)}
    .dta-event-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:9px}
    .dta-event-meta time{font-size:11px}
    .dta-event label{display:block;margin:8px 0 4px;color:var(--dsw-alias-label-secondary);font-size:11px}
    .dta-event pre{margin:0;padding:8px;border-radius:6px;background:var(--dsw-alias-bg-l1);white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 var(--dsw-font-mono,monospace);max-height:260px;overflow:auto}
    .dta-status{font-size:11px}.dta-status.running{color:var(--dsw-alias-label-warning)}.dta-status.failed,.dta-error{color:var(--dsw-alias-label-danger)}
    .dta-load-older{margin:0 0 10px;padding:7px 10px;border:1px solid var(--dsw-alias-border-l3);border-radius:7px;background:transparent;color:inherit;cursor:pointer}
    .dta-error-banner{margin-top:10px;color:var(--dsw-alias-label-danger)}
    .dta-muted{padding:10px 0}
    @media(max-width:700px){.dta-layout{grid-template-columns:130px minmax(0,1fr)}}
  `;
  document.head.append(style);
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: PANEL_ID,
    kind: PANEL_ID,
    priority: "extension",
    title: () => text.title(),
    guide: [{
      id: "open",
      order: 45,
      title: () => text.title(),
      icon: TerminalGuideIcon,
      description: () => zh()
        ? "查看 Agent 持久 Shell 与终端操作记录"
        : "Review Agent persistent shells and terminal activity."
    }]
  }), "dsh-intermi: right sidebar type");
  ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
    name: "sidebar.right.pane.tab",
    key: PANEL_ID
  }, DshIntermiPanel)), "dsh-intermi: right sidebar body");

  return () => style.remove();
}
return { inject: ["slots", "sidebarRightTabs"], apply };
  }
});



