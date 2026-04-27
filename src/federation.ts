import { type Artifact, cidOf, verifyArtifact } from "./artifact";
import type { Store } from "./store";

export type PullOpts = {
  peerUrl: string;
  store: Store;
  since?: string;
  fetchFn?: (url: string) => Promise<Response>;
  nowFn?: () => Date;
};

export type PullResult = {
  count: number;
  rejected: number;
  lastSeen?: string;
  reasons: string[];
};

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
  const reasons: string[] = [];
  let lastSeen: string | undefined;
  const advanceLastSeen = (createdAt: string) => {
    if (!lastSeen || createdAt > lastSeen) lastSeen = createdAt;
  };
  for (const line of text.split("\n").reverse()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      reasons.push("invalid json line");
      continue;
    }
    const v = await verifyArtifact(raw);
    if (!v.ok) {
      reasons.push(`verify: ${v.errors[0] ?? "unknown"}`);
      continue;
    }
    const a = raw as Artifact;
    if (Math.abs(now - new Date(a.created_at).getTime()) > 24 * 60 * 60 * 1000) {
      reasons.push("created_at outside ±24h window");
      continue;
    }
    if (a.kind === "answer" && !opts.store.hasArtifact(a.question_cid)) {
      reasons.push("answer references unknown question_cid");
      continue;
    }
    if (a.kind === "rating" && !opts.store.hasArtifact(a.target_cid)) {
      reasons.push("rating references unknown target_cid");
      continue;
    }
    // Verified successfully — advance lastSeen even on duplicate so the
    // poller's `since` cursor doesn't stall on a fully-duplicate window.
    advanceLastSeen(a.created_at);
    const cid = await cidOf(a);
    if (opts.store.hasArtifact(cid)) continue;
    await opts.store.insertArtifact(a);
    count++;
  }
  return { count, rejected: reasons.length, lastSeen, reasons };
}
