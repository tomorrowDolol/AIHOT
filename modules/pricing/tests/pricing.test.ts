// 比价：价格怎么读、怎么导，以及公开出口的边界。
// 按会出错的写法写：
// - 两个平台各一个 SKU 时，列表给出的是各 SKU 现价的区间，不是几条读数混在一起的区间；
// - 有到手价时用到手价，没有用标价；
// - 时间窗外的读数不进高低点和曲线（三年前的最低价不该挂在页面上）；
// - 同一时刻重导同一张表只覆盖那一行，不新增一次降价；
// - 没有对应 SKU 的价格行被退回，而不是猜一个 SKU 写进去；
// - 后台接口没有会话就是 401，公开接口没有这个对象就是 404。
import { tag } from "../../../tests/setup.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { installModules } from "@aihot/backend/modules";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { buildApp } from "../../../apps/api/src/app.ts";
import pricing from "../server.ts";
import { itemBySlug, listItems } from "../read.ts";
import { assignOffer, createItem, createOffer, importSnapshots, ingestDetails, ingestListings, parseSnapshotLines } from "../write.ts";
import { brandOffers, brandSummaries, detailQueue, pairingSuggestions } from "../read.ts";

process.env.INGEST_TOKEN = "pricing-ingest-test-token-0001";

const T = tag();
const SLUG = `test-pricing-${T}`;
installModules([pricing]);
const app = await buildApp();

const at = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000);
/** 固定下来，重导要打在同一秒上；每次调用 at() 差几毫秒就成了两条读数。 */
const ONE_DAY_AGO = at(1).toISOString();

before(async () => {
  await createItem({ slug: SLUG, name: "测试体脂秤", brand: "senssun", productLine: "体脂秤", spec: "180kg/50g" });
  await createItem({ slug: `${SLUG}-empty`, name: "还没价格的型号" });
  await createOffer({ itemSlug: SLUG, platform: "jd", shop: "京东自营", sku: `jd-${T}`, url: "https://item.jd.com/1.html" });
  await createOffer({ itemSlug: SLUG, platform: "taobao", shop: "旗舰店", sku: `tb-${T}`, url: "https://item.taobao.com/2.htm" });
  await importSnapshots([
    // 京东：标价 499，到手 459；三天前 529。
    { platform: "jd", sku: `jd-${T}`, price: 499, promoPrice: 459, listPrice: 599, inStock: true, capturedAt: ONE_DAY_AGO },
    { platform: "jd", sku: `jd-${T}`, price: 529, capturedAt: at(3).toISOString() },
    // 淘宝：只有标价 469；还有一条 200 天前更低的读数，窗口外。
    { platform: "taobao", sku: `tb-${T}`, price: 469, inStock: true, capturedAt: at(2).toISOString() },
    { platform: "taobao", sku: `tb-${T}`, price: 399, capturedAt: at(200).toISOString() },
  ]);
});

after(async () => {
  await app.close();
  await stopBoss();
  await sql`DELETE FROM pricing_offer WHERE sku LIKE ${`%${T}%`}`;
  await sql`DELETE FROM pricing_item WHERE slug LIKE ${`${SLUG}%`}`;
  await closeDb();
});

test("列表按现价给区间：到手价优先，时间窗外的读数不参与", async () => {
  const items = await listItems();
  const item = items.find((i) => i.slug === SLUG);
  assert.ok(item);
  assert.equal(item.offerCount, 2);
  assert.deepEqual([...item.platforms].sort(), ["jd", "taobao"]);
  // 京东到手 459，淘宝标价 469（200 天前的 399 不算）。
  assert.equal(item.lowest, 459);
  assert.equal(item.highest, 469);
});

test("详情给出每个 SKU 的曲线，窗口外的点不画", async () => {
  const detail = await itemBySlug(SLUG);
  assert.ok(detail);
  const jd = detail.offers.find((o) => o.platform === "jd")!;
  assert.equal(jd.latest?.price, 459);
  assert.equal(jd.latest?.listPrice, 599);
  assert.deepEqual(jd.points.map((p) => p.price), [529, 459]);
  const tb = detail.offers.find((o) => o.platform === "taobao")!;
  assert.deepEqual(tb.points.map((p) => p.price), [469]);
  assert.equal(tb.min, 469);
});

test("同一时刻重导只覆盖那一行", async () => {
  await importSnapshots([{ platform: "jd", sku: `jd-${T}`, price: 499, promoPrice: 449, capturedAt: ONE_DAY_AGO }]);
  await importSnapshots([{ platform: "jd", sku: `jd-${T}`, price: 499, promoPrice: 439, capturedAt: ONE_DAY_AGO }]);
  const detail = await itemBySlug(SLUG);
  const jd = detail!.offers.find((o) => o.platform === "jd")!;
  assert.equal(jd.points.length, 2, "同一时刻只有一行");
  assert.equal(jd.latest?.price, 439);
});

test("没有对应 SKU 的行被退回，不写库", async () => {
  const result = await importSnapshots([{ platform: "pdd", sku: `nope-${T}`, price: 100 }]);
  assert.equal(result.written, 0);
  assert.deepEqual(result.skipped.map((s) => s.reason), ["没有这个 SKU"]);
});

test("粘贴的价格表：跳过空行和注释，坏行报行号", () => {
  const parsed = parseSnapshotLines([
    "# 十月",
    "",
    `jd,jd-${T},499,459,599,有货,2026-10-01T10:00:00+08:00`,
    `taobao,tb-${T},469,,,无货,`,
    `jd,jd-${T},不是数字,,,,`,
    `,,1,,,,`,
  ].join("\n"));
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0]!.promoPrice, 459);
  assert.equal(parsed.rows[1]!.inStock, false);
  assert.equal(parsed.rows[1]!.capturedAt, null);
  assert.equal(parsed.errors.length, 2);
  assert.match(parsed.errors[0]!, /第 5 行/);
  assert.match(parsed.errors[1]!, /第 6 行/);
});

test("公开接口给出带缓存头的 JSON，未知对象 404，后台没有会话 401", async () => {
  const list = await app.inject({ method: "GET", url: "/api/v1/pricing" });
  assert.equal(list.statusCode, 200);
  assert.match(String(list.headers["cache-control"]), /max-age=300/);
  const body = list.json() as { items: Array<{ slug: string }> };
  assert.ok(body.items.some((i) => i.slug === SLUG));

  const detail = await app.inject({ method: "GET", url: `/api/v1/pricing/${SLUG}` });
  assert.equal(detail.statusCode, 200);
  assert.equal((detail.json() as { offers: unknown[] }).offers.length, 2);

  const missing = await app.inject({ method: "GET", url: "/api/v1/pricing/no-such-item" });
  assert.equal(missing.statusCode, 404);

  const admin = await app.inject({ method: "GET", url: "/api/admin/pricing" });
  assert.equal(admin.statusCode, 401);
});

// ── 采价程序推来的在售 SKU（sku-watch 这类脚本）──────────────────────────────────────

const PUSH = { authorization: "Bearer pricing-ingest-test-token-0001" };

test("推送要带 token，没有就 401", async () => {
  const res = await app.inject({ method: "POST", url: "/api/pricing/ingest", payload: { rows: [] } });
  assert.equal(res.statusCode, 401);
});

test("推送建出品牌名下的 SKU 和一次价格，同一 SKU 再推是更新不是新行", async () => {
  const rows = [
    { platform: "jd", sku: `push-${T}-1`, brand: "lefu", title: "乐福 体脂秤 A", shop: "乐福旗舰店", url: `https://item.jd.com/${T}1.html`, price: 129.9, capturedAt: at(1).toISOString() },
    { platform: "taobao", sku: `push-${T}-2`, brand: "lefu", title: "乐福 体重秤 B", shop: "乐福旗舰店", url: `https://item.taobao.com/${T}2.htm`, price: 59, capturedAt: at(1).toISOString() },
  ];
  const first = await app.inject({ method: "POST", url: "/api/pricing/ingest", headers: PUSH, payload: { rows } });
  assert.equal(first.statusCode, 200);
  assert.deepEqual(first.json().offers, { created: 2, updated: 0 });
  assert.equal(first.json().written, 2);

  // 再推一次同一批：没有新 SKU，价格点也不重复。
  const second = await app.inject({ method: "POST", url: "/api/pricing/ingest", headers: PUSH, payload: { rows } });
  assert.deepEqual(second.json().offers, { created: 0, updated: 2 });

  const brand = (await brandSummaries()).find((b) => b.brand === "lefu");
  assert.ok(brand);
  assert.equal(brand.offers, 2);
  assert.equal(brand.shops, 1);
  assert.equal(brand.lowest, 59);
  assert.equal(brand.highest, 129.9);
});

test("推送不动人工归好的型号", async () => {
  await createItem({ slug: `${SLUG}-curated`, name: "人工归类的型号" });
  await createOffer({ itemSlug: `${SLUG}-curated`, platform: "jd", sku: `curated-${T}`, url: `https://item.jd.com/${T}c.html` });
  await app.inject({
    method: "POST", url: "/api/pricing/ingest", headers: PUSH,
    payload: { rows: [{ platform: "jd", sku: `curated-${T}`, brand: "lefu", title: "采集来的标题", url: `https://item.jd.com/${T}c.html`, price: 200 }] },
  });
  const detail = await itemBySlug(`${SLUG}-curated`);
  assert.ok(detail);
  assert.equal(detail.offers.length, 1, "仍然挂在这个型号下，没有另起一行");
  assert.equal(detail.offers[0]!.latest?.price, 200);
});

test("10 天没再采到就算下架，人工贴一次价格又回到在售", async () => {
  const staleSku = `push-${T}-2`;
  const before = (await brandSummaries()).find((b) => b.brand === "lefu")!;
  await sql`UPDATE pricing_offer SET last_seen_at = now() - interval '30 days' WHERE sku = ${staleSku}`;

  let brand = (await brandSummaries()).find((b) => b.brand === "lefu")!;
  assert.equal(brand.offers, before.offers - 1, "在售少一个");
  assert.equal(brand.gone, before.gone + 1, "下架的那个还在，只是不算在售");

  const row = (await brandOffers("lefu")).find((o) => o.sku === staleSku)!;
  assert.equal(row.active, false);

  // 人工贴一次价格 = 它还在卖：回到在售，不用改任何标记。
  await importSnapshots([{ platform: "taobao", sku: staleSku, price: 55, capturedAt: new Date().toISOString() }]);
  brand = (await brandSummaries()).find((b) => b.brand === "lefu")!;
  assert.equal(brand.offers, before.offers);
  assert.equal(brand.gone, before.gone);
});

test("全部下架的品牌仍列出，平台是空数组而不是 null", async () => {
  await app.inject({
    method: "POST", url: "/api/pricing/ingest", headers: PUSH,
    payload: { rows: [{ platform: "taobao", sku: `gone-${T}`, brand: "xinyu", title: "新域 体重秤", url: `https://item.taobao.com/${T}g.htm`, price: 88 }] },
  });
  await sql`UPDATE pricing_offer SET last_seen_at = now() - interval '30 days' WHERE sku = ${`gone-${T}`}`;

  const brand = (await brandSummaries()).find((b) => b.brand === "xinyu")!;
  assert.equal(brand.offers, 0, "一个在售都没有，仍为备查列出");
  assert.deepEqual(brand.platforms, [], "首页要能直接 join，不能拿到 null");
});

test("品牌页接口只认词表里的品牌，没数据是 404", async () => {
  const ok = await app.inject({ method: "GET", url: "/api/v1/pricing/brands/lefu" });
  assert.equal(ok.statusCode, 200);
  assert.equal((ok.json() as { label: string }).label, "乐福");
  assert.ok((ok.json() as { offers: unknown[] }).offers.length >= 2);

  const unknown = await app.inject({ method: "GET", url: "/api/v1/pricing/brands/not-a-brand" });
  assert.equal(unknown.statusCode, 404);

  const empty = await app.inject({ method: "GET", url: "/api/v1/pricing/brands/garmin" });
  assert.equal(empty.statusCode, 404);
});

// ── 详情：型号线索与配对 ──────────────────────────────────────────────────────────────

test("详情队列只给归到型号的 SKU，读一次就离开队列", async () => {
  const curated = `curated-${T}`;
  const queue = await detailQueue();
  assert.ok(queue.some((q) => q.sku === curated), "归到型号的 SKU 要读");
  assert.ok(!queue.some((q) => q.sku === `push-${T}-1`), "没归型号的不读，一次一分钟太贵");

  const result = await ingestDetails([{
    platform: "jd", sku: curated, modelHint: "至越Pro",
    specs: { 品牌: "香山", 颜色: "【旗舰】专业八电极-至越Pro充电" }, capturedAt: new Date().toISOString(),
  }]);
  assert.equal(result.updated, 1);
  assert.deepEqual(result.skipped, []);

  assert.ok(!(await detailQueue()).some((q) => q.sku === curated), "30 天内读过的不再排队");
});

test("读不到详情也记时间，免得每轮重试；未知 SKU 被退回", async () => {
  const unknown = await ingestDetails([{ platform: "jd", sku: `missing-${T}`, modelHint: "x" }]);
  assert.deepEqual(unknown.skipped.map((s) => s.reason), ["没有这个 SKU"]);

  const failed = await ingestDetails([{ platform: "jd", sku: `push-${T}-1`, error: "LOGIN_WALL" }]);
  assert.equal(failed.updated, 1);
  const rows = await sql`SELECT detail_error FROM pricing_offer WHERE sku = ${`push-${T}-1`}`;
  assert.equal(rows[0]!.detail_error, "LOGIN_WALL");
});

test("同一个型号线索的几行提成配对建议，归到一起后消失", async () => {
  await createItem({ slug: `${SLUG}-pair`, name: "配对测试型号" });
  await createOffer({ itemSlug: `${SLUG}-pair`, platform: "jd", sku: `pair-a-${T}`, url: `https://item.jd.com/${T}a.html` });
  await createOffer({ itemSlug: `${SLUG}-pair`, platform: "jd", sku: `pair-b-${T}`, url: `https://item.jd.com/${T}b.html` });
  await sql`UPDATE pricing_offer SET model_hint = '云汐2PRO', brand_entity_id = 'senssun', active = true
            WHERE sku IN (${`pair-a-${T}`}, ${`pair-b-${T}`})`;
  // 把 b 从型号上摘下来，模拟"同一款的两个链接没归到一起"。
  await sql`UPDATE pricing_offer SET item_id = NULL WHERE sku = ${`pair-b-${T}`}`;

  let groups = await pairingSuggestions();
  const group = groups.find((g) => g.hint === "云汐2PRO");
  assert.ok(group, "同品牌同型号线索的两行要提出来");
  assert.equal(group.offers.length, 2);

  const b = group.offers.find((o) => o.sku === `pair-b-${T}`)!;
  await assignOffer(b.id, `${SLUG}-pair`);
  groups = await pairingSuggestions();
  assert.ok(!groups.some((g) => g.hint === "云汐2PRO"), "都归到同一个型号后不再提示");
});
