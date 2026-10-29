import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditEventIndex, readAuditEventPage } from "../lib/audit-events.js";

test("keeps a bounded recent event index while preserving total counts and cursors", () => {
  const index = new AuditEventIndex(3);
  index.append({ agentId: "a", value: "a1" });
  index.append({ agentId: "b", value: "b1" });
  index.append({ agentId: "a", value: "a2" });
  index.append({ agentId: "a", value: "a3" });
  index.append({ agentId: "a", value: "a4" });

  assert.deepEqual(index.recent("a", 2), {
    events: [{ agentId: "a", value: "a3" }, { agentId: "a", value: "a4" }],
    hasMore: true,
    nextBefore: 3
  });
  assert.equal(index.retainedCount, 3);
});

test("caps retained audit data by bytes and falls back when the newest event is not cached", () => {
  const index = new AuditEventIndex(10, 90);
  index.append({ agentId: "a", value: "x".repeat(40) });
  index.append({ agentId: "a", value: "y".repeat(100) });
  assert.ok(index.retainedBytes <= 90);
  assert.equal(index.recent("a", 10), undefined);
});

test("reads older event pages from JSONL without loading the file into the index", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dsh-intermi-events-"));
  const path = join(directory, "events.jsonl");
  try {
    await writeFile(path, [
      { agentId: "a", value: "a1" },
      { agentId: "b", value: "b1" },
      { agentId: "a", value: "a2" },
      { agentId: "a", value: "a3" }
    ].map((event) => JSON.stringify(event)).join("\n") + "\n");

    assert.deepEqual(await readAuditEventPage(path, "a", 4, 2), {
      events: [{ agentId: "a", value: "a2" }, { agentId: "a", value: "a3" }],
      hasMore: true,
      nextBefore: 2
    });
    assert.deepEqual(await readAuditEventPage(path, "a", 2, 2), {
      events: [{ agentId: "a", value: "a1" }],
      hasMore: false,
      nextBefore: 0
    });
    assert.deepEqual(await readAuditEventPage(path, "a", undefined, 2), {
      events: [{ agentId: "a", value: "a2" }, { agentId: "a", value: "a3" }],
      hasMore: true,
      nextBefore: 2
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
