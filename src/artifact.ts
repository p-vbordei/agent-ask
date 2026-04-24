import { z } from "zod";
import { artifactBytesForSig, computeCid, jcs } from "./canonical";
import {
  didFromPubkey,
  fromBase64,
  type Keypair,
  pubkeyFromDid,
  sign,
  toBase64,
  verify,
} from "./identity";

export const PROTOCOL_VERSION = "agent-ask/0.1" as const;

const SigSchema = z.object({
  alg: z.literal("ed25519"),
  pubkey: z.string(),
  sig: z.string(),
});

const BaseSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  id: z.string().uuid(),
  author_did: z.string().startsWith("did:key:"),
  created_at: z.string().datetime({ offset: true }),
  sig: SigSchema,
});

export const QuestionSchema = BaseSchema.extend({
  kind: z.literal("question"),
  title: z.string().min(1).max(256),
  body: z.string(),
  tags: z.array(z.string()),
  schema_ref: z.string().url().optional(),
}).strict();

export const AnswerSchema = BaseSchema.extend({
  kind: z.literal("answer"),
  question_cid: z.string(),
  body: z.string(),
  refs: z.array(z.string()).optional(),
}).strict();

export const RatingSchema = BaseSchema.extend({
  kind: z.literal("rating"),
  target_cid: z.string(),
  score: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
  rationale: z.string().optional(),
}).strict();

export const ArtifactSchema = z.discriminatedUnion("kind", [
  QuestionSchema,
  AnswerSchema,
  RatingSchema,
]);

export type Question = z.infer<typeof QuestionSchema>;
export type Answer = z.infer<typeof AnswerSchema>;
export type Rating = z.infer<typeof RatingSchema>;
export type Artifact = z.infer<typeof ArtifactSchema>;

export type BuildQuestionOpts = {
  keypair: Keypair;
  title: string;
  body: string;
  tags: string[];
  schema_ref?: string;
  createdAt?: string;
  id?: string;
};

export async function buildQuestion(opts: BuildQuestionOpts): Promise<Question> {
  const base = {
    v: PROTOCOL_VERSION,
    kind: "question" as const,
    id: opts.id ?? crypto.randomUUID(),
    author_did: opts.keypair.did,
    created_at: opts.createdAt ?? new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    title: opts.title,
    body: opts.body,
    tags: opts.tags,
    ...(opts.schema_ref ? { schema_ref: opts.schema_ref } : {}),
  };
  return finalize(base, opts.keypair) as Question;
}

function finalize<T extends Record<string, unknown>>(base: T, keypair: Keypair): T & { sig: z.infer<typeof SigSchema> } {
  const sigBytes = sign(artifactBytesForSig(base), keypair.privateKey);
  return {
    ...base,
    sig: {
      alg: "ed25519" as const,
      pubkey: toBase64(keypair.publicKey),
      sig: toBase64(sigBytes),
    },
  };
}

export async function cidOf(artifact: Artifact): Promise<string> {
  return computeCid(jcs(artifact));
}

export type VerifyResult = { ok: boolean; errors: string[] };

export async function verifyArtifact(raw: unknown): Promise<VerifyResult> {
  const parsed = ArtifactSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `schema: ${i.path.join(".")} ${i.message}`) };
  }
  const artifact = parsed.data;
  const errors: string[] = [];

  let pubkeyFromSig: Uint8Array;
  let pubkeyFromAuthor: Uint8Array;
  try {
    pubkeyFromSig = fromBase64(artifact.sig.pubkey);
    pubkeyFromAuthor = pubkeyFromDid(artifact.author_did);
  } catch (e) {
    return { ok: false, errors: [`identity: ${(e as Error).message}`] };
  }

  if (!bytesEqual(pubkeyFromSig, pubkeyFromAuthor)) {
    errors.push("identity: sig.pubkey does not match author_did");
  }
  if (didFromPubkey(pubkeyFromAuthor) !== artifact.author_did) {
    errors.push("identity: author_did does not match did:key of pubkey");
  }

  const sigBytes = fromBase64(artifact.sig.sig);
  const signedBytes = artifactBytesForSig(artifact as unknown as Record<string, unknown>);
  if (!verify(sigBytes, signedBytes, pubkeyFromAuthor)) {
    errors.push("signature: invalid");
  }

  return { ok: errors.length === 0, errors };
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export type BuildAnswerOpts = {
  keypair: Keypair;
  question_cid: string;
  body: string;
  refs?: string[];
  createdAt?: string;
  id?: string;
};

export async function buildAnswer(opts: BuildAnswerOpts): Promise<Answer> {
  const base = {
    v: PROTOCOL_VERSION,
    kind: "answer" as const,
    id: opts.id ?? crypto.randomUUID(),
    author_did: opts.keypair.did,
    created_at: opts.createdAt ?? new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    question_cid: opts.question_cid,
    body: opts.body,
    ...(opts.refs && opts.refs.length > 0 ? { refs: opts.refs } : {}),
  };
  return finalize(base, opts.keypair) as Answer;
}

export type BuildRatingOpts = {
  keypair: Keypair;
  target_cid: string;
  score: -1 | 0 | 1;
  rationale?: string;
  createdAt?: string;
  id?: string;
};

export async function buildRating(opts: BuildRatingOpts): Promise<Rating> {
  if (![-1, 0, 1].includes(opts.score)) {
    throw new Error(`invalid rating score: ${opts.score}`);
  }
  const base = {
    v: PROTOCOL_VERSION,
    kind: "rating" as const,
    id: opts.id ?? crypto.randomUUID(),
    author_did: opts.keypair.did,
    created_at: opts.createdAt ?? new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    target_cid: opts.target_cid,
    score: opts.score,
    ...(opts.rationale ? { rationale: opts.rationale } : {}),
  };
  return finalize(base, opts.keypair) as Rating;
}
