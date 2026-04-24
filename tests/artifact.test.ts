import { describe, expect, test } from "bun:test";
import { buildAnswer, buildQuestion, cidOf, verifyArtifact } from "../src/artifact";
import { generateKeypair } from "../src/identity";

describe("question artifact", () => {
  test("buildQuestion returns signed artifact with v='agent-ask/0.1' and NO cid field", async () => {
    const kp = generateKeypair();
    const artifact = await buildQuestion({
      keypair: kp,
      title: "hello world",
      body: "does this protocol work?",
      tags: ["meta"],
    });
    expect(artifact.v).toBe("agent-ask/0.1");
    expect(artifact.kind).toBe("question");
    expect(artifact.title).toBe("hello world");
    expect(artifact.tags).toEqual(["meta"]);
    expect(artifact.author_did).toBe(kp.did);
    expect(artifact.sig.alg).toBe("ed25519");
    expect(typeof artifact.sig.sig).toBe("string");
    // Wire format must not include cid per SPEC §2.
    expect("cid" in artifact).toBe(false);
  });

  test("cidOf returns a CIDv1 raw sha-256 string", async () => {
    const kp = generateKeypair();
    const artifact = await buildQuestion({ keypair: kp, title: "t", body: "b", tags: [] });
    const cid = await cidOf(artifact);
    expect(cid.startsWith("bafk")).toBe(true);
  });

  test("verifyArtifact accepts a freshly-built question", async () => {
    const kp = generateKeypair();
    const artifact = await buildQuestion({
      keypair: kp,
      title: "t",
      body: "b",
      tags: [],
    });
    const result = await verifyArtifact(artifact);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("verifyArtifact rejects a mutated body", async () => {
    const kp = generateKeypair();
    const artifact = await buildQuestion({
      keypair: kp,
      title: "t",
      body: "b",
      tags: [],
    });
    const tampered = { ...artifact, body: "b!" };
    const result = await verifyArtifact(tampered);
    expect(result.ok).toBe(false);
    expect(result.errors.join(",")).toContain("signature");
  });

  test("verifyArtifact rejects mismatched author_did vs sig.pubkey", async () => {
    const kp = generateKeypair();
    const other = generateKeypair();
    const artifact = await buildQuestion({
      keypair: kp,
      title: "t",
      body: "b",
      tags: [],
    });
    const tampered = { ...artifact, author_did: other.did };
    const result = await verifyArtifact(tampered);
    expect(result.ok).toBe(false);
  });

  test("CID is deterministic for identical artifact bytes", async () => {
    const kp = generateKeypair();
    const common = {
      keypair: kp,
      title: "t",
      body: "b",
      tags: [],
      createdAt: "2026-04-24T00:00:00Z",
      id: "01920000-0000-7000-8000-000000000000",
    };
    // Ed25519 per RFC 8032 is deterministic: identical inputs → identical sig → identical CID.
    const a = await buildQuestion(common);
    const b = await buildQuestion(common);
    expect(a.sig.sig).toBe(b.sig.sig);
    expect(await cidOf(a)).toBe(await cidOf(b));
  });
});

describe("answer artifact", () => {
  test("buildAnswer references question_cid and verifies", async () => {
    const qKp = generateKeypair();
    const aKp = generateKeypair();
    const q = await buildQuestion({
      keypair: qKp,
      title: "q",
      body: "q body",
      tags: [],
    });
    const qCid = await cidOf(q);
    const answer = await buildAnswer({
      keypair: aKp,
      question_cid: qCid,
      body: "because X",
      refs: [],
    });
    expect(answer.kind).toBe("answer");
    expect(answer.question_cid).toBe(qCid);
    expect(answer.author_did).toBe(aKp.did);
    const v = await verifyArtifact(answer);
    expect(v.ok).toBe(true);
  });

  test("buildAnswer omits refs field when empty+not-provided", async () => {
    const kp = generateKeypair();
    const a = await buildAnswer({
      keypair: kp,
      question_cid: "bafkdeadbeef",
      body: "hi",
    });
    expect("refs" in a).toBe(false);
  });
});
