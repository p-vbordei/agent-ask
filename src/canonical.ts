import canonicalize from "canonicalize";
import { sha256 } from "multiformats/hashes/sha2";
import { CID } from "multiformats/cid";
import * as raw from "multiformats/codecs/raw";

export function jcs(value: unknown): Uint8Array {
  const canonical = canonicalize(value);
  if (canonical === undefined) throw new Error("canonicalize returned undefined");
  return new TextEncoder().encode(canonical);
}

export function artifactBytesForSig(artifact: Record<string, unknown>): Uint8Array {
  const { sig: _omit, ...rest } = artifact;
  return jcs(rest);
}

export async function computeCid(bytes: Uint8Array): Promise<string> {
  const hash = await sha256.digest(bytes);
  return CID.createV1(raw.code, hash).toString();
}
