export const MAX_RECOVERED_RESULT_CHARS = 32 * 1024;

/**
 * Recover newly retained PTY output when terminal_send's viewport is empty.
 * The terminal API measures offsets backward from the newest line, and its
 * retained buffer can roll over without increasing totalLines.
 */
export function recoverTerminalOutput(startLine, startText, read) {
  const page = read(0, 1000);
  const addedLines = Math.max(0, page.totalLines - startLine);
  let text = "";
  let truncated = page.truncated === true;

  if (addedLines > 0) {
    const recent = read(0, Math.min(addedLines, 1000));
    text = recent.text || "";
    truncated ||= recent.truncated === true || addedLines > 1000;
  } else if (page.text !== startText) {
    const baseline = startText ? startText.split("\n") : [];
    const current = page.text ? page.text.split("\n") : [];
    if (page.truncated) {
      // At the retention boundary, the old tail overlaps the new head.
      let overlap = Math.min(baseline.length, current.length);
      while (overlap > 0) {
        let matches = true;
        for (let index = 0; index < overlap; index++) {
          if (baseline[baseline.length - overlap + index] !== current[index]) {
            matches = false;
            break;
          }
        }
        if (matches) break;
        overlap--;
      }
      if (overlap > 0) {
        text = current.slice(overlap).join("\n");
      } else if (baseline.length > 0 && baseline.length === current.length
        && baseline.slice(0, -1).every((line, index) => line === current[index])) {
        // A one-line in-place update is safe to return; ambiguous rewrites of
        // older retained lines are deliberately omitted from the Agent result.
        text = current[current.length - 1] || "";
      }
    } else {
      const unchangedPrefix = baseline.findIndex((line, index) => line !== current[index]);
      const prefixLength = unchangedPrefix === -1 ? baseline.length : unchangedPrefix;
      if (baseline.length > 0 && baseline.length === current.length && prefixLength === baseline.length - 1) {
        text = current[current.length - 1] || "";
      }
    }
  }

  if (text.length > MAX_RECOVERED_RESULT_CHARS) {
    const prefix = "[...earlier output omitted...]\n";
    const tailLength = MAX_RECOVERED_RESULT_CHARS - prefix.length;
    text = prefix + Array.from(text).slice(-tailLength).join("");
    truncated = true;
  }
  return { text, truncated };
}
