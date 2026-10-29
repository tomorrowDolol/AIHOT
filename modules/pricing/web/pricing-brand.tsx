// 一个品牌的在售 SKU：采价程序搜到的全部在架商品，按现价从低到高。
import { Link, useLoaderData } from "react-router";
import { apiGet, cachedPage } from "@aihot/web/lib/api.server";
import { pageMeta } from "@aihot/web/lib/seo";
import { ReadingLayout } from "@aihot/web/components/ui/Page";
import type { Screen } from "@aihot/web/components/shell/screens";
import { platformLabel, type BrandOffer } from "../types.ts";

interface BrandPage { brand: string; label: string; offers: BrandOffer[] }

export const handle: Screen = { tab: "me", name: "品牌价格" };

export async function loader({ request, params }: { request: Request; params: { brand?: string } }) {
  const brand = params.brand ?? "";
  return cachedPage(300, await apiGet<BrandPage>(`/api/v1/pricing/brands/${encodeURIComponent(brand)}`, { signal: request.signal }));
}

export const meta = ({ data }: { data?: BrandPage }) => pageMeta({
  title: data ? `${data.label} 在售价格` : "品牌价格",
  description: data ? `${data.label} 在淘宝、京东的在售 SKU、价格带和店铺。` : "品牌在售价格",
  path: `/pricing/brand/${data?.brand ?? ""}`,
});

const money = (n: number) => `¥${n.toFixed(2).replace(/\.00$/, "")}`;
const day = (iso: string) => iso.slice(0, 10);

export default function PricingBrandPage() {
  const { label, offers } = useLoaderData<typeof loader>();
  const live = offers.filter((o) => o.active);
  const prices = live.map((o) => o.price).filter((p): p is number => p !== null);
  const low = prices.length ? Math.min(...prices) : null;
  const high = prices.length ? Math.max(...prices) : null;
  return (
    <ReadingLayout>
      <header className="mb-6">
        <Link to="/pricing" className="text-[13px] text-ink-4 hover:text-ink-2">← 价格监控</Link>
        <h1 className="mt-2 text-[26px] font-semibold text-ink-1">{label}</h1>
        <p className="mt-2 text-[13px] text-ink-3">
          {live.length} 个在售 SKU
          {offers.length > live.length && ` · ${offers.length - live.length} 个已下架`}
          {low !== null && high !== null && ` · 价格带 ${money(low)} – ${money(high)}`}
        </p>
      </header>

      <div className="overflow-x-auto rounded-card border border-line">
        <table className="w-full min-w-[640px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[12px] text-ink-4">
              <th className="px-3 py-2 font-normal">商品</th>
              <th className="px-3 py-2 font-normal">平台 / 店铺</th>
              <th className="px-3 py-2 text-right font-normal">现价</th>
              <th className="px-3 py-2 text-right font-normal">最近</th>
            </tr>
          </thead>
          <tbody>
            {offers.map((o) => (
              <tr key={o.id} className={`border-b border-line last:border-0 ${o.active ? "" : "opacity-50"}`}>
                <td className="px-3 py-2">
                  <a href={o.url} target="_blank" rel="noreferrer noopener" className="line-clamp-2 text-ink-1 hover:underline">
                    {o.title ?? o.sku ?? "未命名 SKU"}
                  </a>
                  <div className="mt-0.5 text-[11.5px] text-ink-4">
                    {o.modelHint && <span className="mr-2 text-ink-3">{o.modelHint}</span>}
                    {o.sku}
                    {o.itemSlug && <Link to={`/pricing/${o.itemSlug}`} className="ml-2 text-accent hover:underline">已归到型号</Link>}
                  </div>
                </td>
                <td className="px-3 py-2 text-[12.5px] text-ink-3">
                  {platformLabel(o.platform)}
                  {o.shop && <div className="mt-0.5 text-[11.5px] text-ink-4">{o.shop}</div>}
                </td>
                <td className="px-3 py-2 text-right text-ink-1">{o.price === null ? "—" : money(o.price)}</td>
                <td className="px-3 py-2 text-right text-[12px] text-ink-4">
                  {o.at ? day(o.at) : ""}
                  {!o.active && <div className="text-[11px] text-ink-4">最后见到 {day(o.lastSeenAt)}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {offers.length === 0 && <p className="mt-4 text-[13px] text-ink-3">没有在售记录。</p>}
    </ReadingLayout>
  );
}
