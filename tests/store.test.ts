import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openStore, type Store } from "../src/store";
import { buildQuestion, buildAnswer, buildRating, cidOf } from "../src/artifact";
import { generateKeypair } from "../src/identity";

describe("store", () => {
  let store: Store;

  beforeEach(() => {
    store = openStore(":memory:");
  });
  afterEach(() => {
    store.close();
  });

  test("insertArtifact returns cid; getArtifact recovers exact artifact", async () => {
    const kp = generateKeypair();
    const q = await buildQuestion({ keypair: kp, title: "t", body: "b", tags: [] });
    const cid = await store.insertArtifact(q);
    expect(cid).toBe(await cidOf(q));
    expect(store.getArtifact(cid)).toEqual(q);
  });

  test("insertArtifact is idempotent on duplicate CID", async () => {
    const kp = generateKeypair();
    const q = await buildQuestion({
      keypair: kp,
      title: "t",
      body: "b",
      tags: [],
      createdAt: "2026-04-24T00:00:00Z",
      id: "01920000-0000-7000-8000-000000000001",
    });
    const cid1 = await store.insertArtifact(q);
    const cid2 = await store.insertArtifact(q); // no throw, same cid
    expect(cid1).toBe(cid2);
    const all = store.listQuestions({});
    expect(all.length).toBe(1);
  });

  test("listQuestions filters by tag", async () => {
    const kp = generateKeypair();
    const q1 = await buildQuestion({ keypair: kp, title: "a", body: "b", tags: ["x"] });
    const q2 = await buildQuestion({ keypair: kp, title: "b", body: "b", tags: ["y"] });
    await store.insertArtifact(q1);
    await store.insertArtifact(q2);
    const xs = store.listQuestions({ tag: "x" });
    expect(xs.map((q) => q.id)).toEqual([q1.id]);
  });

  test("listQuestions filters by since (strictly greater)", async () => {
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
    await store.insertArtifact(q1);
    await store.insertArtifact(q2);
    const recent = store.listQuestions({ since: "2026-04-15T00:00:00Z" });
    expect(recent.map((q) => q.id)).toEqual([q2.id]);
  });

  test("streamFeed returns artifacts newest first across all kinds", async () => {
    const kp = generateKeypair();
    const q = await buildQuestion({ keypair: kp, title: "t", body: "b", tags: [], createdAt: "2026-04-24T00:00:00Z" });
    const qCid = await store.insertArtifact(q);
    const a = await buildAnswer({ keypair: kp, question_cid: qCid, body: "ans", createdAt: "2026-04-24T00:01:00Z" });
    const aCid = await store.insertArtifact(a);
    const r = await buildRating({ keypair: kp, target_cid: aCid, score: 1, createdAt: "2026-04-24T00:02:00Z" });
    await store.insertArtifact(r);
    const feed = [...store.streamFeed({})];
    expect(feed.length).toBe(3);
    expect(feed[0].kind).toBe("rating");
  });

  test("hasArtifact returns false for unknown CID", () => {
    expect(store.hasArtifact("bafkunknown")).toBe(false);
  });
});
