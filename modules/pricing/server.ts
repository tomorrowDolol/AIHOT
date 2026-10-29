// 比价模块的后端：公开 JSON、后台录入、采价程序推送、站点地图。
// 价格只从 write.ts 进来，公开出口只从 read.ts 出去。
import type { FastifyInstance } from "fastify";
import { defineServerModule } from "@aihot/backend/modules";
import { adminHandler } from "@aihot/api/routes/admin-auth";
import { authorized } from "@aihot/api/routes/ingest";
import { sendJsonWithEtag, sendProblem } from "@aihot/api/http/respond";
import { publicHandler } from "@aihot/api/routes/v1";
import { brandLabel, brandOffers, brandSummaries, DEFAULT_DAYS, detailQueue, itemBySlug, knownBrand, listForAdmin, listItems, pairingSuggestions } from "./read.ts";
import { AssignInput, assignOffer, createItem, createOffer, DetailBatch, importSnapshots, ImportInput, ingestDetails, ingestListings, ItemInput, ListingBatch, OfferInput, parseSnapshotLines } from "./write.ts";
import { PLATFORMS } from "./types.ts";

const CACHE = "public, max-age=300, s-maxage=300, must-revalidate";

function routes(app: FastifyInstance) {
  // 采价程序（sku-watch 等）推送在售 SKU 与价格。用和 /api/ingest/items 同一个 INGEST_TOKEN：
  // 都是"外部脚本往站里推东西"，不再多一个密钥要发。
  app.post("/api/pricing/ingest", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!authorized(req)) return sendProblem(req, reply, { status: 401, code: "unauthorized", detail: "需要 INGEST_TOKEN。" });
    const parsed = ListingBatch.safeParse(req.body);
    if (!parsed.success) {
      return sendProblem(req, reply, { status: 400, code: "invalid_request", detail: parsed.error.issues.map((i) => `${i.path.join(".") || "请求"}: ${i.message}`).join("; ").slice(0, 300) });
    }
    return ingestListings(parsed.data.rows);
  });

  // 详情只对"已经归到型号"的 SKU 读：京东详情一次要一分钟上下，全量读既慢又招风控。
  // 站点决定读哪些，采价程序只负责执行，两边都不用知道对方的品牌清单。
  app.get("/api/pricing/detail-queue", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!authorized(req)) return sendProblem(req, reply, { status: 401, code: "unauthorized", detail: "需要 INGEST_TOKEN。" });
    const limit = Math.min(50, Math.max(1, Number((req.query as { limit?: string }).limit ?? 20) || 20));
    return { rows: await detailQueue(limit) };
  });

  app.post("/api/pricing/ingest/details", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!authorized(req)) return sendProblem(req, reply, { status: 401, code: "unauthorized", detail: "需要 INGEST_TOKEN。" });
    const parsed = DetailBatch.safeParse(req.body);
    if (!parsed.success) {
      return sendProblem(req, reply, { status: 400, code: "invalid_request", detail: parsed.error.issues.map((i) => `${i.path.join(".") || "请求"}: ${i.message}`).join("; ").slice(0, 300) });
    }
    return ingestDetails(parsed.data.rows);
  });

  app.get("/api/v1/pricing", publicHandler(async (req, reply) => {
    const [items, brands] = await Promise.all([listItems(), brandSummaries()]);
    return sendJsonWithEtag(req, reply, { platforms: PLATFORMS, items, brands }, { etagPrefix: "pricing-index", cacheControl: CACHE });
  }));

  app.get("/api/v1/pricing/brands/:brand", publicHandler(async (req, reply) => {
    const { brand } = req.params as { brand: string };
    if (!knownBrand(brand)) return sendProblem(req, reply, { status: 404, code: "not_found", detail: "没有这个品牌。" });
    const offers = await brandOffers(brand);
    if (offers.length === 0) return sendProblem(req, reply, { status: 404, code: "not_found", detail: "这个品牌还没有在售记录。" });
    return sendJsonWithEtag(req, reply, { brand, label: brandLabel(brand), platforms: PLATFORMS, offers }, { etagPrefix: `pricing-brand-${brand}`, cacheControl: CACHE });
  }));

  app.get("/api/v1/pricing/:slug", publicHandler(async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const detail = await itemBySlug(slug, DEFAULT_DAYS);
    if (!detail) return sendProblem(req, reply, { status: 404, code: "not_found", detail: "没有这个监控对象。" });
    return sendJsonWithEtag(req, reply, detail, { etagPrefix: `pricing-${slug}`, cacheControl: CACHE });
  }));

  // 后台：读表单、建对象、加 SKU、导价格。走 /api/admin/* 的会话与 CSRF 校验。
  app.get("/api/admin/pricing", adminHandler(async () => ({ ...(await listForAdmin()), pairings: await pairingSuggestions() })));

  app.post("/api/admin/pricing/offers/:id/assign", adminHandler(async (req) => {
    const { id } = req.params as { id: string };
    const offerId = Number(id);
    if (!Number.isInteger(offerId) || offerId <= 0) throw Object.assign(new Error("id 不对"), { statusCode: 400 });
    return assignOffer(offerId, AssignInput.parse(req.body).itemSlug);
  }));

  app.post("/api/admin/pricing/items", adminHandler(async (req, reply) => {
    const item = await createItem(ItemInput.parse(req.body));
    return reply.code(201).send(item);
  }));

  app.post("/api/admin/pricing/offers", adminHandler(async (req, reply) => {
    const offer = await createOffer(OfferInput.parse(req.body));
    return reply.code(201).send(offer);
  }));

  app.post("/api/admin/pricing/snapshots", adminHandler(async (req) => importSnapshots(ImportInput.parse(req.body).rows)));

  // 粘贴的价格表先解析，把读不通的行原样退回去，让人改完再写；不入库。
  app.post("/api/admin/pricing/parse", adminHandler(async (req) => {
    const { text } = (req.body ?? {}) as { text?: unknown };
    if (typeof text !== "string") return { rows: [], errors: ["没有收到文本"] };
    return parseSnapshotLines(text);
  }));
}

export default defineServerModule({
  name: "pricing",
  http: routes,
  sitemap: {
    entries: async () => {
      const [items, brands] = await Promise.all([listItems(), brandSummaries()]);
      const latest = (dates: Array<string | null>) => dates.reduce<Date | null>((a, d) => (d && (!a || new Date(d) > a) ? new Date(d) : a), null);
      return [
        { loc: "/pricing", lastmod: latest([...items.map((i) => i.latestAt), ...brands.map((b) => b.latestAt)]) },
        ...items.map((i) => ({ loc: `/pricing/${i.slug}`, lastmod: i.latestAt ? new Date(i.latestAt) : null })),
        ...brands.map((b) => ({ loc: `/pricing/brand/${b.brand}`, lastmod: b.latestAt ? new Date(b.latestAt) : null })),
      ];
    },
  },
});
