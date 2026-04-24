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
