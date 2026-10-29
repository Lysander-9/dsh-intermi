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
    let changedAt = 0;
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
      if (overlap > 0) changedAt = overlap;
      else {
        while (changedAt < baseline.length && changedAt < current.length
          && baseline[changedAt] === current[changedAt]) changedAt++;
      }
    } else {
      while (changedAt < baseline.length && changedAt < current.length
        && baseline[changedAt] === current[changedAt]) changedAt++;
    }
    text = current.slice(changedAt).join("\n");
  }

  if (text.length > MAX_RECOVERED_RESULT_CHARS) {
    const prefix = "[...earlier output omitted...]\n";
    const tailLength = MAX_RECOVERED_RESULT_CHARS - prefix.length;
    text = prefix + Array.from(text).slice(-tailLength).join("");
    truncated = true;
  }
  return { text, truncated };
}
