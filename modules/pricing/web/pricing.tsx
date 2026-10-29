// 比价首页：上面是我们盯着的型号，下面是采价程序发现的所有在售 SKU，按品牌。
import { Link, useLoaderData } from "react-router";
import { SITE } from "@aihot/site";
import { apiGet, cachedPage } from "@aihot/web/lib/api.server";
import { pageMeta } from "@aihot/web/lib/seo";
import { ReadingLayout } from "@aihot/web/components/ui/Page";
import type { Screen } from "@aihot/web/components/shell/screens";
import type { BrandSummary, ItemSummary } from "../types.ts";

interface Index { items: ItemSummary[]; brands: BrandSummary[] }

export const handle: Screen = { tab: "me", name: "价格监控" };

export const meta = () => pageMeta({
  title: "价格监控",
  description: `${SITE.name}按平台跟踪同一型号的价格：现在多少、最近高低点在哪、哪个平台最便宜。`,
  path: "/pricing",
});

export async function loader({ request }: { request: Request }) {
  return cachedPage(300, await apiGet<Index>("/api/v1/pricing", { signal: request.signal }));
}

const money = (n: number) => `¥${n.toFixed(2).replace(/\.00$/, "")}`;
const day = (iso: string) => iso.slice(0, 10);

export default function PricingPage() {
  const { items, brands } = useLoaderData<typeof loader>();
  return (
    <ReadingLayout>
      <header className="mb-6">
        <h1 className="text-[26px] font-semibold text-ink-1">价格监控</h1>
        <p className="mt-2 max-w-[52em] text-[13.5px] leading-[1.8] text-ink-3">
          同一型号在淘宝、京东等平台的现价。价格是各 SKU 最近一次读数里的到手价（没有到手价时用标价），点进去看曲线和历史高低点。
        </p>
      </header>

      <h2 className="mb-3 text-[15px] font-medium text-ink-1">盯着的型号</h2>
      {items.length === 0 ? (
        <p className="rounded-card border border-line bg-surface p-6 text-[13.5px] text-ink-3">
          还没有在监控的型号。后台「比价 → 价格监控」里添加。
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-card border border-line">
          {items.map((item) => (
            <li key={item.slug}>
              <Link to={`/pricing/${item.slug}`} className="block p-4 transition-colors hover:bg-surface">
                <div className="flex items-baseline justify-between gap-4">
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-medium text-ink-1">{item.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-4">
                      {item.brand && <span>{item.brand}</span>}
                      {item.productLine && <span>{item.productLine}</span>}
                      {item.spec && <span className="truncate">{item.spec}</span>}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {item.lowest === null ? (
                      <div className="text-[13px] text-ink-4">还没有价格</div>
                    ) : (
                      <div className="text-[15px] font-medium text-ink-1">
                        {item.lowest === item.highest ? money(item.lowest) : `${money(item.lowest)} – ${money(item.highest!)}`}
                      </div>
                    )}
                    <div className="mt-1 text-[12px] text-ink-4">
                      {item.offerCount} 个 SKU{item.latestAt ? ` · 最近 ${day(item.latestAt)}` : ""}
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mb-1 mt-10 text-[15px] font-medium text-ink-1">各品牌在售</h2>
      <p className="mb-3 max-w-[52em] text-[12.5px] leading-[1.7] text-ink-4">
        每天从淘宝、京东搜索页采到的在售 SKU，按品牌归在一起。价格带是最低到最高的现价，新的是最近 7 天第一次见到的 SKU
        （10 天没再搜到的算下架，仍留在品牌页里备查）。
      </p>
      {brands.length === 0 ? (
        <p className="rounded-card border border-line bg-surface p-6 text-[13.5px] text-ink-3">还没有采到在售数据。</p>
      ) : (
        <ul className="divide-y divide-line rounded-card border border-line">
          {brands.map((b) => (
            <li key={b.brand}>
              <Link to={`/pricing/brand/${b.brand}`} className="flex items-baseline justify-between gap-4 p-4 transition-colors hover:bg-surface">
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-medium text-ink-1">{b.label}</div>
                  <div className="mt-1 text-[12.5px] text-ink-4">
                    {b.offers} 个在售 SKU
                    {b.gone > 0 && `（另有 ${b.gone} 个已下架）`}
                    {" · "}{b.shops} 家店 · {b.platforms.join("/")}
                    {b.fresh > 0 && <span className="ml-2 text-accent">新 {b.fresh}</span>}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[14px] text-ink-1">
                    {b.lowest === null ? "—" : b.lowest === b.highest ? money(b.lowest) : `${money(b.lowest)} – ${money(b.highest!)}`}
                  </div>
                  <div className="mt-1 text-[12px] text-ink-4">{b.latestAt ? day(b.latestAt) : ""}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ReadingLayout>
  );
}
