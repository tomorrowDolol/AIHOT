// 比价模块的类型：一个监控对象在几个平台上的 SKU，和每个 SKU 的价格历史。
// 网页、接口和写库共用这一份，避免页面和接口对同一个价格给两种说法。

/** 平台写死的几个值；中文名只用于显示，接口和库里存 key。 */
export const PLATFORMS = [
  { key: "taobao", label: "淘宝" },
  { key: "tmall", label: "天猫" },
  { key: "jd", label: "京东" },
  { key: "pdd", label: "拼多多" },
  { key: "douyin", label: "抖音" },
  { key: "amazon", label: "Amazon" },
  { key: "other", label: "其他" },
] as const;

export type Platform = (typeof PLATFORMS)[number]["key"];

export const platformLabel = (key: string) => PLATFORMS.find((p) => p.key === key)?.label ?? key;

/** 一次采价的读数。比较用的是 `capturedAt` 上的实付价：有到手价就用它，没有用标价。 */
export interface PricePoint {
  at: string;
  /** 实付价（到手价，没有则为标价）。 */
  price: number;
  /** 标价。 */
  listPrice: number | null;
  /** 到手价，未做活动时为空。 */
  promoPrice: number | null;
}

/** 一个 SKU 自己的读数，以及它在观察窗口里的高低。 */
export interface OfferSummary {
  id: number;
  platform: string;
  shop: string | null;
  sku: string | null;
  title: string | null;
  url: string;
  latest: PricePoint | null;
  /** 观察窗口内的最低与最高实付价。 */
  min: number | null;
  max: number | null;
  points: PricePoint[];
}

/** 列表页的一行：一个监控对象在各个平台上的现价。 */
export interface ItemSummary {
  slug: string;
  name: string;
  brand: string | null;
  productLine: string | null;
  spec: string | null;
  note: string | null;
  platforms: string[];
  offerCount: number;
  /** 各地现价的区间：最低的那个 SKU 和最高的那个。 */
  lowest: number | null;
  highest: number | null;
  latestAt: string | null;
}

export interface ItemDetail {
  item: {
    slug: string;
    name: string;
    brand: string | null;
    productLine: string | null;
    spec: string | null;
    note: string | null;
  };
  offers: OfferSummary[];
  /** 观察窗口的天数，页面用它说明曲线画的是多久。 */
  days: number;
}

/** 品牌这一层的读数：自动采到的在售 SKU，按品牌聚在一起（还没归到具体型号的那些也在这里）。 */
export interface BrandSummary {
  brand: string;
  label: string;
  /** 在售 SKU 数（10 天内有采到）。 */
  offers: number;
  /** 已经搜不到、按现在算下架的 SKU 数。 */
  gone: number;
  shops: number;
  platforms: string[];
  lowest: number | null;
  highest: number | null;
  latestAt: string | null;
  /** 最近 7 天第一次见到的 SKU 数：新品或新链接。 */
  fresh: number;
}

/** 品牌页的一行：一个在售 SKU。 */
export interface BrandOffer {
  id: number;
  platform: string;
  sku: string | null;
  title: string | null;
  shop: string | null;
  url: string;
  active: boolean;
  price: number | null;
  at: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  /** 已经归到哪个型号（pricing_item.slug），没有则是 null。 */
  itemSlug: string | null;
  /** 详情页给的型号线索（京东「颜色」里的那一段），搜索页给不出来。 */
  modelHint: string | null;
  /** 上次读详情失败的原因。 */
  detailError: string | null;
}

/** 后台的配对建议：同一个品牌、同一个型号线索，却是几个没归到一起的 SKU。 */
export interface PairingGroup {
  brand: string;
  label: string;
  hint: string;
  platforms: string[];
  offers: Array<{
    id: number;
    platform: string;
    sku: string | null;
    shop: string | null;
    title: string | null;
    url: string;
    price: number | null;
    itemSlug: string | null;
  }>;
}
