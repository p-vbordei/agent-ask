import { describe, expect, test } from "bun:test";
import { jcs, computeCid, artifactBytesForSig } from "../src/canonical";

describe("canonical", () => {
  test("JCS sorts object keys and omits whitespace", () => {
    const bytes = jcs({ b: 2, a: 1 });
    expect(new TextDecoder().decode(bytes)).toBe('{"a":1,"b":2}');
  });

  test("JCS produces identical bytes for objects with reordered keys", () => {
    const a = jcs({ x: 1, y: { q: "z", a: 1 } });
    const b = jcs({ y: { a: 1, q: "z" }, x: 1 });
    expect(a).toEqual(b);
  });

  test("artifactBytesForSig strips the top-level sig field", () => {
    const bytes = artifactBytesForSig({ a: 1, sig: { x: 1 }, b: 2 });
    expect(new TextDecoder().decode(bytes)).toBe('{"a":1,"b":2}');
  });

  test("computeCid returns CIDv1 raw sha-256 as bafk... string", async () => {
    const cid = await computeCid(new TextEncoder().encode("hello"));
    expect(cid.startsWith("bafk")).toBe(true);
    const cid2 = await computeCid(new TextEncoder().encode("hello"));
    expect(cid).toBe(cid2);
    const cidMut = await computeCid(new TextEncoder().encode("hellp"));
    expect(cid).not.toBe(cidMut);
  });
});
