# C3 — Pull-import byte-identity

`feed.ndjson` is one rating, one answer, one question (newest-first, as
the server emits). After `pullFromPeer`, every artifact in the local
store MUST have a CID byte-identical to the source line and a JSON
serialization byte-identical to the source.

Regenerate with `scripts/gen-c3.ts` (not committed).
