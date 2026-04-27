import { buildAnswer, buildQuestion, cidOf, generateKeypair, verifyArtifact } from "../src/index";
import { pullFromPeer } from "../src/federation";
import { createApp } from "../src/server";
import { openStore } from "../src/store";

const alice = generateKeypair();
const bob = generateKeypair();
const storeA = openStore(":memory:");
const storeB = openStore(":memory:");
const serverA = Bun.serve({ port: 0, fetch: createApp({ store: storeA }).fetch });
const serverB = Bun.serve({ port: 0, fetch: createApp({ store: storeB }).fetch });
const urlA = `http://127.0.0.1:${serverA.port}`;
const urlB = `http://127.0.0.1:${serverB.port}`;
const POST = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const q = await buildQuestion({ keypair: alice, title: "what is 2+2?", body: "numerically please", tags: ["math"] });
await POST(`${urlA}/questions`, q);
await pullFromPeer({ peerUrl: urlA, store: storeB });
const a = await buildAnswer({ keypair: bob, question_cid: await cidOf(q), body: "4" });
await POST(`${urlB}/answers`, a);
await pullFromPeer({ peerUrl: urlB, store: storeA });

console.log("alice sees bob's answer:", (await verifyArtifact(storeA.getArtifact(await cidOf(a))!)).ok);
console.log("bob sees alice's question:", (await verifyArtifact(storeB.getArtifact(await cidOf(q))!)).ok);

serverA.stop();
serverB.stop();
storeA.close();
storeB.close();
