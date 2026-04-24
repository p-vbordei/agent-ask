// tests/federation.test.ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createApp } from "../src/server";
import { openStore, type Store } from "../src/store";
import { buildQuestion, buildAnswer, cidOf } from "../src/artifact";
import { generateKeypair } from "../src/identity";
import { pullFromPeer } from "../src/federation";

describe("federation pull-import", () => {
  let peerStore: Store;
  let localStore: Store;

  beforeEach(() => {
    peerStore = openStore(":memory:");
    localStore = openStore(":memory:");
  });
  afterEach(() => {
    peerStore.close();
    localStore.close();
  });

  test("pullFromPeer ingests all peer artifacts with byte-identical CIDs", async () => {
    const peerApp = createApp({ store: peerStore });
    const kp = generateKeypair();
    const q = await buildQuestion({ keypair: kp, title: "t", body: "b", tags: [] });
    await peerApp.request("/questions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(q),
    });
    const qCid = await cidOf(q);
    const a = await buildAnswer({ keypair: kp, question_cid: qCid, body: "ans" });
    const aCid = await cidOf(a);
    await peerApp.request("/answers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(a),
    });

    const fetchFn = async (url: string) => peerApp.request(url);
    const imported = await pullFromPeer({
      peerUrl: "http://peer",
      store: localStore,
      since: undefined,
      fetchFn,
    });

    expect(imported.count).toBe(2);
    expect(imported.lastSeen).toBe(a.created_at);
    expect(localStore.getArtifact(qCid)).toEqual(q);
    expect(localStore.getArtifact(aCid)).toEqual(a);
  });

  test("pullFromPeer is idempotent on repeated call", async () => {
    const peerApp = createApp({ store: peerStore });
    const kp = generateKeypair();
    const q = await buildQuestion({ keypair: kp, title: "t", body: "b", tags: [] });
    await peerApp.request("/questions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(q),
    });
    const fetchFn = async (url: string) => peerApp.request(url);
    const first = await pullFromPeer({ peerUrl: "http://peer", store: localStore, fetchFn });
    const second = await pullFromPeer({ peerUrl: "http://peer", store: localStore, fetchFn });
    expect(first.count).toBe(1);
    expect(second.count).toBe(0);
  });

  test("pullFromPeer discards invalid artifacts silently", async () => {
    const kp = generateKeypair();
    const q = await buildQuestion({ keypair: kp, title: "t", body: "b", tags: [] });
    const tampered = { ...q, body: "MUTATED" };
    const fakeFeed = `${JSON.stringify(tampered)}\n`;
    const fetchFn = async () =>
      new Response(fakeFeed, {
        status: 200,
        headers: { "content-type": "application/x-ndjson" },
      });
    const result = await pullFromPeer({ peerUrl: "http://peer", store: localStore, fetchFn });
    expect(result.count).toBe(0);
    expect(result.rejected).toBe(1);
    expect(localStore.hasArtifact(await cidOf(q))).toBe(false);
  });
});
