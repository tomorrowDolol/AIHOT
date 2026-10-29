// 一个对象的价格详情：每个 SKU 一条曲线，加上现在的价格和窗口内的高低点。
import { Link, useLoaderData } from "react-router";
import { apiGet, cachedPage } from "@aihot/web/lib/api.server";
import { pageMeta } from "@aihot/web/lib/seo";
import { ReadingLayout } from "@aihot/web/components/ui/Page";
import type { Screen } from "@aihot/web/components/shell/screens";
import type { ItemDetail, OfferSummary, PricePoint } from "../types.ts";

export const handle: Screen = { tab: "me", name: "比价" };

const money = (n: number) => `¥${n.toFixed(2).replace(/\.00$/, "")}`;
const day = (iso: string) => iso.slice(0, 10);

export async function loader({ request, params }: { request: Request; params: { slug?: string } }) {
  const detail = await apiGet<ItemDetail>(`/api/v1/pricing/${encodeURIComponent(params.slug ?? "")}`, { signal: request.signal });
  return cachedPage(300, detail);
}

export const meta = ({ data }: { data?: ItemDetail }) => pageMeta({
  title: data ? `${data.item.name} 价格` : "价格监控",
  description: data
    ? `${data.item.name} 在各个平台的价格与最近 ${data.days} 天的走势。`
    : "按平台跟踪同一型号的价格。",
  path: data ? `/pricing/${data.item.slug}` : "/pricing",
});

/** 一条曲线：横轴是时间，纵轴是实付价。只有一次读数时画一个点。 */
function Trend({ points }: { points: PricePoint[] }) {
  if (points.length === 0) return <div className="h-[120px] rounded-control border border-dashed border-line" />;
  const W = 600, H = 140, PAD = 8;
  const t = points.map((p) => new Date(p.at).getTime());
  const v = points.map((p) => p.price);
  const t0 = Math.min(...t), t1 = Math.max(...t);
  const v0 = Math.min(...v), v1 = Math.max(...v);
  const x = (ms: number) => (t1 === t0 ? W / 2 : PAD + ((ms - t0) / (t1 - t0)) * (W - PAD * 2));
  const y = (price: number) => (v1 === v0 ? H / 2 : H - PAD - ((price - v0) / (v1 - v0)) * (H - PAD * 2));
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(t[i]!).toFixed(1)},${y(p.price).toFixed(1)}`).join(" ");
  const last = points.at(-1)!;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[120px] w-full" role="img" aria-label={`价格走势：${money(v0)} 到 ${money(v1)}`}>
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} className="stroke-line" strokeWidth="1" />
        <path d={d} fill="none" className="stroke-accent" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(t.at(-1)!)} cy={y(last.price)} r="3" className="fill-accent" />
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-ink-4">
        <span>{day(points[0]!.at)}</span>
        <span>最低 {money(v0)} · 最高 {money(v1)}</span>
        <span>{day(last.at)}</span>
      </div>
    </div>
  );
}

function Offer({ offer }: { offer: OfferSummary }) {
  return (
    <li className="rounded-card border border-line p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <div className="text-[14px] font-medium text-ink-1">
            {offer.shop ?? offer.title ?? offer.sku ?? "未命名 SKU"}
          </div>
          <div className="mt-1 text-[12px] text-ink-4">
            {offer.platform}
            {offer.sku ? ` · ${offer.sku}` : ""}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[15px] font-medium text-ink-1">{offer.latest ? money(offer.latest.price) : "还没有读数"}</div>
          <div className="mt-0.5 text-[12px] text-ink-4">
            {offer.latest
              ? offer.latest.promoPrice !== null
                ? `到手价 · 标价 ${money(offer.latest.listPrice ?? offer.latest.price)}`
                : `现价 · ${day(offer.latest.at)}`
              : ""}
          </div>
        </div>
      </div>
      <div className="mt-3"><Trend points={offer.points} /></div>
      <a href={offer.url} target="_blank" rel="noreferrer noopener" className="mt-2 inline-block text-[12.5px] text-accent hover:underline">
        查看商品页
      </a>
    </li>
  );
}

export default function PricingDetailPage() {
  const { item, offers, days } = useLoaderData<typeof loader>();
  return (
    <ReadingLayout>
      <header className="mb-6">
        <Link to="/pricing" className="text-[13px] text-ink-4 hover:text-ink-2">← 价格监控</Link>
        <h1 className="mt-2 text-[26px] font-semibold text-ink-1">{item.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-3">
          {item.brand && <span>{item.brand}</span>}
          {item.productLine && <span>{item.productLine}</span>}
          {item.spec && <span>{item.spec}</span>}
          <span className="text-ink-4">最近 {days} 天</span>
        </div>
        {item.note && <p className="mt-2 max-w-[52em] text-[13px] leading-[1.8] text-ink-3">{item.note}</p>}
      </header>
      {offers.length === 0 ? (
        <p className="rounded-card border border-line bg-surface p-6 text-[13.5px] text-ink-3">还没有 SKU。</p>
      ) : (
        <ul className="space-y-4">
          {offers.map((offer) => <Offer key={offer.id} offer={offer} />)}
        </ul>
      )}
    </ReadingLayout>
  );
}
