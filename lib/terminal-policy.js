const HISTORY_READ_DENIAL = Object.freeze({
  auditReason: "Agent attempted to read user-facing terminal history",
  reason: "Retained terminal history is for the user in ITMN. Use only the result returned by the current terminal_send call."
});

export function agentToolDenial(toolName) {
  return toolName === "terminal_read" ? HISTORY_READ_DENIAL : undefined;
}

export function terminalSessionWritable(record, isController) {
  if (!record || record.closing || !isController) return false;
  try {
    return record.session?.status?.().kind === "running";
  } catch {
    return false;
  }
}
