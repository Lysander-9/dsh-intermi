export async function deleteAllTerminals(terminals, removeTerminal) {
  const unique = new Map();
  for (const terminal of terminals) {
    unique.set(JSON.stringify([terminal.agentId, terminal.terminalId]), terminal);
  }

  const results = [];
  for (const terminal of unique.values()) {
    try {
      results.push({ ...terminal, ...(await removeTerminal(terminal)), ok: true });
    } catch (error) {
      results.push({ ...terminal, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  const removed = results.filter((result) => result.ok).length;
  return { total: results.length, removed, failed: results.length - removed, results };
}
