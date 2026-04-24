import { Hono } from "hono";
import { type Artifact, verifyArtifact } from "./artifact";
import type { Store } from "./store";

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

  return app;
}
