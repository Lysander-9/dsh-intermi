import test from "node:test";
import assert from "node:assert/strict";
import { deleteAllTerminals } from "../lib/delete-terminals.js";

test("clears each distinct terminal and reports failures without stopping", async () => {
  const removed = [];
  const result = await deleteAllTerminals([
    { agentId: "a", terminalId: "one" },
    { agentId: "a", terminalId: "one" },
    { agentId: "b", terminalId: "two" }
  ], async (terminal) => {
    if (terminal.terminalId === "two") throw new Error("terminal is busy");
    removed.push(terminal.terminalId);
    return { closed: true };
  });

  assert.deepEqual(removed, ["one"]);
  assert.equal(result.total, 2);
  assert.equal(result.removed, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.results[1].error, "terminal is busy");
});
