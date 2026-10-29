import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

export const MAX_IN_MEMORY_AUDIT_EVENTS = 5_000;
export const MAX_IN_MEMORY_AUDIT_BYTES = 16 * 1024 * 1024;

export class AuditEventIndex {
  #events = [];
  #byAgent = new Map();
  #counts = new Map();
  #lastSequence = new Map();
  #sequence = 0;
  #retainedBytes = 0;

  constructor(maxEvents = MAX_IN_MEMORY_AUDIT_EVENTS, maxBytes = MAX_IN_MEMORY_AUDIT_BYTES) {
    if (!Number.isSafeInteger(maxEvents) || maxEvents < 1) throw new Error("maxEvents must be a positive integer");
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error("maxBytes must be a positive integer");
    this.maxEvents = maxEvents;
    this.maxBytes = maxBytes;
  }

  get sequence() {
    return this.#sequence;
  }

  get retainedCount() {
    return this.#events.length;
  }

  get retainedBytes() {
    return this.#retainedBytes;
  }

  advance() {
    return this.#sequence++;
  }

  append(event) {
    const sequence = this.advance();
    if (typeof event?.agentId !== "string") return sequence;
    this.#counts.set(event.agentId, (this.#counts.get(event.agentId) ?? 0) + 1);
    this.#lastSequence.set(event.agentId, sequence);
    let bytes;
    try { bytes = Buffer.byteLength(JSON.stringify(event), "utf8"); }
    catch { return sequence; }
    // Oversized individual rows stay on disk and are loaded through paging.
    if (bytes > this.maxBytes) return sequence;

    const entry = { sequence, event, bytes };
    this.#events.push(entry);
    const events = this.#byAgent.get(event.agentId) ?? [];
    events.push(entry);
    this.#byAgent.set(event.agentId, events);
    this.#retainedBytes += bytes;

    while (this.#events.length > this.maxEvents || this.#retainedBytes > this.maxBytes) {
      const expired = this.#events.shift();
      const retained = this.#byAgent.get(expired.event.agentId);
      retained?.shift();
      if (retained?.length === 0) this.#byAgent.delete(expired.event.agentId);
      this.#retainedBytes -= expired.bytes;
    }
    return sequence;
  }

  recent(agentId, limit) {
    const retained = this.#byAgent.get(agentId) ?? [];
    const selected = retained.slice(-limit);
    if ((this.#counts.get(agentId) ?? 0) > 0 && selected.at(-1)?.sequence !== this.#lastSequence.get(agentId)) return undefined;
    return {
      events: selected.map((entry) => entry.event),
      hasMore: (this.#counts.get(agentId) ?? 0) > selected.length,
      nextBefore: selected[0]?.sequence ?? this.#sequence
    };
  }

  before(agentId, before, limit) {
    const retained = this.#byAgent.get(agentId) ?? [];
    const eligible = retained.filter((entry) => entry.sequence < before);
    const selected = eligible.slice(-limit);
    const evictedEventsExist = (this.#counts.get(agentId) ?? 0) > retained.length;

    // If the retained window cannot fill this older page, consult disk so the
    // user's full history remains pageable without keeping it all in memory.
    if (evictedEventsExist && selected.length < limit) return undefined;
    return {
      events: selected.map((entry) => entry.event),
      hasMore: eligible.length > selected.length || evictedEventsExist,
      nextBefore: selected[0]?.sequence ?? before
    };
  }
}

export async function readAuditEventPage(path, agentId, before, limit) {
  const input = createReadStream(path, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  const matches = [];
  let sequence = 0;
  let hasMore = false;

  try {
    for await (const line of lines) {
      if (before !== undefined && sequence >= before) break;
      try {
        const event = JSON.parse(line);
        if (event?.agentId === agentId) {
          matches.push({ sequence, event });
          if (matches.length > limit) {
            matches.shift();
            hasMore = true;
          }
        }
      } catch {
        // Ignore malformed or interrupted log lines while preserving offsets.
      }
      sequence++;
    }
  } finally {
    lines.close();
    input.destroy();
  }

  return {
    events: matches.map((entry) => entry.event),
    hasMore,
    nextBefore: matches[0]?.sequence ?? 0
  };
}
