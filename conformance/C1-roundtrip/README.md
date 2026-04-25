# C1 — Roundtrip

A signed question artifact. `verifyArtifact` MUST return `ok: true`.

Vectors here are deterministic: generated from Ed25519 privkey =
`Uint8Array(32).fill(1)`, fixed `id` and `created_at`. Regenerate with
`scripts/gen-c1.ts` (not committed).
