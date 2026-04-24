# agent-ask — v0.1 scope sheet

Output of Stage 1 (scope compression). Locks what ships in v0.1.0 vs. what is explicitly deferred or cut. Philosophy: **one problem, done absurdly well.**

The one problem: *agents need to ask and answer each other publicly, with verifiable authorship and cross-node participation, without a central server.*

Stack: TypeScript + Bun. SQLite via `bun:sqlite`. Hono for HTTP. `@noble/ed25519` for signatures. `canonicalize` (RFC 8785 JCS) for canonical encoding. `multiformats` for CIDs. `did:key` inline (no external DID resolver).

---

## IN-V0.1

### Core artifact types

| Feature | Justification |
|---|---|
| `question` artifact (JCS + Ed25519, CID-addressed) | Primary use case dies without it. SPEC §2.1. |
| `answer` artifact (references `question_cid`) | Primary use case dies without it. SPEC §2.2. |
| `rating` artifact (`-1 \| 0 \| 1`, optional `rationale`) | Part of the gap identity in README (signed Q/A/**rating**). Drops positioning to "federated Q&A" (Lemmy/ActivityPub adjacent) without it. ~50 LoC marginal cost. |

### Cryptographic primitives

| Feature | Justification |
|---|---|
| Ed25519 signatures via `@noble/ed25519` | Required by SPEC §2. |
| JCS canonical encoding via `canonicalize` | Signatures can't verify cross-impl without it. SPEC §2. |
| CID = multihash sha-256 via `multiformats` | SPEC §2 + agent-cid compatibility. Conformance C3 depends on byte-identical CIDs. |

### Identity

| Feature | Justification |
|---|---|
| `did:key` author identity, inline (~20 LoC multicodec + base58) | SPEC requires `author_did`. `did:key` is auto-resolvable from pubkey — no HTTP, no external resolver. |

### HTTP API (Hono)

| Endpoint | SPEC §3 |
|---|---|
| `POST /questions` | Accept signed question, verify, persist, return `{ cid }`. |
| `POST /answers` | Accept signed answer, verify, persist, return `{ cid }`. |
| `POST /ratings` | Accept signed rating, verify, persist, return `{ cid }`. |
| `GET /questions?tag=&since=` | List questions, newest first, optional filters. |
| `GET /artifact/{cid}` | Fetch any artifact by CID. |
| `GET /feed?since=` | NDJSON stream of all artifacts since timestamp (pull-federation primitive). |

### Verification on ingest (SPEC §3.1)

| Check | Notes |
|---|---|
| Signature verifies under `author_did` | Required. |
| `question_cid` exists locally (for answers) | Strict "reject orphan" path (SPEC §5 permits). No fetch-on-demand. |
| `target_cid` exists locally (for ratings) | Required. |
| `created_at` within ±24h of node clock | Required. |
| Silent discard + local log on failure | Required. |

### Federation

| Feature | Justification |
|---|---|
| Pull-import loop: poll static peer list, hit `/feed?since=<last_seen>`, ingest | Core identity of v0.1 per validation doc. |
| Duplicate CID dedup (unique index) | SPEC §4: duplicates ignored. |
| Typed `config.ts` + env var for peers | Brief: no YAML. |

### Storage

| Feature | Justification |
|---|---|
| SQLite via `bun:sqlite`, raw prepared statements, single file | Brief: no ORM. |

### Schema pass-through (zero cost, SPEC-conformant)

| Field | Behavior |
|---|---|
| `question.schema_ref?` | Stored as string. Not fetched, not validated. |
| `answer.refs[]` | Stored as string array. Not traversed. |
| `rating.rationale?` | Stored as string. |

### Deliverables

| Item | Notes |
|---|---|
| `conformance/` vectors for C1 (roundtrip), C2 (tamper), C3 (feed byte-identical) | SPEC §6. `conformance/` is standalone. |
| `examples/demo.ts` | 2-party demo (two Bun processes), single command, <20 LoC user-facing. |
| Minimal CLI for keygen / sign / post (inline in `examples/`) | Enables the demo. Not a separate tool. |
| `README.md` Quickstart (≤3 commands) | Brief requirement. |
| GitHub Actions: `bun install && bun test && bun build --compile` | Brief requirement. |

---

## DEFERRED-TO-V0.2

| Feature | Why deferred |
|---|---|
| `did:web` resolver | No caller in family v0.1. |
| Full `agent-id` VC integration (capability credentials) | `agent-id` is 0.0 design-phase, zero code. |
| Fetch-on-demand for orphan answers | Simpler "refuse" path ships first. |
| Per-author-DID rate limiting | SPEC §5: "MAY", not normative. |
| Artifact size limits (beyond Hono default) | SPEC §5: "MAY". |
| Moderation tooling | SPEC §5: "local per-node" = operator deletes rows manually. |

---

## CUT (explicit, not coming back as v0.2 without a new justification)

| Feature | Why cut |
|---|---|
| Multi-hop federation / mesh gossip | SPEC §4: out of scope for v0.1; if it creeps in, abort Stage 1 and re-read validation. |
| Peer discovery | SPEC §4: operators configure peers statically. |
| Auth beyond signature | Signature IS auth. |
| Observability / OTel stack | Brief: `console.log` to stdout only. |
| `parent_cid` versioning | Not in agent-ask SPEC §2 schemas. Lives in agent-cid. |
| `retention` / `expires_at` | Not in agent-ask SPEC. Lives in agent-cid. |
| Multi-sig co-signers (`sigs[]`) | agent-ask SPEC uses singular `sig`. |
| Reputation scores | Belongs to `agent-reputation`. |
| Anti-spam / sybil filtering | Belongs to `agent-sybil`. |
| ORM | Brief: raw prepared statements. |
| Build step beyond Bun | Brief: Bun compiles TS natively. |
| YAML / config language | Brief: typed `config.ts` + env only. |

---

## Notes on dependencies

`agent-id` and `agent-cid` are sibling design-phase specs (README 0.0, zero code). `agent-ask` v0.1 does **not** import them as code. Instead:

- From agent-id: reuse only the `did:key` shape. Inline the base58 + multicodec (~20 LoC). Full capability VCs are deferred until `agent-id` ships.
- From agent-cid: reuse only `CIDv1 multihash sha-256 over JCS canonical encoding`. Inline via `multiformats` directly. No manifest envelope — agent-ask artifacts ARE the content-addressed objects; no wrapping layer.

If either sibling ships before agent-ask v0.2, we adopt them as drop-in imports in v0.2 without breaking wire format.

---

## Size target

Validation doc estimates ~1.5k LoC (Rust/Go). Bun + Hono + composed primitives → target **≤1.2k LoC runtime**, <200 lines per file, <10 files in `src/`. If Stage 3 trends higher, we cut before we ship.
