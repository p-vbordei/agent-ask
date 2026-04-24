export { buildQuestion, buildAnswer, buildRating, cidOf, verifyArtifact } from "./artifact";
export type { Question, Answer, Rating, Artifact, VerifyResult } from "./artifact";
export { generateKeypair, didFromPubkey, pubkeyFromDid } from "./identity";
export type { Keypair } from "./identity";
export { computeCid, jcs } from "./canonical";
