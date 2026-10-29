import test from "node:test";
import assert from "node:assert/strict";
import { agentToolDenial, terminalSessionWritable } from "../lib/terminal-policy.js";

test("blocks Agent access to retained terminal history", () => {
  assert.deepEqual(agentToolDenial("terminal_read"), {
    auditReason: "Agent attempted to read user-facing terminal history",
    reason: "Retained terminal history is for the user in ITMN. Use only the result returned by the current terminal_send call."
  });
});

test("keeps current-command and terminal lifecycle tools available", () => {
  for (const toolName of ["terminal_send", "terminal_list", "terminal_open", "terminal_signal", "terminal_close"]) {
    assert.equal(agentToolDenial(toolName), undefined);
  }
});

test("marks exited, closing, and non-controller terminals as read-only", () => {
  const running = { session: { status: () => ({ kind: "running" }) } };
  const exited = { session: { status: () => ({ kind: "exited", exitCode: 0 }) } };
  assert.equal(terminalSessionWritable(running, true), true);
  assert.equal(terminalSessionWritable(exited, true), false);
  assert.equal(terminalSessionWritable({ ...running, closing: true }, true), false);
  assert.equal(terminalSessionWritable(running, false), false);
  assert.equal(terminalSessionWritable({ session: {} }, true), false);
});
