// A paused external source must not accept new reports or look healthy after a rejected push.
import "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { IngestError, ingestItems } from "@aihot/backend/ingest/items";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { tag } from "./setup.ts";

after(async () => {
  await stopBoss();
  await closeDb();
});

test("a paused external source rejects pushed items without recording a successful fetch", async () => {
  const sourceId = `test-paused-ingest-${tag()}`;
  const lastOkAt = new Date("2026-09-01T00:00:00Z");
  await sql`
    INSERT INTO sources (id, name, kind, config, tier, participation_mode, enabled, health, last_ok_at)
    VALUES (${sourceId}, 'Paused external source', 'external', '{}'::jsonb, 'T2', 'editorial', false, 'paused', ${lastOkAt})`;

  await assert.rejects(
    ingestItems({ sourceId, items: [{ title: "New report", url: `https://example.org/${sourceId}` }] }),
    (error: unknown) => error instanceof IngestError && error.status === 409,
  );

  const [source] = await sql<{ last_ok_at: Date }[]>`SELECT last_ok_at FROM sources WHERE id = ${sourceId}`;
  const [articles] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM articles WHERE source_id = ${sourceId}`;
  assert.equal(source!.last_ok_at.toISOString(), lastOkAt.toISOString());
  assert.equal(articles!.count, 0);

  await sql`UPDATE sources SET enabled = true WHERE id = ${sourceId}`;
  assert.deepEqual(await ingestItems({ sourceId, items: [{ title: "New report", url: `https://example.org/${sourceId}` }] }), { ok: true, created: 1 });
});

test("an externally reported calendar day stays date-only through storage", async () => {
  const sourceId = `test-date-ingest-${tag()}`;
  await ingestItems({ sourceId, items: [{ title: "Calendar day", url: `https://example.org/${sourceId}`, publishedAt: "2026-10-13" }] });
  const [row] = await sql`SELECT publication_time, published_at_claim FROM articles WHERE source_id=${sourceId}`;
  assert.equal(row!.publication_time, "2026-10-13");
  assert.equal(row!.published_at_claim.toISOString(), "2026-10-13T00:00:00.000Z");
});

test("a pushed summary is stored as the excerpt with body_status none", async () => {
  const sourceId = `test-summary-ingest-${tag()}`;
  const url = `https://mp.example.org/${sourceId}`;
  assert.deepEqual(
    await ingestItems({ sourceId, items: [{ title: "Digest only", url, summary: "  摘要文字，中间有  多余空格。 " }] }),
    { ok: true, created: 1 },
  );
  const [row] = await sql<{ excerpt: string; body_status: string; body_text: string | null }[]>`SELECT excerpt, body_status, body_text FROM articles WHERE url = ${url}`;
  assert.equal(row!.excerpt, "摘要文字，中间有 多余空格。");
  assert.equal(row!.body_status, "none");
  assert.equal(row!.body_text, null);
});

test("pushed content is sanitized into the body with body_status ok", async () => {
  const sourceId = `test-content-ingest-${tag()}`;
  const url = `https://mp.example.org/${sourceId}`;
  await ingestItems({ sourceId, items: [{ title: "Full body", url, content: "<p>正文第一段</p><script>alert(1)</script><style>p{}</style><p>正文第二段</p>" }] });
  const [row] = await sql<{ body_status: string; body_html: string; body_text: string }[]>`SELECT body_status, body_html, body_text FROM articles WHERE url = ${url}`;
  assert.equal(row!.body_status, "ok");
  assert.ok(!row!.body_html.includes("<script"), "script tags must be sanitized away");
  assert.ok(!row!.body_html.includes("<style"), "style tags must be sanitized away");
  assert.ok(row!.body_html.includes("正文第一段"));
  assert.ok(row!.body_text.includes("正文第一段") && row!.body_text.includes("正文第二段"));
  assert.ok(!row!.body_text.includes("alert(1)"), "script content must not leak into body text");
});

test("repushing the same content creates no revision; changed content does", async () => {
  const sourceId = `test-revision-ingest-${tag()}`;
  const url = `https://mp.example.org/${sourceId}`;
  const item = { title: "Revision probe", url, content: "<p>第一版正文</p>" };
  await ingestItems({ sourceId, items: [item] });
  const [{ revision: first }] = await sql<{ revision: number }[]>`SELECT revision FROM articles WHERE url = ${url}`;

  await ingestItems({ sourceId, items: [{ ...item, raw: { _aihot: {} } }] });
  const [unchanged] = await sql<{ revision: number }[]>`SELECT revision FROM articles WHERE url = ${url}`;
  assert.equal(unchanged!.revision, first, "identical repush must not create a revision");

  await ingestItems({ sourceId, items: [{ ...item, title: "Revision probe（更新）", content: "<p>第二版正文</p>" }] });
  const [revised] = await sql<{ revision: number }[]>`SELECT revision FROM articles WHERE url = ${url}`;
  assert.ok(revised!.revision > first, "changed content must create a revision");
});

test("a summary-only repush lifts a stored pending entry to body_status none", async () => {
  const sourceId = `test-none-ingest-${tag()}`;
  const url = `https://mp.example.org/${sourceId}`;
  // First push has no body at all (stored as pending); the summary arrives on a later report.
  await ingestItems({ sourceId, items: [{ title: "Photo post", url }] });
  const [before] = await sql<{ body_status: string }[]>`SELECT body_status FROM articles WHERE url = ${url}`;
  assert.equal(before!.body_status, "pending");

  await ingestItems({ sourceId, items: [{ title: "Photo post", url, summary: "图集说明文字" }] });
  const [after] = await sql<{ body_status: string; excerpt: string }[]>`SELECT body_status, excerpt FROM articles WHERE url = ${url}`;
  assert.equal(after!.body_status, "none", "an explicit summary-only report must lift pending to none");
  assert.equal(after!.excerpt, "图集说明文字");

  // And a third push of the exact same report must stay stable (unchanged branch). Third push's
  // content hash equals the second's, so this exercises the unchanged path with the status
  // already corrected.
  await ingestItems({ sourceId, items: [{ title: "Photo post", url, summary: "图集说明文字" }] });
  const [again] = await sql<{ body_status: string; revision: number }[]>`SELECT body_status, revision FROM articles WHERE url = ${url}`;
  assert.equal(again!.body_status, "none");
});
