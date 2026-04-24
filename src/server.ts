import { Hono } from "hono";
import { type Artifact, verifyArtifact } from "./artifact";
import type { Store } from "./store";
import { openStore } from "./store";
import { pullFromPeer } from "./federation";

export type AppConfig = {
  store: Store;
  nowFn?: () => Date;
};

type IngestOk = { ok: true; cid: string };
type IngestErr = { ok: false; status: 400 | 413; error: string };

export function createApp(config: AppConfig) {
  const app = new Hono();
  const now = () => (config.nowFn ?? (() => new Date()))();

  const ingest = async (
    body: unknown,
    expectedKind: "question" | "answer" | "rating",
  ): Promise<IngestOk | IngestErr> => {
    const v = await verifyArtifact(body);
    if (!v.ok) return { ok: false, status: 400, error: `verify: ${v.errors.join("; ")}` };
    const artifact = body as Artifact;
    if (artifact.kind !== expectedKind) {
      return { ok: false, status: 400, error: `kind mismatch: expected ${expectedKind}` };
    }
    const nowMs = now().getTime();
    const createdMs = new Date(artifact.created_at).getTime();
    if (Math.abs(nowMs - createdMs) > 24 * 60 * 60 * 1000) {
      return { ok: false, status: 400, error: "created_at outside ±24h window" };
    }
    if (artifact.kind === "answer" && !config.store.hasArtifact(artifact.question_cid)) {
      return { ok: false, status: 400, error: "question_cid not known locally" };
    }
    if (artifact.kind === "rating" && !config.store.hasArtifact(artifact.target_cid)) {
      return { ok: false, status: 400, error: "target_cid not known locally" };
    }
    const cid = await config.store.insertArtifact(artifact);
    return { ok: true, cid };
  };

  app.post("/questions", async (c) => {
    const result = await ingest(await c.req.json(), "question");
    return result.ok ? c.json({ cid: result.cid }, 201) : c.json({ error: result.error }, result.status);
  });
  app.post("/answers", async (c) => {
    const result = await ingest(await c.req.json(), "answer");
    return result.ok ? c.json({ cid: result.cid }, 201) : c.json({ error: result.error }, result.status);
  });
  app.post("/ratings", async (c) => {
    const result = await ingest(await c.req.json(), "rating");
    return result.ok ? c.json({ cid: result.cid }, 201) : c.json({ error: result.error }, result.status);
  });

  app.get("/artifact/:cid", (c) => {
    const cid = c.req.param("cid");
    const artifact = config.store.getArtifact(cid);
    return artifact ? c.json(artifact) : c.json({ error: "not found" }, 404);
  });

  app.get("/questions", (c) => {
    const tag = c.req.query("tag") ?? undefined;
    const since = c.req.query("since") ?? undefined;
    const questions = config.store.listQuestions({ tag, since });
    return c.json(questions);
  });

  app.get("/feed", (c) => {
    const since = c.req.query("since") ?? undefined;
    const body = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        for (const artifact of config.store.streamFeed({ since })) {
          controller.enqueue(encoder.encode(`${JSON.stringify(artifact)}\n`));
        }
        controller.close();
      },
    });
    return new Response(body, {
      status: 200,
      headers: { "content-type": "application/x-ndjson; charset=utf-8" },
    });
  });

  return app;
}

export function main() {
  const dbPath = process.env.AGENT_ASK_DB ?? "./agent-ask.db";
  const port = Number(process.env.AGENT_ASK_PORT ?? 8787);
  const peers = (process.env.AGENT_ASK_PEERS ?? "").split(",").filter(Boolean);
  const pollMs = Number(process.env.AGENT_ASK_POLL_MS ?? 60_000);

  const store = openStore(dbPath);
  const app = createApp({ store });

  const server = Bun.serve({ port, fetch: app.fetch });
  console.log(JSON.stringify({ event: "listen", port: server.port, dbPath, peers }));

  const lastSeen = new Map<string, string>();
  if (peers.length > 0) {
    setInterval(async () => {
      for (const peer of peers) {
        try {
          const result = await pullFromPeer({
            peerUrl: peer,
            store,
            since: lastSeen.get(peer),
          });
          if (result.lastSeen) lastSeen.set(peer, result.lastSeen);
          if (result.count > 0 || result.rejected > 0) {
            console.log(JSON.stringify({ event: "pull", peer, ...result }));
          }
        } catch (e) {
          console.log(JSON.stringify({ event: "pull_error", peer, error: (e as Error).message }));
        }
      }
    }, pollMs);
  }
}

if (import.meta.main) main();
