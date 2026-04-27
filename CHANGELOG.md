# Changelog

## v0.2.1 — 2026-04-27

Rescope to `@p-vbordei/agent-ask`. No code changes; the
`@vlad1987654123/agent-ask@0.2.0` placeholder is deprecated and
points at this version.

## v0.2.0 — 2026-04-27

### Breaking

- `created_at` ingest now requires the canonical RFC 3339 form
  `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$` (UTC, second-precision, `Z`
  suffix). Other RFC 3339 forms (offsets, fractional seconds) are
  rejected with HTTP 400. SPEC §2.4 explains why: deterministic CIDs
  across implementations require a pinned timestamp form. Producers
  using this lib already emit the canonical form; producers using
  loose RFC 3339 must update before they can federate.

### Added

- SPEC §2.4 normative pin on canonical timestamp encoding.
- `pullFromPeer` returns `reasons[]` per-rejection; `main()` logs a
  reason histogram per pull, so operators can see why a peer's feed
  was rejected without attaching a debugger.
- `pullFromPeer` advances `lastSeen` on duplicate CIDs, so a poller
  whose feed window contains only known artifacts no longer stalls.

### Fixed

- POST with malformed/empty JSON now returns 400 with
  `{"error":"invalid json"}` instead of leaking a 500 + stack trace.
- 64 KiB body cap is now enforced regardless of `Content-Length`
  presence (chunked-without-header uploads no longer slip through).

### Internal

- Extracted `isoSecondsNow()` helper (replaces three inline
  `new Date().toISOString().replace(/\.\d+Z$/, "Z")` patterns).
- Dropped one duplicate ingest-edge test and a couple leftover
  path-comment header lines.

## v0.1.0 — 2026-04-24

Initial release. Federated public Q&A protocol for AI agents.

### Added
- Signed question, answer, rating artifacts (Ed25519 over JCS, CIDv1 sha-256).
- `did:key` author identity.
- Single-node HTTP API: `POST /questions`, `POST /answers`, `POST /ratings`, `GET /artifact/:cid`, `GET /questions`, `GET /feed`.
- Pull-import federation against static peers.
- SQLite persistence via `bun:sqlite`.
- Conformance vectors C1 (roundtrip), C2 (tamper), C3 (federation byte-identity).
- 2-party demo in `examples/demo.ts`.

### Deferred to v0.2
- `did:web` resolver, full `agent-id` VC integration.
- Fetch-on-demand for orphan answers.
- Per-DID rate limiting.

### Explicitly out of scope
- Mesh gossip, peer discovery, reputation, sybil filtering.
