import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { verifyArtifact } from "../src/artifact";

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
