import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { base58btc } from "multiformats/bases/base58";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

const ED25519_MULTICODEC = new Uint8Array([0xed, 0x01]);

export type Keypair = {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  did: string;
};

export function generateKeypair(): Keypair {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = ed.getPublicKey(privateKey);
  return { privateKey, publicKey, did: didFromPubkey(publicKey) };
}

export function didFromPubkey(pubkey: Uint8Array): string {
  if (pubkey.length !== 32) throw new Error("pubkey must be 32 bytes");
  const payload = new Uint8Array(2 + pubkey.length);
  payload.set(ED25519_MULTICODEC, 0);
  payload.set(pubkey, 2);
  return `did:key:${base58btc.encode(payload)}`;
}

export function pubkeyFromDid(did: string): Uint8Array {
  if (!did.startsWith("did:key:")) throw new Error("not a did:key");
  const multibase = did.slice("did:key:".length);
  if (!multibase.startsWith("z")) throw new Error("did:key must use base58btc (z-prefix)");
  const decoded = base58btc.decode(multibase);
  if (decoded.length !== 34 || decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new Error("did:key multicodec is not ed25519-pub");
  }
  return decoded.slice(2);
}

export function sign(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
  return ed.sign(message, privateKey);
}

export function verify(sig: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean {
  try {
    return ed.verify(sig, message, publicKey);
  } catch {
    return false;
  }
}

export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export function fromBase64(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}
