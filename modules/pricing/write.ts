// 写库：后台建对象、加 SKU、导价格，以及采价程序推来的在售清单，都走这里。
// 价格怎么写进来只有这一处：重导同一时刻只覆盖那一行，不会凭空多出一次降价。
import { sql, type Db, type Sql, type Tx } from "@aihot/backend/db";
import { z } from "zod";
import { PLATFORMS } from "./types.ts";

const platform = z.enum(PLATFORMS.map((p) => p.key) as [string, ...string[]]);

export const ItemInput = z.object({
  slug: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,63}$/, "slug 只能用小写字母、数字和连字符"),
  name: z.string().trim().min(1).max(120),
  brand: z.string().trim().max(40).nullish(),
  productLine: z.string().trim().max(40).nullish(),
  spec: z.string().trim().max(200).nullish(),
  note: z.string().trim().max(500).nullish(),
});

export const OfferInput = z.object({
  itemSlug: z.string().trim().min(1),
  platform,
  shop: z.string().trim().max(80).nullish(),
  sku: z.string().trim().max(80).nullish(),
  title: z.string().trim().max(200).nullish(),
  url: z.string().trim().min(1).max(500),
});

export const SnapshotInput = z.object({
  platform,
  sku: z.string().trim().min(1).max(80),
  price: z.number().positive().max(9_999_999),
  promoPrice: z.number().positive().max(9_999_999).nullish(),
  listPrice: z.number().positive().max(9_999_999).nullish(),
  inStock: z.boolean().nullish(),
  capturedAt: z.string().trim().min(1).nullish(),
});

export const ImportInput = z.object({ rows: z.array(SnapshotInput).min(1).max(500) });

/** 采价程序推来的一行：一个 SKU 现在在卖什么价。价格可以缺（比如只发现了新 SKU）。 */
export const ListingInput = z.object({
  platform,
  sku: z.string().trim().min(1).max(80),
  brand: z.string().trim().max(40).nullish(),
  title: z.string().trim().max(300).nullish(),
  shop: z.string().trim().max(120).nullish(),
  url: z.string().trim().min(1).max(500),
  price: z.number().positive().max(9_999_999).nullish(),
  salesText: z.string().trim().max(80).nullish(),
  capturedAt: z.string().trim().min(1).nullish(),
});

export const ListingBatch = z.object({ rows: z.array(ListingInput).min(1).max(500) });

/** 详情页读到的一行：型号线索（`model_hint`）和规格。搜索页给不出型号，这一层只能靠详情。 */
export const DetailInput = z.object({
  platform,
  sku: z.string().trim().min(1).max(80),
  modelHint: z.string().trim().max(120).nullish(),
  specs: z.record(z.string(), z.string().max(200)).nullish(),
  capturedAt: z.string().trim().min(1).nullish(),
  /** 读不到时给出原因，记在 note 里，不影响下一次重试。 */
  error: z.string().trim().max(120).nullish(),
});

export const DetailBatch = z.object({ rows: z.array(DetailInput).min(1).max(100) });

export const AssignInput = z.object({ itemSlug: z.string().trim().min(1) });

export type ItemBody = z.infer<typeof ItemInput>;
export type OfferBody = z.infer<typeof OfferInput>;
export type SnapshotRow = z.infer<typeof SnapshotInput>;
export type ListingRow = z.infer<typeof ListingInput>;
export type DetailRow = z.infer<typeof DetailInput>;

export async function createItem(body: ItemBody, db: Db = sql) {
  const [row] = await db<{ slug: string }[]>`
    INSERT INTO pricing_item (slug, name, brand_entity_id, product_line, spec, note)
    VALUES (${body.slug}, ${body.name}, ${body.brand ?? null}, ${body.productLine ?? null}, ${body.spec ?? null}, ${body.note ?? null})
    ON CONFLICT (slug) DO UPDATE SET name = excluded.name, brand_entity_id = excluded.brand_entity_id,
      product_line = excluded.product_line, spec = excluded.spec, note = excluded.note
    RETURNING slug`;
  return row!;
}

/** 加一个 SKU 到一个型号下。同一个平台上同一个 sku 已经有行时更新它，不新增第二条。 */
export async function createOffer(body: OfferBody, db: Db = sql) {
  const [item] = await db<{ id: number }[]>`SELECT id FROM pricing_item WHERE slug = ${body.itemSlug}`;
  if (!item) throw Object.assign(new Error(`没有这个监控对象：${body.itemSlug}`), { statusCode: 400 });
  const [row] = await db<{ id: number }[]>`
    INSERT INTO pricing_offer (item_id, platform, shop, sku, title, url)
    VALUES (${item.id}, ${body.platform}, ${body.shop ?? null}, ${body.sku ?? null}, ${body.title ?? null}, ${body.url})
    ON CONFLICT (platform, sku) WHERE sku IS NOT NULL DO UPDATE SET
      item_id = excluded.item_id, shop = excluded.shop, title = excluded.title, url = excluded.url,
      last_seen_at = now(), active = true
    RETURNING id`;
  return row!;
}

export interface ImportResult {
  written: number;
  /** 没有对应 SKU 的行：先加 SKU 再导价格，猜一个 SKU 不动。 */
  skipped: Array<{ platform: string; sku: string; reason: string }>;
}

/** 按 (平台, SKU) 找行写入。同一时刻重复导入只覆盖那一行，所以一整个月的表可以重导。 */
export async function importSnapshots(rows: SnapshotRow[], db: Sql = sql): Promise<ImportResult> {
  if (rows.length === 0) return { written: 0, skipped: [] };
  return db.begin(async (tx) => {
    const skipped: ImportResult["skipped"] = [];
    let written = 0;
    for (const row of rows) {
      const [offer] = await tx<{ id: number }[]>`
        SELECT id FROM pricing_offer WHERE platform = ${row.platform} AND sku = ${row.sku}`;
      if (!offer) {
        skipped.push({ platform: row.platform, sku: row.sku, reason: "没有这个 SKU" });
        continue;
      }
      const at = row.capturedAt ? new Date(row.capturedAt) : new Date();
      if (Number.isNaN(at.getTime())) {
        skipped.push({ platform: row.platform, sku: row.sku, reason: "时间读不出来" });
        continue;
      }
      await writeSnapshot(tx, offer.id, { ...row, at });
      // 人工贴表也算"还在卖"：不然手工维护的型号过了 STALE_DAYS 会被当成下架。
      await tx`UPDATE pricing_offer SET last_seen_at = greatest(last_seen_at, ${at}), active = true WHERE id = ${offer.id}`;
      written += 1;
    }
    return { written, skipped };
  });
}

export interface IngestResult {
  offers: { created: number; updated: number };
  written: number;
  skipped: Array<{ platform: string; sku: string; reason: string }>;
}

/**
 * 采价程序推来的一批在售 SKU：先按 (平台, SKU) 建或更新这个上架，再记一次价格。
 * 已归到某个型号的行（item_id 有值）只更新时间、标题和价格，不动型号——人工的归类要被自动采集保住。
 */
export async function ingestListings(rows: ListingRow[], db: Sql = sql): Promise<IngestResult> {
  return db.begin(async (tx) => {
    const offers = { created: 0, updated: 0 };
    const skipped: IngestResult["skipped"] = [];
    let written = 0;
    for (const row of rows) {
      const at = row.capturedAt ? new Date(row.capturedAt) : new Date();
      if (Number.isNaN(at.getTime())) {
        skipped.push({ platform: row.platform, sku: row.sku, reason: "时间读不出来" });
        continue;
      }
      const [offer] = await tx<{ id: number; created: boolean }[]>`
        INSERT INTO pricing_offer (brand_entity_id, platform, shop, sku, title, url, first_seen_at, last_seen_at, active)
        VALUES (${row.brand ?? null}, ${row.platform}, ${row.shop ?? null}, ${row.sku}, ${row.title ?? null}, ${row.url}, ${at}, ${at}, true)
        ON CONFLICT (platform, sku) WHERE sku IS NOT NULL DO UPDATE SET
          brand_entity_id = coalesce(excluded.brand_entity_id, pricing_offer.brand_entity_id),
          shop = coalesce(excluded.shop, pricing_offer.shop),
          title = coalesce(excluded.title, pricing_offer.title),
          last_seen_at = greatest(pricing_offer.last_seen_at, excluded.last_seen_at),
          active = true
        RETURNING id, (xmax = 0) AS created`;
      if (!offer) {
        skipped.push({ platform: row.platform, sku: row.sku, reason: "写入失败" });
        continue;
      }
      if (offer.created) offers.created += 1;
      else offers.updated += 1;
      if (row.price !== null && row.price !== undefined) {
        await writeSnapshot(tx, offer.id, { price: row.price, at, note: row.salesText ?? null });
        written += 1;
      }
    }
    return { offers, written, skipped };
  });
}

export interface DetailResult {
  updated: number;
  skipped: Array<{ platform: string; sku: string; reason: string }>;
}

/**
 * 详情读回来：填 model_hint 和 specs。只更新已经存在的 SKU——详情是把已有的一行补全，
 * 不是发现新商品的地方。读失败也记时间，免得同一条一分钟的请求每轮都重试。
 */
export async function ingestDetails(rows: DetailRow[], db: Sql = sql): Promise<DetailResult> {
  return db.begin(async (tx) => {
    const skipped: DetailResult["skipped"] = [];
    let updated = 0;
    for (const row of rows) {
      const at = row.capturedAt ? new Date(row.capturedAt) : new Date();
      if (Number.isNaN(at.getTime())) {
        skipped.push({ platform: row.platform, sku: row.sku, reason: "时间读不出来" });
        continue;
      }
      const result = await tx`
        UPDATE pricing_offer SET
          model_hint = coalesce(${row.modelHint ?? null}, model_hint),
          specs = coalesce(${row.specs ? tx.json(row.specs) : null}, specs),
          detail_at = ${at},
          detail_error = ${row.error ?? null}
        WHERE platform = ${row.platform} AND sku = ${row.sku}`;
      if (result.count === 0) {
        skipped.push({ platform: row.platform, sku: row.sku, reason: "没有这个 SKU" });
        continue;
      }
      updated += 1;
    }
    return { updated, skipped };
  });
}

/** 把一行 SKU 归到某个型号（后台「配对」和「添加 SKU」共用）。 */
export async function assignOffer(offerId: number, itemSlug: string, db: Db = sql): Promise<{ itemSlug: string }> {
  const [item] = await db<{ id: number; slug: string }[]>`SELECT id, slug FROM pricing_item WHERE slug = ${itemSlug}`;
  if (!item) throw Object.assign(new Error(`没有这个监控对象：${itemSlug}`), { statusCode: 400 });
  const result = await db`UPDATE pricing_offer SET item_id = ${item.id} WHERE id = ${offerId}`;
  if (result.count === 0) throw Object.assign(new Error(`没有这个 SKU：${offerId}`), { statusCode: 404 });
  return { itemSlug: item.slug };
}

async function writeSnapshot(
  tx: Tx,
  offerId: number,
  row: { price: number; at: Date; promoPrice?: number | null; listPrice?: number | null; inStock?: boolean | null; note?: string | null },
) {
  await tx`
    INSERT INTO pricing_snapshot (offer_id, captured_at, price, promo_price, list_price, in_stock, note)
    VALUES (${offerId}, ${row.at}, ${row.price}, ${row.promoPrice ?? null}, ${row.listPrice ?? null}, ${row.inStock ?? null}, ${row.note ?? null})
    ON CONFLICT (offer_id, captured_at) DO UPDATE SET
      price = excluded.price, promo_price = excluded.promo_price,
      list_price = excluded.list_price, in_stock = excluded.in_stock, note = excluded.note`;
}

/**
 * 粘贴的价格表，一行一个 SKU：
 * `平台,SKU,标价,到手价,划线价,库存,时间`。后五项可以留空，留空就到手价为空（比价用标价）、
 * 库存未知、时间是现在。逗号和制表符都认，空行和 # 开头的行跳过。
 */
export function parseSnapshotLines(text: string): { rows: SnapshotRow[]; errors: string[] } {
  const rows: SnapshotRow[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const cells = trimmed.split(/[,\t]/).map((c) => c.trim());
    const at = (n: number) => cells[n] ?? "";
    const where = `第 ${index + 1} 行`;
    const price = Number(at(2));
    if (!at(0) || !at(1)) return errors.push(`${where}：平台和 SKU 都要填`);
    if (!Number.isFinite(price) || price <= 0) return errors.push(`${where}：标价要是一个正数`);
    const optional = (value: string) => (value === "" ? null : Number(value));
    const promo = optional(at(3));
    const list = optional(at(4));
    if (promo !== null && (!Number.isFinite(promo) || promo <= 0)) return errors.push(`${where}：到手价要留空或是正数`);
    if (list !== null && (!Number.isFinite(list) || list <= 0)) return errors.push(`${where}：划线价要留空或是正数`);
    const parsed = SnapshotInput.safeParse({
      platform: at(0), sku: at(1), price,
      promoPrice: promo, listPrice: list,
      inStock: stock(at(5)), capturedAt: at(6) || null,
    });
    if (!parsed.success) return errors.push(`${where}：${parsed.error.issues[0]?.message ?? "格式不对"}`);
    rows.push(parsed.data);
  });
  return { rows, errors };
}

function stock(value: string): boolean | null {
  if (!value) return null;
  if (/^(有货|在售|有|1|true|yes|是|y)$/i.test(value)) return true;
  if (/^(无货|售罄|下架|没货|0|false|no|否|n)$/i.test(value)) return false;
  return null;
}
