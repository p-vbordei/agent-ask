import { Database } from "bun:sqlite";
import { type Artifact, cidOf, type Question } from "./artifact";

export type Store = {
  insertArtifact(artifact: Artifact): Promise<string>;
  getArtifact(cid: string): Artifact | null;
  hasArtifact(cid: string): boolean;
  listQuestions(opts: { tag?: string; since?: string; limit?: number }): Question[];
  streamFeed(opts: { since?: string; limit?: number }): IterableIterator<Artifact>;
  close(): void;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS artifacts (
  cid TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL,
  body TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_artifacts_kind_created ON artifacts(kind, created_at);
CREATE INDEX IF NOT EXISTS idx_artifacts_created ON artifacts(created_at);

CREATE TABLE IF NOT EXISTS question_tags (
  cid TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (cid, tag),
  FOREIGN KEY (cid) REFERENCES artifacts(cid) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_question_tags_tag ON question_tags(tag);
`;

export function openStore(path: string): Store {
  const db = new Database(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);

  const insertArtifactStmt = db.prepare(
    "INSERT OR IGNORE INTO artifacts(cid, kind, created_at, body) VALUES (?, ?, ?, ?)",
  );
  const insertTagStmt = db.prepare("INSERT OR IGNORE INTO question_tags(cid, tag) VALUES (?, ?)");
  const getStmt = db.prepare("SELECT body FROM artifacts WHERE cid = ?");
  const hasStmt = db.prepare("SELECT 1 FROM artifacts WHERE cid = ?");

  return {
    async insertArtifact(artifact) {
      const cid = await cidOf(artifact);
      insertArtifactStmt.run(cid, artifact.kind, artifact.created_at, JSON.stringify(artifact));
      if (artifact.kind === "question") {
        for (const tag of artifact.tags) insertTagStmt.run(cid, tag);
      }
      return cid;
    },

    getArtifact(cid) {
      const row = getStmt.get(cid) as { body: string } | null;
      return row ? (JSON.parse(row.body) as Artifact) : null;
    },

    hasArtifact(cid) {
      return hasStmt.get(cid) !== null;
    },

    listQuestions({ tag, since, limit = 100 }) {
      const clauses: string[] = ["a.kind = 'question'"];
      const params: (string | number)[] = [];
      if (tag) {
        clauses.push("qt.tag = ?");
        params.push(tag);
      }
      if (since) {
        clauses.push("a.created_at > ?");
        params.push(since);
      }
      const join = tag ? "JOIN question_tags qt ON qt.cid = a.cid" : "";
      const sql = `
        SELECT DISTINCT a.body FROM artifacts a ${join}
        WHERE ${clauses.join(" AND ")}
        ORDER BY a.created_at DESC
        LIMIT ?
      `;
      params.push(limit);
      const rows = db.prepare(sql).all(...params) as { body: string }[];
      return rows.map((r) => JSON.parse(r.body) as Question);
    },

    *streamFeed({ since, limit = 1000 }) {
      const clauses: string[] = [];
      const params: (string | number)[] = [];
      if (since) {
        clauses.push("created_at > ?");
        params.push(since);
      }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
      const sql = `SELECT body FROM artifacts ${where} ORDER BY created_at DESC LIMIT ?`;
      params.push(limit);
      const rows = db.prepare(sql).all(...params) as { body: string }[];
      for (const r of rows) yield JSON.parse(r.body) as Artifact;
    },

    close() {
      db.close();
    },
  };
}
