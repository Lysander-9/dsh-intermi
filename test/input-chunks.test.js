import test from "node:test";
import assert from "node:assert/strict";
import { splitInputChunks } from "../lib/input-chunks.js";

test("splits large UTF-8 input into server-sized chunks without breaking characters", () => {
  const input = "😀汉字a".repeat(10_000);
  const chunks = splitInputChunks(input, 16_384);
  assert.equal(chunks.join(""), input);
  const encoder = new TextEncoder();
  assert.ok(chunks.every((chunk) => encoder.encode(chunk).length <= 16_384));
  assert.ok(chunks.every((chunk) => !/[\uD800-\uDBFF]$/.test(chunk)));
});

test("returns no empty chunk for empty input", () => {
  assert.deepEqual(splitInputChunks("", 16_384), []);
});
