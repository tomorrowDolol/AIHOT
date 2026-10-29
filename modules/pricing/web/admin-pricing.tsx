// 后台：建监控对象、加 SKU、粘贴价格表。价格表先解析再写，读不通的行原样退回来改。
import { useState } from "react";
import { useLoaderData } from "react-router";
import { adminGet } from "@aihot/web/lib/admin.server";
import { useAdminAction } from "@aihot/web/features/admin/action";
import { AdminPage, Button, Card, Field, Input, Select, Textarea } from "@aihot/web/features/admin/ui";
import { PLATFORMS, platformLabel, type ItemSummary, type PairingGroup } from "../types.ts";

interface AdminData {
  items: ItemSummary[];
  offers: Array<{ itemSlug: string; id: number; platform: string; shop: string | null; sku: string | null; url: string }>;
  unassigned: Array<{ brand: string; offers: number }>;
  pairings: PairingGroup[];
}

export async function loader({ request }: { request: Request }) {
  return adminGet<AdminData>(request, "/api/admin/pricing");
}

export const meta = () => [{ title: "价格监控 · 后台" }];

const EXAMPLE = `jd,100012043978,499,,599,有货,2026-10-01T10:00:00+08:00
taobao,678901234567,469,429,,有货,`;

export default function AdminPricing() {
  const { items, offers, unassigned, pairings } = useLoaderData() as AdminData;
  const { run, pending, busy } = useAdminAction();
  const [text, setText] = useState("");
  const [problems, setProblems] = useState<string[]>([]);

  async function importRows() {
    const parsed = await run<{ rows: unknown[]; errors: string[] }>("POST", "/api/admin/pricing/parse", { text }, { label: "parse", revalidate: false });
    if (!parsed) return;
    if (parsed.errors.length) return setProblems(parsed.errors);
    setProblems([]);
    const res = await run<{ written: number; skipped: Array<{ reason: string; sku: string }> }>(
      "POST", "/api/admin/pricing/snapshots", { rows: parsed.rows }, { label: "import", success: "价格已写入" },
    );
    if (res?.skipped.length) setProblems(res.skipped.map((s) => `${s.sku}：${s.reason}`));
    else if (res) setText("");
  }

  return (
    <AdminPage
      title="价格监控"
      subtitle="一个对象对应一个在卖的型号，同一个型号在每个平台各是一个 SKU。价格按 (平台, SKU) 写入，同一时刻重复导入只会覆盖那一行。采价程序推来的 SKU 先挂在品牌下，归到型号是加一行「添加 SKU」时填同一个 SKU 号。"
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="监控对象">
          {items.length === 0 ? (
            <p className="text-[13px] text-ink-3">还没有对象，先在下面新建。</p>
          ) : (
            <ul className="divide-y divide-line">
              {items.map((item) => (
                <li key={item.slug} className="flex items-baseline justify-between gap-3 py-2 text-[13px]">
                  <a href={`/pricing/${item.slug}`} className="min-w-0 truncate text-ink-1 hover:underline">{item.name}</a>
                  <span className="shrink-0 text-[12px] text-ink-4">
                    {item.slug} · {item.offerCount} SKU
                    {item.lowest !== null ? ` · ¥${item.lowest}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <form
            className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const body = Object.fromEntries([...f.entries()].map(([k, v]) => [k, String(v).trim() || null]));
              if (await run("POST", "/api/admin/pricing/items", body, { success: "已保存" })) (e.target as HTMLFormElement).reset();
            }}
          >
            <Field label="slug"><Input name="slug" required placeholder="scale-s3" /></Field>
            <Field label="名称"><Input name="name" required placeholder="香山 S3 体脂秤" /></Field>
            <Field label="品牌"><Input name="brand" placeholder="senssun" /></Field>
            <Field label="产品线"><Input name="productLine" placeholder="体脂秤" /></Field>
            <Field label="规格"><Input name="spec" placeholder="180kg/50g，300×300mm" /></Field>
            <Field label="备注"><Input name="note" placeholder="为什么盯这个型号" /></Field>
            <div className="sm:col-span-2"><Button type="submit" tone="primary" busy={pending === "POST /api/admin/pricing/items"}>保存对象</Button></div>
          </form>
        </Card>

        <Card title="添加 SKU">
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const body = Object.fromEntries([...f.entries()].map(([k, v]) => [k, String(v).trim() || null]));
              if (await run("POST", "/api/admin/pricing/offers", body, { success: "已加 SKU" })) (e.target as HTMLFormElement).reset();
            }}
          >
            <Field label="监控对象">
              <Select name="itemSlug" required>
                {items.map((i) => <option key={i.slug} value={i.slug}>{i.name}</option>)}
              </Select>
            </Field>
            <Field label="平台">
              <Select name="platform" defaultValue="jd">
                {PLATFORMS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </Select>
            </Field>
            <Field label="店铺"><Input name="shop" placeholder="香山旗舰店" /></Field>
            <Field label="SKU" hint="平台自己的商品编号，导入价格时按它找行"><Input name="sku" placeholder="100012043978" /></Field>
            <Field label="标题"><Input name="title" placeholder="商品页上的标题" /></Field>
            <Field label="链接"><Input name="url" type="url" required placeholder="https://item.jd.com/….html" /></Field>
            <div className="sm:col-span-2"><Button type="submit" tone="primary" busy={pending === "POST /api/admin/pricing/offers"}>添加 SKU</Button></div>
          </form>
          {offers.length > 0 && (
            <ul className="mt-4 space-y-1 border-t border-line pt-3 text-[12px] text-ink-4">
              {offers.slice(0, 8).map((o) => (
                <li key={o.id} className="truncate">{o.itemSlug} · {platformLabel(o.platform)} · {o.sku ?? "无 SKU"}</li>
              ))}
            </ul>
          )}
        </Card>

        {pairings.length > 0 && (
          <Card title="配对建议" className="lg:col-span-2">
            <p className="mb-3 text-[12.5px] leading-relaxed text-ink-3">
              同一个品牌、详情页给同一个型号线索，却是几行没归到一起的 SKU——常见的是京东同一款的几个链接。
              确认它们是同一个型号后，一次归到一起，价格历史就并到一张图上。
            </p>
            <div className="space-y-3">
              {pairings.map((g) => <PairingRow key={`${g.brand}-${g.hint}`} group={g} items={items} run={run} pending={pending} />)}
            </div>
          </Card>
        )}
        {unassigned.length > 0 && (
          <Card title="还没归到型号的 SKU" className="lg:col-span-2">
            <p className="mb-2 text-[12.5px] text-ink-3">采价程序推来的在售 SKU，按品牌计。要盯某个型号，就在「添加 SKU」里填同一个平台和 SKU 号，价格历史会接上。</p>
            <div className="flex flex-wrap gap-2">
              {unassigned.map((u) => (
                <a key={u.brand} href={`/pricing/brand/${u.brand}`} className="rounded-control border border-line px-2.5 py-1 text-[12.5px] text-ink-2 hover:bg-surface">
                  {u.brand} · {u.offers}
                </a>
              ))}
            </div>
          </Card>
        )}
        <Card title="导入价格" className="lg:col-span-2">
          <p className="mb-3 text-[12.5px] leading-relaxed text-ink-3">
            一行一个 SKU：<code>平台,SKU,标价,到手价,划线价,库存,时间</code>。后五项可留空；到手价空着就用标价比价，时间空着就是现在。
            平台写 {PLATFORMS.map((p) => p.key).join(" / ")}。
          </p>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder={EXAMPLE}
            spellCheck={false}
            className="font-mono text-[12.5px]"
          />
          {problems.length > 0 && (
            <ul className="mt-2 space-y-1 rounded-control border border-line bg-surface p-3 text-[12.5px] text-ink-2">
              {problems.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          )}
          <div className="mt-3 flex items-center gap-2">
            <Button tone="primary" busy={pending === "parse"} disabled={!text.trim() || busy} onClick={importRows}>解析并写入</Button>
            <Button busy={false} onClick={() => { setText(EXAMPLE); setProblems([]); }}>填入示例</Button>
          </div>
        </Card>
      </div>
    </AdminPage>
  );
}

function PairingRow({ group, items, run, pending }: {
  group: PairingGroup;
  items: ItemSummary[];
  run: ReturnType<typeof useAdminAction>["run"];
  pending: string | null;
}) {
  const [slug, setSlug] = useState(items[0]?.slug ?? "");
  return (
    <div className="rounded-card border border-line p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[13px] text-ink-1">
          {group.label} · <span className="text-ink-3">{group.hint}</span>
          <span className="ml-2 text-[12px] text-ink-4">{group.platforms.join("/")} · {group.offers.length} 个 SKU</span>
        </div>
        <div className="flex items-center gap-2">
          <Select value={slug} onChange={(e) => setSlug(e.target.value)} className="!w-auto">
            {items.map((i) => <option key={i.slug} value={i.slug}>{i.name}</option>)}
          </Select>
          <Button
            tone="secondary"
            size="sm"
            busy={pending === `assign-${group.brand}-${group.hint}`}
            disabled={!slug || items.length === 0}
            onClick={async () => {
              let ok = true;
              for (const [i, o] of group.offers.entries()) {
                const last = i === group.offers.length - 1;
                const res = await run("POST", `/api/admin/pricing/offers/${o.id}/assign`, { itemSlug: slug }, {
                  label: `assign-${o.id}`, revalidate: last, ...(last ? { success: "已归到型号" } : {}),
                });
                if (!res) ok = false;
              }
              if (!ok) return;
            }}
          >全部归到这个型号</Button>
        </div>
      </div>
      <ul className="mt-2 space-y-1 text-[12px] text-ink-3">
        {group.offers.map((o) => (
          <li key={o.id} className="truncate">
            {platformLabel(o.platform)} · {o.shop ?? "未知店铺"}
            {o.price !== null && ` · ¥${o.price}`}
            {o.itemSlug && <span className="ml-2 text-ink-4">已在 {o.itemSlug}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
