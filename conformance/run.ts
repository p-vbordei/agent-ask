import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { cidOf, type Artifact, verifyArtifact } from "../src/artifact";
import { openStore } from "../src/store";
import { pullFromPeer } from "../src/federation";

type Case = {
  name: string;
  run(): Promise<void>;
};

const cases: Case[] = [];

// C1 — Roundtrip: every file in C1-roundtrip/ MUST verify ok.
for (const f of readdirSync(join(import.meta.dir, "C1-roundtrip"))) {
  if (!f.endsWith(".json")) continue;
  cases.push({
    name: `C1 roundtrip: ${f}`,
    async run() {
      const raw = JSON.parse(readFileSync(join(import.meta.dir, "C1-roundtrip", f), "utf8"));
      const v = await verifyArtifact(raw);
      if (!v.ok) throw new Error(`verify failed: ${v.errors.join("; ")}`);
    },
  });
}

// C2 — Tamper: every file in C2-tamper/ MUST FAIL verification.
for (const f of readdirSync(join(import.meta.dir, "C2-tamper"))) {
  if (!f.endsWith(".json")) continue;
  cases.push({
    name: `C2 tamper: ${f}`,
    async run() {
      const raw = JSON.parse(readFileSync(join(import.meta.dir, "C2-tamper", f), "utf8"));
      const v = await verifyArtifact(raw);
      if (v.ok) throw new Error("expected verification to fail, but it passed");
    },
  });
}

cases.push({
  name: "C3 pull-import produces byte-identical CIDs",
  async run() {
    const feedPath = join(import.meta.dir, "C3-federation", "feed.ndjson");
    const feed = readFileSync(feedPath, "utf8");
    const expected = feed
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Artifact);
    const store = openStore(":memory:");
    try {
      const fakeFetch = async () =>
        new Response(feed, { status: 200, headers: { "content-type": "application/x-ndjson" } });
      const newest = expected.reduce((a, b) => (a.created_at > b.created_at ? a : b));
      const nowFn = () => new Date(newest.created_at);
      const result = await pullFromPeer({
        peerUrl: "http://peer",
        store,
        fetchFn: fakeFetch,
        nowFn,
      });
      if (result.count !== expected.length) {
        throw new Error(
          `expected ${expected.length} imports, got ${result.count} (rejected: ${result.rejected})`,
        );
      }
      for (const art of expected) {
        const cid = await cidOf(art);
        if (!store.hasArtifact(cid)) throw new Error(`${cid} not ingested`);
        const got = store.getArtifact(cid);
        if (JSON.stringify(got) !== JSON.stringify(art)) {
          throw new Error(`byte mismatch for ${cid}`);
        }
      }
    } finally {
      store.close();
    }
  },
});

let failed = 0;
for (const c of cases) {
  try {
    await c.run();
    console.log(`PASS  ${c.name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${c.name} — ${(e as Error).message}`);
  }
}
if (failed > 0) {
  console.log(`\n${failed}/${cases.length} conformance cases failed.`);
  process.exit(1);
}
console.log(`\nAll ${cases.length} conformance cases passed.`);
