import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createApp } from "../src/server";
import { openStore, type Store } from "../src/store";
import { buildQuestion, buildAnswer, buildRating, cidOf } from "../src/artifact";
import { generateKeypair } from "../src/identity";

describe("server POST routes", () => {
  let store: Store;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    store = openStore(":memory:");
    app = createApp({ store });
  });
  afterEach(() => {
    store.close();
  });

  test("POST /questions accepts a valid signed question and returns { cid }", async () => {
    const kp = generateKeypair();
    const q = await buildQuestion({ keypair: kp, title: "t", body: "b", tags: [] });
    const qCid = await cidOf(q);
    const res = await app.request("/questions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(q),
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { cid: string };
    expect(data.cid).toBe(qCid);
    expect(store.hasArtifact(qCid)).toBe(true);
  });

  test("POST /questions rejects tampered artifact with 400", async () => {
    const kp = generateKeypair();
    const q = await buildQuestion({ keypair: kp, title: "t", body: "b", tags: [] });
    const tampered = { ...q, body: "mutated" };
    const res = await app.request("/questions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(tampered),
    });
    expect(res.status).toBe(400);
  });

  test("POST /answers requires question_cid to exist", async () => {
    const kp = generateKeypair();
    const a = await buildAnswer({
      keypair: kp,
      question_cid: "bafkmissing",
      body: "orphan",
    });
    const res = await app.request("/answers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(a),
    });
    expect(res.status).toBe(400);
  });

  test("POST /ratings requires target_cid to exist", async () => {
    const kp = generateKeypair();
    const r = await buildRating({ keypair: kp, target_cid: "bafkmissing", score: 1 });
    const res = await app.request("/ratings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(r),
    });
    expect(res.status).toBe(400);
  });

  test("POST /questions with kind=answer returns 400", async () => {
    const kp = generateKeypair();
    const q = await buildQuestion({ keypair: kp, title: "t", body: "b", tags: [] });
    const mismatched = { ...q, kind: "answer" };
    const res = await app.request("/questions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(mismatched),
    });
    expect(res.status).toBe(400);
  });
});

describe("server GET routes", () => {
  let store: Store;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    store = openStore(":memory:");
    app = createApp({ store });
  });
  afterEach(() => {
    store.close();
  });

  test("GET /artifact/:cid returns the stored artifact (no cid field in body)", async () => {
    const kp = generateKeypair();
    const q = await buildQuestion({ keypair: kp, title: "t", body: "b", tags: ["x"] });
    const qCid = await cidOf(q);
    await app.request("/questions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(q),
    });
    const res = await app.request(`/artifact/${qCid}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual(q);
    expect("cid" in body).toBe(false);
  });

  test("GET /artifact/:cid 404 on unknown CID", async () => {
    const res = await app.request("/artifact/bafkunknown");
    expect(res.status).toBe(404);
  });

  test("GET /questions lists with tag filter", async () => {
    const kp = generateKeypair();
    const q1 = await buildQuestion({ keypair: kp, title: "a", body: "b", tags: ["x"] });
    const q2 = await buildQuestion({ keypair: kp, title: "b", body: "b", tags: ["y"] });
    await app.request("/questions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(q1),
    });
    await app.request("/questions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(q2),
    });
    const res = await app.request("/questions?tag=x");
    expect(res.status).toBe(200);
    const list = (await res.json()) as { id: string }[];
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(q1.id);
  });

  test("GET /feed returns NDJSON of artifacts", async () => {
    const store2 = openStore(":memory:");
    const app2 = createApp({ store: store2 });
    const kp = generateKeypair();
    const q = await buildQuestion({ keypair: kp, title: "t", body: "b", tags: [] });
    await app2.request("/questions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(q),
    });
    const res = await app2.request("/feed");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    const text = await res.text();
    const lines = text.trim().split("\n").filter(Boolean);
    expect(lines.length).toBe(1);
    const first = JSON.parse(lines[0]);
    expect(first).toEqual(q);
    store2.close();
  });

  test("GET /feed?since= respects cutoff", async () => {
    const store3 = openStore(":memory:");
    const app3 = createApp({ store: store3 });
    const kp = generateKeypair();
    const q1 = await buildQuestion({
      keypair: kp,
      title: "a",
      body: "b",
      tags: [],
      createdAt: "2026-04-01T00:00:00Z",
    });
    const q2 = await buildQuestion({
      keypair: kp,
      title: "b",
      body: "b",
      tags: [],
      createdAt: "2026-05-01T00:00:00Z",
    });
    // Bypass the ±24h window by inserting directly.
    await store3.insertArtifact(q1);
    await store3.insertArtifact(q2);
    const res = await app3.request("/feed?since=2026-04-15T00:00:00Z");
    const lines = (await res.text()).trim().split("\n").filter(Boolean);
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]).id).toBe(q2.id);
    store3.close();
  });
});

describe("server body-size limit", () => {
  test("POST rejects body larger than 64 KiB", async () => {
    const store = openStore(":memory:");
    const app = createApp({ store });
    const huge = "x".repeat(64 * 1024 + 100);
    const res = await app.request("/questions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ junk: huge }),
    });
    expect([400, 413]).toContain(res.status);
    store.close();
  });
});
