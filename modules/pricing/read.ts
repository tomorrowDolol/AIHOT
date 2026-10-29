// 公开出口只有一个读取层：页面、v1 接口和将来的 Agent 工具都从这里读，不各写一份 SQL。
// 「现价」一律指某个 SKU 最后一次读数里的实付价（有到手价用到手价），「区间」是各 SKU 现价的区间。
import { sql, type Db } from "@aihot/backend/db";
import { ENTITIES } from "@aihot/industry/taxonomy";
import type { BrandOffer, BrandSummary, ItemDetail, ItemSummary, OfferSummary, PairingGroup, PricePoint } from "./types.ts";

/** 曲线和高低点看的窗口：比价看近期，不看三年前的最低价。 */
export const DEFAULT_DAYS = 120;

/**
 * 多久没再搜到就算下架。采价节奏是 P0/P1 每天、P3 每 3 天，10 天等于 P3 漏了三轮；
 * 再短会把一次风控冷却误判成下架，再长会让下架商品一直挂在「在售」上。
 */
export const STALE_DAYS = 10;

const day = 86_400_000;

interface ItemRow {
  slug: string;
  name: string;
  brand: string | null;
  productLine: string | null;
  spec: string | null;
  note: string | null;
  platforms: string[];
  offerCount: number;
  lowest: number | null;
  highest: number | null;
  latestAt: string | null;
}

/** 列表：每个监控对象一条，带各地现价的区间。没有读数的对象也列出来（刚建的还没有价格）。 */
export async function listItems(db: Db = sql): Promise<ItemSummary[]> {
  const rows = await db<ItemRow[]>`
    SELECT i.slug, i.name, i.brand_entity_id AS brand, i.product_line AS "productLine", i.spec, i.note,
           COALESCE(array_agg(DISTINCT o.platform) FILTER (WHERE o.platform IS NOT NULL), '{}') AS platforms,
           count(DISTINCT o.id)::int AS "offerCount",
           min(l.price) AS lowest, max(l.price) AS highest, max(l.at) AS "latestAt"
    FROM pricing_item i
    LEFT JOIN pricing_offer o ON o.item_id = i.id
    LEFT JOIN LATERAL (
      SELECT s.captured_at AS at, COALESCE(s.promo_price, s.price)::float8 AS price
      FROM pricing_snapshot s WHERE s.offer_id = o.id
      ORDER BY s.captured_at DESC LIMIT 1
    ) l ON true
    GROUP BY i.id
    ORDER BY i.name`;
  return rows.map((r) => ({
    slug: r.slug, name: r.name, brand: r.brand, productLine: r.productLine, spec: r.spec, note: r.note,
    platforms: r.platforms ?? [], offerCount: r.offerCount, lowest: r.lowest, highest: r.highest, latestAt: r.latestAt,
  }));
}

/** 详情：一个对象的所有 SKU，每个带最近一次读数和窗口内的价格点。 */
export async function itemBySlug(slug: string, days = DEFAULT_DAYS, db: Db = sql): Promise<ItemDetail | null> {
  const [item] = await db<{ id: number; slug: string; name: string; brand: string | null; productLine: string | null; spec: string | null; note: string | null }[]>`
    SELECT id, slug, name, brand_entity_id AS brand, product_line AS "productLine", spec, note
    FROM pricing_item WHERE slug = ${slug}`;
  if (!item) return null;

  const offers = await db<OfferSummary[]>`
    SELECT o.id, o.platform, o.shop, o.sku, o.title, o.url,
           latest.at AS "latestAt", latest.price AS "latestPrice", latest.list_price AS "latestList", latest.promo_price AS "latestPromo",
           w.min AS min, w.max AS max
    FROM pricing_offer o
    LEFT JOIN LATERAL (
      SELECT s.captured_at AS at, COALESCE(s.promo_price, s.price)::float8 AS price,
             s.list_price::float8 AS list_price, s.promo_price::float8 AS promo_price
      FROM pricing_snapshot s WHERE s.offer_id = o.id
      ORDER BY s.captured_at DESC LIMIT 1
    ) latest ON true
    LEFT JOIN LATERAL (
      SELECT min(COALESCE(s.promo_price, s.price))::float8 AS min, max(COALESCE(s.promo_price, s.price))::float8 AS max
      FROM pricing_snapshot s
      WHERE s.offer_id = o.id AND s.captured_at >= now() - make_interval(days => ${days})
    ) w ON true
    WHERE o.item_id = ${item.id}
    ORDER BY o.platform, o.shop NULLS LAST, o.id`;

  const points = await db<{ offerId: number; at: string; price: number; listPrice: number | null; promoPrice: number | null }[]>`
    SELECT s.offer_id AS "offerId", s.captured_at AS at,
           COALESCE(s.promo_price, s.price)::float8 AS price,
           s.list_price::float8 AS "listPrice", s.promo_price::float8 AS "promoPrice"
    FROM pricing_snapshot s
    JOIN pricing_offer o ON o.id = s.offer_id
    WHERE o.item_id = ${item.id} AND s.captured_at >= now() - make_interval(days => ${days})
    ORDER BY s.captured_at`;

  const byOffer = new Map<number, PricePoint[]>();
  for (const p of points) {
    const list = byOffer.get(p.offerId) ?? [];
    list.push({ at: p.at, price: p.price, listPrice: p.listPrice, promoPrice: p.promoPrice });
    byOffer.set(p.offerId, list);
  }

  return {
    item: { slug: item.slug, name: item.name, brand: item.brand, productLine: item.productLine, spec: item.spec, note: item.note },
    days,
    offers: offers.map((o) => {
      const raw = o as OfferSummary & { latestAt: string | null; latestPrice: number | null; latestList: number | null; latestPromo: number | null };
      return {
        id: raw.id, platform: raw.platform, shop: raw.shop, sku: raw.sku, title: raw.title, url: raw.url,
        latest: raw.latestAt === null ? null : { at: raw.latestAt, price: raw.latestPrice!, listPrice: raw.latestList, promoPrice: raw.latestPromo },
        min: raw.min, max: raw.max,
        points: byOffer.get(raw.id) ?? [],
      };
    }),
  };
}

/** 后台用：每个对象和它的 SKU（不读曲线，够填表就行）。 */
export async function listForAdmin(db: Db = sql) {
  const items = await listItems(db);
  const offers = await db<{ itemSlug: string; id: number; platform: string; shop: string | null; sku: string | null; url: string }[]>`
    SELECT i.slug AS "itemSlug", o.id, o.platform, o.shop, o.sku, o.url
    FROM pricing_offer o JOIN pricing_item i ON i.id = o.item_id
    ORDER BY i.slug, o.id`;
  const unassigned = await db<{ brand: string; offers: number }[]>`
    SELECT brand_entity_id AS brand, count(*)::int AS offers
    FROM pricing_offer WHERE item_id IS NULL AND brand_entity_id IS NOT NULL
    GROUP BY 1 ORDER BY offers DESC`;
  return { items, offers, unassigned };
}

/** 时间窗之外还没读数的对象也要能列出，所以列表不按最新读数过滤；这里给页面一个「多久没更新」。 */
export function staleDays(latestAt: string | null, now = Date.now()): number | null {
  if (!latestAt) return null;
  return Math.floor((now - new Date(latestAt).getTime()) / day);
}

// ── 品牌这一层：自动采到的在售 SKU ──────────────────────────────────────────────────────
// 型号是我们挑出来比的少数几个，品牌这一层是采价程序发现的所有 SKU。两者共用 pricing_offer：
// 归到型号只是 item_id 有值，价格历史还是一份，所以「型号」和「品牌价格带」永远对得上。

export const brandLabel = (brand: string) => ENTITIES[brand]?.name ?? brand;

/**
 * 每个品牌在售多少 SKU、价格带多宽、多少家店、最近一次采到是什么时候。
 * 「在售」不靠采集端标记：超过 STALE_DAYS 没再搜到就是这个商品下了或链接换了，算下架（`gone`）。
 * 人工停用（`active = false`）也走同一条路径。
 */
export async function brandSummaries(db: Db = sql): Promise<BrandSummary[]> {
  const rows = await db<(Omit<BrandSummary, "label"> & { live: boolean })[]>`
    SELECT o.brand_entity_id AS brand,
           count(*) FILTER (WHERE o.live)::int AS offers,
           count(*) FILTER (WHERE NOT o.live)::int AS gone,
           count(DISTINCT o.shop) FILTER (WHERE o.live)::int AS shops,
           array_agg(DISTINCT o.platform) FILTER (WHERE o.live) AS platforms,
           min(l.price) FILTER (WHERE o.live) AS lowest, max(l.price) FILTER (WHERE o.live) AS highest,
           max(l.at) AS "latestAt",
           count(*) FILTER (WHERE o.live AND o.first_seen_at >= now() - interval '7 days')::int AS fresh
    FROM (
      SELECT o.*, (o.active AND o.last_seen_at >= now() - make_interval(days => ${STALE_DAYS})) AS live
      FROM pricing_offer o
    ) o
    LEFT JOIN LATERAL (
      SELECT s.captured_at AS at, COALESCE(s.promo_price, s.price)::float8 AS price
      FROM pricing_snapshot s WHERE s.offer_id = o.id
      ORDER BY s.captured_at DESC LIMIT 1
    ) l ON true
    WHERE o.brand_entity_id IS NOT NULL AND (o.live OR o.last_seen_at >= now() - interval '60 days')
    GROUP BY 1
    ORDER BY offers DESC, brand`;
  return rows.map(({ live: _live, ...r }) => ({ ...r, label: brandLabel(r.brand) }));
}

/** 一个品牌下的在售 SKU，按现价从低到高。没有价格的行排最后。 */
export async function brandOffers(brand: string, limit = 200, db: Db = sql): Promise<BrandOffer[]> {
  const rows = await db<(Omit<BrandOffer, "itemSlug"> & { itemSlug: string | null })[]>`
    SELECT o.id, o.platform, o.sku, o.title, o.shop, o.url,
           (o.active AND o.last_seen_at >= now() - make_interval(days => ${STALE_DAYS})) AS active,
           o.first_seen_at AS "firstSeenAt", o.last_seen_at AS "lastSeenAt", i.slug AS "itemSlug",
           o.model_hint AS "modelHint", o.detail_error AS "detailError",
           l.price, l.at
    FROM pricing_offer o
    LEFT JOIN pricing_item i ON i.id = o.item_id
    LEFT JOIN LATERAL (
      SELECT s.captured_at AS at, COALESCE(s.promo_price, s.price)::float8 AS price
      FROM pricing_snapshot s WHERE s.offer_id = o.id
      ORDER BY s.captured_at DESC LIMIT 1
    ) l ON true
    WHERE o.brand_entity_id = ${brand}
    ORDER BY (o.active AND o.last_seen_at >= now() - make_interval(days => ${STALE_DAYS})) DESC,
             l.price NULLS LAST, o.id
    LIMIT ${limit}`;
  return rows;
}

/** 品牌 id 是否是词表里的一个公司（`/pricing/brand/:brand` 只认这些）。 */
export function knownBrand(brand: string): boolean {
  return brand in ENTITIES;
}

// ── 详情：型号线索 ────────────────────────────────────────────────────────────────────

/** 该读详情的 SKU：已经归到型号的（人工挑的少数几个），以及 30 天没再读过的。 */
export async function detailQueue(limit = 20, db: Db = sql): Promise<Array<{ platform: string; sku: string; url: string; brand: string | null }>> {
  return db`
    SELECT platform, sku, url, brand_entity_id AS brand
    FROM pricing_offer
    WHERE item_id IS NOT NULL AND sku IS NOT NULL
      AND (detail_at IS NULL OR detail_at < now() - interval '30 days')
    ORDER BY detail_at NULLS FIRST, id
    LIMIT ${limit}`;
}

/**
 * 配对建议：同一个品牌、同一个型号线索，却分成几行（或者还有行没归到型号）。
 * 京东同一款的多个链接是最常见的情况；跨平台的两个链接标题对不上，只能靠型号线索或人工。
 */
export async function pairingSuggestions(limit = 30, db: Db = sql): Promise<PairingGroup[]> {
  const groups = await db<{ brand: string; hint: string }[]>`
    SELECT brand_entity_id AS brand, model_hint AS hint
    FROM pricing_offer
    WHERE brand_entity_id IS NOT NULL AND model_hint IS NOT NULL AND active
    GROUP BY 1, 2
    HAVING count(*) > 1 AND count(DISTINCT coalesce(item_id::text, 'none')) > 1
    ORDER BY count(*) DESC
    LIMIT ${limit}`;
  if (groups.length === 0) return [];

  const hints = groups.map((g) => g.hint);
  const rows = await db<(PairingGroup["offers"][number] & { brand: string; hint: string })[]>`
    SELECT o.brand_entity_id AS brand, o.model_hint AS hint,
           o.id, o.platform, o.sku, o.shop, o.title, o.url, i.slug AS "itemSlug",
           l.price
    FROM pricing_offer o
    LEFT JOIN pricing_item i ON i.id = o.item_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(s.promo_price, s.price)::float8 AS price
      FROM pricing_snapshot s WHERE s.offer_id = o.id
      ORDER BY s.captured_at DESC LIMIT 1
    ) l ON true
    WHERE o.model_hint = ANY(${hints}) AND o.active
    ORDER BY o.id`;

  return groups.map((g) => {
    const offers = rows.filter((r) => r.brand === g.brand && r.hint === g.hint);
    return {
      brand: g.brand,
      label: brandLabel(g.brand),
      hint: g.hint,
      platforms: [...new Set(offers.map((o) => o.platform))],
      offers: offers.map(({ brand: _brand, hint: _hint, ...o }) => o),
    };
  });
}
