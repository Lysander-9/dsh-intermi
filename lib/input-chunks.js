export function splitInputChunks(value, maxBytes) {
  if (typeof value !== "string") throw new TypeError("value must be a string");
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 4) throw new Error("maxBytes must be at least 4");
  if (value.length === 0) return [];

  const encoder = new TextEncoder();
  const chunks = [];
  let chunk = "";
  let bytes = 0;
  for (const character of value) {
    const size = encoder.encode(character).length;
    if (bytes + size > maxBytes) {
      chunks.push(chunk);
      chunk = "";
      bytes = 0;
    }
    chunk += character;
    bytes += size;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}
