import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createApp } from "../src/server";
import { openStore, type Store } from "../src/store";
import { buildQuestion, buildRating } from "../src/artifact";
import { generateKeypair } from "../src/identity";

describe("ingest edges (SPEC §3.1)", () => {
  let store: Store;

  beforeEach(() => {
    store = openStore(":memory:");
  });
  afterEach(() => {
    store.close();
  });

  test("rejects question created 48h in the past", async () => {
    const app = createApp({ store, nowFn: () => new Date("2026-04-24T12:00:00Z") });
    const kp = generateKeypair();
    const q = await buildQuestion({
      keypair: kp,
      title: "t",
      body: "b",
      tags: [],
      createdAt: "2026-04-22T11:59:00Z",
    });
    const res = await app.request("/questions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(q),
    });
    expect(res.status).toBe(400);
    const err = (await res.json()) as { error: string };
    expect(err.error).toContain("24h");
  });

  test("rejects question created 48h in the future", async () => {
    const app = createApp({ store, nowFn: () => new Date("2026-04-24T12:00:00Z") });
    const kp = generateKeypair();
    const q = await buildQuestion({
      keypair: kp,
      title: "t",
      body: "b",
      tags: [],
      createdAt: "2026-04-26T12:01:00Z",
    });
    const res = await app.request("/questions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(q),
    });
    expect(res.status).toBe(400);
  });

  test("accepts question created at the +23h boundary", async () => {
    const app = createApp({ store, nowFn: () => new Date("2026-04-24T12:00:00Z") });
    const kp = generateKeypair();
    const q = await buildQuestion({
      keypair: kp,
      title: "t",
      body: "b",
      tags: [],
      createdAt: "2026-04-25T11:00:00Z",
    });
    const res = await app.request("/questions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(q),
    });
    expect(res.status).toBe(201);
  });

  test("rejects sig.pubkey / author_did mismatch", async () => {
    const app = createApp({ store });
    const kp = generateKeypair();
    const other = generateKeypair();
    const q = await buildQuestion({ keypair: kp, title: "t", body: "b", tags: [] });
    const swapped = { ...q, author_did: other.did };
    const res = await app.request("/questions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(swapped),
    });
    expect(res.status).toBe(400);
  });

  test("rejects non-canonical timestamp (fractional seconds)", async () => {
    const app = createApp({ store });
    const kp = generateKeypair();
    const q = await buildQuestion({
      keypair: kp,
      title: "t",
      body: "b",
      tags: [],
      createdAt: "2026-04-25T12:00:00.000Z",
    });
    const res = await app.request("/questions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(q),
    });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain("created_at");
  });

  test("rejects non-canonical timestamp (+00:00 offset)", async () => {
    const app = createApp({ store });
    const kp = generateKeypair();
    const q = await buildQuestion({
      keypair: kp,
      title: "t",
      body: "b",
      tags: [],
      createdAt: "2026-04-25T12:00:00+00:00",
    });
    const res = await app.request("/questions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(q),
    });
    expect(res.status).toBe(400);
  });

  test("rejects rating targeting a non-existent CID", async () => {
    const app = createApp({ store });
    const kp = generateKeypair();
    const r = await buildRating({ keypair: kp, target_cid: "bafkdeadbeef", score: 1 });
    const res = await app.request("/ratings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(r),
    });
    expect(res.status).toBe(400);
  });

  test("rejects duplicate POST of same artifact with 200 (no-op) or 201 once only", async () => {
    const app = createApp({ store });
    const kp = generateKeypair();
    const q = await buildQuestion({ keypair: kp, title: "t", body: "b", tags: [] });
    const post = () =>
      app.request("/questions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(q),
      });
    const r1 = await post();
    expect(r1.status).toBe(201);
    const r2 = await post();
    expect(r2.status).toBe(201);
    expect(((await r2.json()) as { cid: string }).cid).toBe(((await r1.json()) as { cid: string }).cid);
    store.close();
  });

});
