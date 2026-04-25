# C2 — Tamper detection

Each vector here is C1's question.json with a single field mutated.
`verifyArtifact` MUST return `ok: false` for every file.

- `mutated-body.json` — body bytes changed; signature breaks.
- `mutated-author.json` — author_did points at a different did:key; pubkey/DID mismatch.
- `mutated-sig.json` — first 4 chars of sig.sig replaced; signature bytes invalid.

Regenerate with `scripts/gen-c2.ts` (not committed).
