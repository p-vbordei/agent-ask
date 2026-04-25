// src/federation.ts
import { type Artifact, cidOf, verifyArtifact } from "./artifact";
import type { Store } from "./store";

export type PullOpts = {
  peerUrl: string;
  store: Store;
  since?: string;
  fetchFn?: (url: string) => Promise<Response>;
  nowFn?: () => Date;
};

export type PullResult = { count: number; rejected: number; lastSeen?: string };

export async function pullFromPeer(opts: PullOpts): Promise<PullResult> {
  const fetchFn = opts.fetchFn ?? fetch;
  const now = (opts.nowFn ?? (() => new Date()))().getTime();
  const url = opts.since
    ? `${opts.peerUrl}/feed?since=${encodeURIComponent(opts.since)}`
    : `${opts.peerUrl}/feed`;
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`peer ${opts.peerUrl} returned ${res.status}`);
  const text = await res.text();

  let count = 0;
  let rejected = 0;
  let lastSeen: string | undefined;
  for (const line of text.split("\n").reverse()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      rejected++;
      continue;
    }
    const v = await verifyArtifact(raw);
    if (!v.ok) {
      rejected++;
      continue;
    }
    const a = raw as Artifact;
    if (Math.abs(now - new Date(a.created_at).getTime()) > 24 * 60 * 60 * 1000) {
      rejected++;
      continue;
    }
    if (a.kind === "answer" && !opts.store.hasArtifact(a.question_cid)) {
      rejected++;
      continue;
    }
    if (a.kind === "rating" && !opts.store.hasArtifact(a.target_cid)) {
      rejected++;
      continue;
    }
    const cid = await cidOf(a);
    if (opts.store.hasArtifact(cid)) continue;
    await opts.store.insertArtifact(a);
    count++;
    if (!lastSeen || a.created_at > lastSeen) lastSeen = a.created_at;
  }
  return { count, rejected, lastSeen };
}
