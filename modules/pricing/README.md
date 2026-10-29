# 比价

按平台跟踪价格，分两层：

- **型号**：我们自己挑出来比的那几个 SKU，一个一条曲线，看现价、最近高低点、哪个平台便宜。
- **品牌**：采价程序（`sku-watch`）从淘宝/京东搜索页搜到的全部在售 SKU，按品牌给出 SKU 数、店铺数、价格带、最近 7 天新出现的。

## 数据怎么进来

| 表 | 一行是什么 |
|---|---|
| `pricing_item` | 一个要盯的型号。`brand_entity_id` 对上 `industry/taxonomy.ts` 的 `ENTITIES`，所以竞品的型号能和它的主题页对上 |
| `pricing_offer` | 一个 SKU 在一个平台上的一次上架。人工建的行带 `item_id`（挂在型号下）；采价程序推来的行只有 `brand_entity_id`，还没归到型号 |
| `pricing_snapshot` | 某个 SKU 在某一刻的价格。只追加；同一 `(offer_id, captured_at)` 再导一次是覆盖，不是第二次降价 |

型号和在售 SKU **共用 `pricing_offer` 和 `pricing_snapshot`**：归到型号只是给那一行填上 `item_id`，价格历史只有一份，
所以型号页和品牌价格带永远对得上。别为品牌层再建一套表。

两条入口，写库都在 `write.ts`：

- **人工**：后台 `/admin/pricing` 粘贴一张表，`平台,SKU,标价,到手价,划线价,库存,时间`（`importSnapshots`）。
- **采价程序**：`POST /api/pricing/ingest`，Bearer `INGEST_TOKEN`（和 `/api/ingest/items` 同一个 token），
  一次最多 500 行（`ingestListings`）。

推送按 `(平台, SKU)` 建或更新上架行：**已经人工归到型号的行只更新标题、店铺、价格和活跃时间，不动 `item_id`**，
自动采集不会把人做的归类冲掉。

搜索页给的店铺名和标题混着促销文案（「已售6万+3100+人种草香山京东自营旗舰店」），清洗在采集端做
（`sku-watch` 的 `cleanShop` / `cleanTitle`）：站点只存清洗后的值，不做展示期的猜测。

## 怎么读

公开出口只有 `read.ts`：

| 地址 | 内容 |
|---|---|
| `/pricing` | 两层都在：上面是盯着的型号，下面是各品牌在售概况 |
| `/pricing/:slug` | 一个型号的每个 SKU 与曲线 |
| `/pricing/brand/:brand` | 一个品牌的全部在售 SKU，按现价从低到高 |
| `/api/v1/pricing` | `{ platforms, items, brands }` |
| `/api/v1/pricing/:slug` | 型号详情与价格点 |
| `/api/v1/pricing/brands/:brand` | 品牌在售清单 |

- **现价**：某个 SKU 最后一次读数里的实付价，有到手价用到手价。
- **在售**：不靠采集端标记，按 `last_seen_at` 派生——超过 `STALE_DAYS`（10 天）没再采到就算下架，行不删，
  品牌页置灰并标「最后见到」。采价节奏是 P0/P1 每天、P3 每 3 天，10 天等于漏了三轮；人工贴一次价格也会刷新它。
  人工停用（`active = false`）走同一条路，优先于时间判断。
- **区间**：型号是各 SKU 现价的最低到最高；品牌是在售 SKU 的价格带。
- **高低点与曲线**：最近 120 天（`DEFAULT_DAYS`）。三年前的最低价不该挂在页面上。

## 淘宝、京东的页面抓不到

对非浏览器请求，天猫、京东、阿里国际站的商品页返回的是跳转和验证脚本，不是价格。所以不能做成 `web_list` 信源：
要么用官方/第三方接口（要资质和密钥），要么用带登录态的脚本抓完推给 `/api/pricing/ingest`。

`sku-watch` 是后者：OpenCLI 走已登录的 Chrome 会话搜索，按品牌正则过滤，落 SQLite，每 2 小时一轮把这一轮
采到的 SKU 推过来。两边只有一个约定：`platform` 用同一个值（`taobao` / `jd`），`sku` 是平台的商品 id。

## 还差的一件事

**同款跨平台**还没有自动配对：淘宝和京东的同一个型号是两个不同的 SKU 号，标题也很脏（广告前缀、促销尾巴）。
现在能做的是同品牌内比价格带，或者人工把两个平台的两行都填上同一个 `item_id`。
要做自动配对，得先在标题上抽出型号（如「S400」「八电极 Pro」），这一步单独做，不要塞进采集。

## 测试

```bash
DATABASE_URL=postgres://127.0.0.1:5432/aihot_test npm test
```

`tests/pricing.test.ts` 守的是：到手价优先、窗口外的读数不参与、同一时刻重导只覆盖、没有对应 SKU 的行被退回、
推送要 token、同一 SKU 再推是更新、推送不动人工归好的型号、10 天没采到算下架、详情只读归到型号的 SKU、
配对建议归到一起后消失、公开接口的缓存头与 404、后台接口没有会话是 401。
