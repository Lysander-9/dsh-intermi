import test from "node:test";
import assert from "node:assert/strict";
import { MAX_RECOVERED_RESULT_CHARS, recoverTerminalOutput } from "../lib/terminal-output.js";

function terminalRead(lines, truncated = false) {
  return (offset, count) => {
    const end = Math.max(0, lines.length - offset);
    const start = Math.max(0, end - count);
    return {
      text: lines.slice(start, end).join("\n"),
      totalLines: lines.length,
      truncated
    };
  };
}

test("recovers lines added since the send started", () => {
  const read = terminalRead(["before one", "before two", "new output", "prompt"]);
  assert.deepEqual(recoverTerminalOutput(2, "before one\nbefore two", read), {
    text: "new output\nprompt",
    truncated: false
  });
});

test("returns no recovered output when the PTY tail has not changed", () => {
  const read = terminalRead(["one", "two"], true);
  assert.deepEqual(recoverTerminalOutput(2, "one\ntwo", read), {
    text: "",
    truncated: true
  });
});

test("recovers an in-place line update without inventing earlier output", () => {
  const read = terminalRead(["command", "progress 100%"]);
  assert.deepEqual(recoverTerminalOutput(2, "command\nprogress 80%", read), {
    text: "progress 100%",
    truncated: false
  });
});

test("recovers newly retained lines after the PTY scrollback rolls over", () => {
  const read = terminalRead(["line 2", "line 3", "line 4"], true);
  assert.deepEqual(recoverTerminalOutput(3, "line 1\nline 2\nline 3", read), {
    text: "line 4",
    truncated: true
  });
});

test("handles an in-place update after the retained buffer has previously truncated", () => {
  const read = terminalRead(["command", "progress 100%"], true);
  assert.deepEqual(recoverTerminalOutput(2, "command\nprogress 80%", read), {
    text: "progress 100%",
    truncated: true
  });
});

test("bounds recovered output and marks it truncated", () => {
  const oldLines = Array.from({ length: 1000 }, (_, index) => `old ${index}`);
  const newLines = [...oldLines, ...Array.from({ length: 1001 }, (_, index) => `new ${index} ${"x".repeat(48)}`)];
  const read = terminalRead(newLines);
  const recovered = recoverTerminalOutput(oldLines.length, oldLines.join("\n"), read);
  assert.equal(recovered.text.length, MAX_RECOVERED_RESULT_CHARS);
  assert.equal(recovered.text.endsWith(`new 1000 ${"x".repeat(48)}`), true);
  assert.equal(recovered.truncated, true);
});
