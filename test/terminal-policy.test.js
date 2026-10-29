import test from "node:test";
import assert from "node:assert/strict";
import { agentToolDenial } from "../lib/terminal-policy.js";

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
