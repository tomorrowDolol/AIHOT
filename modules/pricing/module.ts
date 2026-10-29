import { defineModule } from "@aihot/contracts/modules";

/** 比价：监控的型号一页一个，自动采到的在售 SKU 按品牌一页；后台一页录数据。接口在 /api/v1/pricing 下。 */
export default defineModule({
  name: "pricing",
  pages: [
    { path: "pricing", file: "web/pricing.tsx", id: "pricing" },
    { path: "pricing/brand/:brand", file: "web/pricing-brand.tsx", id: "pricing-brand" },
    { path: "pricing/:slug", file: "web/pricing-detail.tsx", id: "pricing-detail" },
  ],
  adminPages: [{ path: "admin/pricing", file: "web/admin-pricing.tsx", id: "admin-pricing" }],
  apiPaths: [/^\/api\/v1\/pricing(?:\/|$)/, /^\/api\/pricing\/ingest$/],
});
