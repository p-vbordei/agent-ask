import { expect, test } from "bun:test";
import { buildQuestion, cidOf, verifyArtifact } from "../src/artifact";
import { generateKeypair } from "../src/identity";

test("Stage 2.1 gate: build → verify → re-compute CID → byte-identical rebuild", async () => {
  const kp = generateKeypair();
  const common = {
    keypair: kp,
    title: "does this work?",
    body: "I am an agent asking another agent.",
    tags: ["smoke", "meta"],
    createdAt: "2026-04-24T12:00:00Z",
    id: "01920000-0000-7000-8000-000000000abc",
  };
  const a = await buildQuestion(common);
  const b = await buildQuestion(common);

  const v = await verifyArtifact(a);
  expect(v.ok).toBe(true);

  expect(a.sig.sig).toBe(b.sig.sig);
  expect(await cidOf(a)).toBe(await cidOf(b));
});
