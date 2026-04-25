import { describe, expect, test } from "bun:test";
import {
  generateKeypair,
  didFromPubkey,
  pubkeyFromDid,
  sign,
  verify,
  toBase64,
  fromBase64,
} from "../src/identity";

describe("identity", () => {
  test("generateKeypair produces 32-byte privkey, 32-byte pubkey, did:key", () => {
    const kp = generateKeypair();
    expect(kp.privateKey.length).toBe(32);
    expect(kp.publicKey.length).toBe(32);
    expect(kp.did.startsWith("did:key:z")).toBe(true);
  });

  test("did:key roundtrips through pubkey", () => {
    const kp = generateKeypair();
    const recovered = pubkeyFromDid(kp.did);
    expect(recovered).toEqual(kp.publicKey);
  });

  test("sign + verify roundtrip on a message", () => {
    const kp = generateKeypair();
    const msg = new TextEncoder().encode("hello");
    const sig = sign(msg, kp.privateKey);
    expect(sig.length).toBe(64);
    expect(verify(sig, msg, kp.publicKey)).toBe(true);
  });

  test("verify rejects a mutated message", () => {
    const kp = generateKeypair();
    const msg = new TextEncoder().encode("hello");
    const sig = sign(msg, kp.privateKey);
    const mutated = new TextEncoder().encode("hellp");
    expect(verify(sig, mutated, kp.publicKey)).toBe(false);
  });

  test("base64 helpers roundtrip", () => {
    const original = new Uint8Array([0, 1, 2, 255, 128, 64]);
    expect(fromBase64(toBase64(original))).toEqual(original);
  });

  test("pubkeyFromDid rejects non-ed25519 multicodec", () => {
    expect(() => pubkeyFromDid("did:key:zQ3sh")).toThrow();
  });

  test("didFromPubkey is deterministic", () => {
    const pk = new Uint8Array(32).fill(7);
    expect(didFromPubkey(pk)).toBe(didFromPubkey(pk));
  });
});
