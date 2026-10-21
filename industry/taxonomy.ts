// 这个行业的分类体系：类别、标签词表、公司（主体）名录，以及防止张冠李戴的身份词典。
// 模型按这里的词表打标签，主题页（topics.json）按标签归类，筛选栏按类别分组。
// 换行业时：类别的 key 会出现在网址里（/all?category=…），上线后就不要再改；标签和名录可以随时增减。

/**
 * 网页上的类别（筛选栏、卡片角标、RSS 分类订阅）。key 是网址和接口里的身份，上线后不要改。
 * section 是日报里的分节标题（几个类别可以共用一节，按这里的顺序排）；guide 告诉结构抽取模型这一类收什么、
 * 和相邻类别的边界在哪（总的归类原则写在 prompts/structure.md 里）。
 * commentary 标出评论类（观点）：日报写过的事又有评论类的后续报道，只占一行快讯（报道它的信源够多时除外）。
 * 没归上类的资料在日报里放进第一个 key 为 industry 的类别所在的节（没有就放最后一节）。
 * tagColor 是飞书推送卡片里跟在标题后面的这一类小标签的颜色（飞书 text_tag 的颜色名）。
 * feedLabel 是分类 RSS 标题里的名字（不写就用 label）。公开接口、RSS 和 MCP 里要把一类并进另一类发布，写在站点设置里（site/site.ts 的 PUBLIC_CATEGORIES）。
 *
 * 这份分类按“它要求你做什么决策”切，不按产品线切；产品线放在标签（TOPIC_TAGS）里，
 * 因为一条情报通常同时涉及多条产品线，而日报只能给它一个位置。
 */
export const CATEGORIES = [
  {
    key: "product",
    tagColor: "indigo",
    label: "新品与价格",
    feedLabel: "新品与价格",
    section: "新品与价格",
    guide: "竞品或渠道上的整机新品、型号、规格、开售、众筹、换代，以及价格调整、促销机制、套装和赠品。只改包装、换颜色、补一个地区的上架也算新品与价格，但只在有具体型号或价格时收录；没有参数的“即将发布”不算。",
  },
  {
    key: "component",
    tagColor: "turquoise",
    label: "供应链与器件",
    feedLabel: "供应链与器件",
    section: "供应链与器件",
    guide: "整机上游的器件、模组、方案与产能：BIA 前端芯片、称重传感器与应变片、蓝牙 SoC、电池、玻璃面板、LCD/OLED、结构件，以及涨价、交期、缺货、PCN、EOL、替代料和参考设计。器件厂商的普通公司新闻归行业，只有涉及产品、价格、产能或停产时归这一类。",
  },
  {
    key: "compliance",
    tagColor: "orange",
    label: "合规与召回",
    feedLabel: "合规与召回",
    section: "合规与召回",
    guide: "进入市场必须满足的规则和已经发生的质量后果：计量器具型式批准、OIML、CE、FCC、欧盟 MDR、美国 FDA、RoHS、REACH、Prop 65、UN38.3、电池法规，以及召回、下架、处罚、集体诉讼和认证失效。标准草案征求意见也算；纯学术的测量误差研究归技术。",
  },
  {
    key: "channel",
    tagColor: "gold",
    label: "渠道与平台",
    feedLabel: "渠道与平台",
    section: "渠道与平台",
    guide: "卖货的地方改了规则：Amazon、天猫、京东、拼多多、抖音、TikTok Shop 的类目、准入、合规审核、佣金、物流、评价与广告政策，以及线下商超和药房的进场规则。平台大促的招商规则归这里；某个品牌自己的促销归新品与价格。",
  },
  {
    key: "industry",
    tagColor: "purple",
    label: "公司与资本",
    feedLabel: "公司与资本",
    section: "公司与资本",
    guide: "公司经营与资本层面已经发生的事：财报、出货量、均价、区域结构、融资、并购、IPO、产能、工厂、人事、客户绑定、专利诉讼和反倾销。产品本身的发布归新品与价格；只有经营结果和资本动作归这里。",
  },
  {
    key: "tech",
    tagColor: "violet",
    label: "技术与专利",
    feedLabel: "技术与专利",
    section: "技术与专利",
    guide: "测量与算法本身：多频与八电极方案、体成分算法、与 DXA 或其他专业设备的对照研究、心率/体态等衍生测量、App 与健康平台接入、OTA 和隐私设计，以及专利公开与授权。拆机和实测归拆机实测，不归这里。",
  },
  {
    key: "adjacent",
    tagColor: "green",
    label: "替代与邻接",
    feedLabel: "替代与邻接",
    section: "替代与邻接",
    guide: "可能替代家用秤或与它抢同一需求的东西：智能手表与戒指的体成分功能、专业体测设备、健身房与体检套餐、减重药物与健康管理服务，以及同供应链的邻接品类（智能垃圾桶、手环）。只有明确影响称重与体成分需求时才归这里。",
  },
  {
    key: "opinion",
    tagColor: "rose",
    label: "观点与拆解",
    feedLabel: "观点与拆解",
    section: "观点与拆解",
    guide: "作者的解释、判断、预测、访谈，以及拆机报告和带数据的实测。拆机与实测只要给出方案、BOM、成本或可复现的测量结果，就按正常价值评价；没有数据、只是开箱和带货的，归其他并压低分数。",
    commentary: true,
  },
] as const satisfies ReadonlyArray<{ key: string; tagColor: string; label: string; feedLabel?: string; section: string; guide: string; commentary?: true }>;

/**
 * 这个行业最受关注的一类发布（这里是整机新品）：日报报头的“N 款新品”、改分类后修订已出的报告都按它数。
 * category 是类别，tag 是标签，两者都对上才算；unit 接在数字后面。
 * 没有这样一类的行业设成 null，报头就不显示这个数。
 */
export const RELEASE: { category: string; tag: string; unit: string } | null = { category: "product", tag: "新品发布", unit: "款新品" };

/** 周报月报的总述可以直接写、不必在报道里找到出处的行业通用词（小写）。站名会自动算进去。 */
export const PLAIN_TERMS: readonly string[] = [
  "ai", "app", "bia", "ble", "bom", "ce", "ceo", "cpa", "eol", "fcc", "fda", "ipo", "mdr", "oem", "odm", "oiml", "ota", "pcn", "rohs", "sku", "wi-fi", "wifi",
];

/**
 * 内容理解一步给每篇资料判的“内容类型”（写在 prompts/content-understanding.md 里，改了类型要同步改那份提示词）。
 * 评分提示词（prompts/selection-score.md）按类型给五个维度不同的权重。
 */
export const ITEM_TYPES = [
  "new_product", "price_change", "certification", "recall_quality", "component_change",
  "channel_rule", "company_capital", "technical_research", "teardown_review", "market_data",
] as const;

// ── 标签词表 ────────────────────────────────────────────────────────────────────────────

/** 每篇资料的第一个标签必须是这些“分类标签”之一。 */
export const CATEGORY_TAGS = [
  "新品发布", "价格变动", "器件变更", "认证法规", "召回质量", "渠道规则", "公司动态", "技术研究", "拆机实测", "市场数据", "观点", "其他",
] as const;

/** 可选的主题标签：产品线、技术、渠道、合规。 */
export const TOPIC_TAGS = [
  // 产品线
  "体脂秤", "体重秤", "厨房秤", "行李秤", "珠宝秤", "婴儿秤", "机械秤", "商用秤", "计价秤", "智能手环", "智能垃圾桶",
  // 技术与器件
  "八电极", "四电极", "多频BIA", "应变片", "称重芯片", "BLE", "Wi-Fi", "OTA", "体成分算法", "App", "健康平台", "智能手表", "智能戒指",
  // 渠道
  "Amazon", "天猫", "京东", "抖音", "拼多多", "TikTok Shop", "线下渠道",
  // 合规
  "CE", "FCC", "MDR", "FDA", "CPA", "OIML", "RoHS", "REACH", "Prop 65", "UN38.3",
] as const;

/** 可选的实体标签（公司、机构、平台）。 */
export const ENTITY_TAGS = [
  "小米", "华为", "荣耀", "沃莱", "云麦", "乐心", "香山",
  "Withings", "Tanita", "Omron", "InBody", "Fitbit", "Garmin", "Renpho", "Etekcity", "arboleaf",
  "TI", "ADI", "芯海", "Nordic", "泰凌微", "乐鑫", "巨微",
  "Amazon", "天猫", "京东", "抖音", "TikTok Shop",
] as const;

/** 模型常写的近义词，统一成词表里的写法。 */
export const TAG_SYNONYMS: Readonly<Record<string, string>> = {
  // 产品线
  智能体脂秤: "体脂秤", 体脂称: "体脂秤", 人体成分秤: "体脂秤", 体成分秤: "体脂秤",
  人体秤: "体重秤", 体重计: "体重秤", 智能秤: "体重秤", 电子体重秤: "体重秤",
  厨房电子秤: "厨房秤", 营养秤: "厨房秤", 食物秤: "厨房秤",
  手提秤: "行李秤", 行李电子秤: "行李秤", 吊秤: "行李秤",
  珠宝称: "珠宝秤", 婴儿体重秤: "婴儿秤", 婴儿电子秤: "婴儿秤",
  机械人体秤: "机械秤", 机械体重秤: "机械秤",
  商用电子秤: "商用秤", 收银秤: "计价秤", 条码秤: "计价秤",
  // 技术
 生物电阻抗: "多频BIA", 生物电阻抗分析: "多频BIA", 双频BIA: "多频BIA",
  蓝牙: "BLE", 低功耗蓝牙: "BLE", 蓝牙模块: "BLE",
  称重传感器: "应变片", 传感器: "应变片",
  // 渠道
  亚马逊: "Amazon", 淘宝: "天猫", 天猫商城: "天猫", 京东商城: "京东", 抖店: "抖音",
  跨境电商: "Amazon",
  // 合规
  欧盟CE: "CE", 美国FCC: "FCC", 医疗器械指令: "MDR", 美国FDA: "FDA",
  计量认证: "CPA", 型式批准: "CPA", 型式评价: "CPA",
  有害物质限制: "RoHS", 化学品注册: "REACH",
  // 情报类型
  新品: "新品发布", 发布: "新品发布", 上新: "新品发布", 开售: "新品发布",
  价格: "价格变动", 调价: "价格变动", 涨价: "价格变动", 降价: "价格变动", 促销: "价格变动",
  供应链: "器件变更", 芯片: "器件变更", 缺货: "器件变更", 交期: "器件变更",
  法规: "认证法规", 认证: "认证法规", 合规: "认证法规", 标准: "认证法规",
  召回: "召回质量", 质量: "召回质量", 下架: "召回质量",
  渠道: "渠道规则", 平台规则: "渠道规则", 类目: "渠道规则",
  财报: "公司动态", 融资: "公司动态", 并购: "公司动态", 人事: "公司动态",
  专利: "技术研究", 论文: "技术研究", 研究: "技术研究",
  测评: "拆机实测", 拆机: "拆机实测", 实测: "拆机实测", 评测: "拆机实测",
  榜单: "市场数据", 市场: "市场数据", 出货: "市场数据",
  评论: "观点", 访谈: "观点", 趋势: "观点",
  // 大小写与英文写法
  app: "App", ble: "BLE", "wi-fi": "Wi-Fi", wifi: "Wi-Fi", ota: "OTA",
  amazon: "Amazon", tmall: "天猫", jd: "京东", douyin: "抖音", "tiktok shop": "TikTok Shop",
  ce: "CE", fcc: "FCC", mdr: "MDR", fda: "FDA", cpa: "CPA", oiml: "OIML", rohs: "RoHS", reach: "REACH",
  "prop 65": "Prop 65", "un38.3": "UN38.3",
  xiaomi: "小米", huawei: "华为", honor: "荣耀", wole: "沃莱", yunmai: "云麦", lifesense: "乐心",
  withings: "Withings", tanita: "Tanita", omron: "Omron", inbody: "InBody", fitbit: "Fitbit",
  garmin: "Garmin", renpho: "Renpho", etekcity: "Etekcity", arboleaf: "arboleaf",
  ti: "TI", adi: "ADI", chipsemi: "芯海", nordic: "Nordic", telink: "泰凌微", espressif: "乐鑫", juwei: "巨微",
  // 实体
  米家: "小米", MIJIA: "小米", Xiaomi: "小米",
  Huawei: "华为", HONOR: "荣耀", Wole: "沃莱", Yunmai: "云麦", Lifesense: "乐心",
  SENSSUN: "香山", CAMRY: "香山", 香山衡器: "香山", 香山股份: "香山",
  "Texas Instruments": "TI", "Analog Devices": "ADI", Chipsea: "芯海", Telink: "泰凌微", Espressif: "乐鑫",
};

// ── 公司与主体 ──────────────────────────────────────────────────────────────────────────

/**
 * 公司主题：id → 显示名、卡片上显示的标签（null 表示只用 entity:<id> 归类）、别名。
 * aliases 给结构抽取模型看；orgNames 是这家公司发消息时开头用的组织名（公司、实验室、团队），
 * 在它自己的主题页上读者知道说的是谁，可以省去；otherNames 是公司的其他称呼（官方账号名、子品牌）。
 * 所有这些名字都用来认出说的是哪家公司，比如把事实的主体对到发布方。
 */
export const ENTITIES: Record<string, { name: string; displayTag: string | null; aliases: string[]; orgNames?: string[]; otherNames?: string[] }> = {
  senssun: {
    name: "香山",
    displayTag: "香山",
    aliases: ["香山", "SENSSUN", "CAMRY", "金叶", "康美", "香山衡器", "香山股份"],
    orgNames: ["广东香山电子科技有限公司", "广东香山衡器集团股份有限公司", "香山衡器", "SENSSUN"],
    otherNames: ["CAMRY", "金叶", "康美"],
  },
  xiaomi: {
    name: "小米 / 米家",
    displayTag: "小米",
    aliases: ["小米", "米家", "Xiaomi", "MIJIA"],
    orgNames: ["小米集团", "小米", "Xiaomi"],
    otherNames: ["米家", "MIJIA", "小米商城"],
  },
  huawei: {
    name: "华为",
    displayTag: "华为",
    aliases: ["华为", "Huawei"],
    orgNames: ["华为", "华为终端", "Huawei"],
    otherNames: ["华为运动健康", "华为智选"],
  },
  honor: { name: "荣耀", displayTag: "荣耀", aliases: ["荣耀", "HONOR"], orgNames: ["荣耀", "HONOR"] },
  wole: { name: "沃莱", displayTag: "沃莱", aliases: ["沃莱", "沃莱科技", "Wole"], orgNames: ["广东沃莱科技有限公司", "沃莱科技", "Wole"] },
  yunmai: { name: "云麦", displayTag: "云麦", aliases: ["云麦", "Yunmai"], orgNames: ["云麦科技", "Yunmai"] },
  lifesense: {
    name: "乐心",
    displayTag: "乐心",
    aliases: ["乐心", "乐心医疗", "Lifesense"],
    orgNames: ["广东乐心医疗电子股份有限公司", "乐心医疗", "Lifesense"],
  },
  withings: { name: "Withings", displayTag: "Withings", aliases: ["Withings"], orgNames: ["Withings"] },
  tanita: { name: "Tanita", displayTag: "Tanita", aliases: ["Tanita", "百利达"], orgNames: ["Tanita"] },
  omron: { name: "Omron 欧姆龙", displayTag: "Omron", aliases: ["Omron", "欧姆龙"], orgNames: ["Omron", "欧姆龙"] },
  inbody: { name: "InBody", displayTag: "InBody", aliases: ["InBody"], orgNames: ["InBody"] },
  fitbit: { name: "Fitbit", displayTag: "Fitbit", aliases: ["Fitbit"], orgNames: ["Fitbit"] },
  garmin: { name: "Garmin 佳明", displayTag: "Garmin", aliases: ["Garmin", "佳明"], orgNames: ["Garmin", "佳明"] },
  renpho: { name: "Renpho", displayTag: "Renpho", aliases: ["Renpho"], orgNames: ["Renpho"] },
  etekcity: { name: "Etekcity", displayTag: "Etekcity", aliases: ["Etekcity"], orgNames: ["Etekcity"] },
  arboleaf: { name: "arboleaf", displayTag: "arboleaf", aliases: ["arboleaf"], orgNames: ["arboleaf"] },
  ti: { name: "TI 德州仪器", displayTag: "TI", aliases: ["TI", "Texas Instruments", "德州仪器"], orgNames: ["Texas Instruments", "德州仪器"] },
  adi: { name: "ADI 亚德诺", displayTag: "ADI", aliases: ["ADI", "Analog Devices", "亚德诺"], orgNames: ["Analog Devices", "亚德诺"] },
  chipsemi: { name: "芯海科技", displayTag: "芯海", aliases: ["芯海", "芯海科技", "Chipsea"], orgNames: ["芯海科技", "Chipsea"] },
  nordic: { name: "Nordic", displayTag: "Nordic", aliases: ["Nordic", "Nordic Semiconductor"], orgNames: ["Nordic Semiconductor"] },
  telink: { name: "泰凌微", displayTag: "泰凌微", aliases: ["泰凌微", "Telink"], orgNames: ["泰凌微电子", "Telink"] },
  espressif: { name: "乐鑫", displayTag: "乐鑫", aliases: ["乐鑫", "Espressif", "ESP32"], orgNames: ["乐鑫科技", "Espressif"] },
  juwei: { name: "巨微", displayTag: "巨微", aliases: ["巨微", "Juwei"], orgNames: ["巨微集成电路", "Juwei"] },
  amazon: { name: "Amazon", displayTag: "Amazon", aliases: ["Amazon", "亚马逊"], orgNames: ["Amazon"] },
  tmall: { name: "天猫", displayTag: "天猫", aliases: ["天猫", "Tmall"], orgNames: ["天猫"] },
  jd: { name: "京东", displayTag: "京东", aliases: ["京东", "JD.com"], orgNames: ["京东"] },
  douyin: { name: "抖音", displayTag: "抖音", aliases: ["抖音", "Douyin"], orgNames: ["抖音电商"] },
  tiktokshop: { name: "TikTok Shop", displayTag: "TikTok Shop", aliases: ["TikTok Shop", "TikTokShop"], orgNames: ["TikTok Shop"] },
};

/**
 * 身份词典：摘要和标题里出现的公司，必须在原文里也出现过，否则退回原标题、丢掉摘要（防止模型张冠李戴）。
 * 行业没有这个问题时可以留空数组。
 */
export const IDENTITY_LEXICON: ReadonlyArray<{ id: string; name: string; patterns: RegExp[] }> = [
  { id: "senssun", name: "香山 / SENSSUN / CAMRY", patterns: [/香山|senssun|camry|金叶|康美/i] },
  { id: "xiaomi", name: "小米 / 米家", patterns: [/小米|米家|xiaomi|mijia/i] },
  { id: "huawei", name: "华为", patterns: [/华为|huawei/i] },
  { id: "honor", name: "荣耀", patterns: [/荣耀|honor/i] },
  { id: "wole", name: "沃莱", patterns: [/沃莱|\bwole\b/i] },
  { id: "yunmai", name: "云麦", patterns: [/云麦|yunmai/i] },
  { id: "lifesense", name: "乐心", patterns: [/乐心|lifesense/i] },
  { id: "withings", name: "Withings", patterns: [/withings/i] },
  { id: "tanita", name: "Tanita", patterns: [/tanita|百利达/i] },
  { id: "omron", name: "Omron", patterns: [/omron|欧姆龙/i] },
  { id: "inbody", name: "InBody", patterns: [/inbody/i] },
  { id: "fitbit", name: "Fitbit", patterns: [/fitbit/i] },
  { id: "garmin", name: "Garmin", patterns: [/garmin|佳明/i] },
  { id: "renpho", name: "Renpho", patterns: [/renpho/i] },
  { id: "etekcity", name: "Etekcity", patterns: [/etekcity/i] },
  { id: "arboleaf", name: "arboleaf", patterns: [/arboleaf/i] },
  { id: "ti", name: "TI", patterns: [/texas instruments|德州仪器|\bti\b/i] },
  { id: "adi", name: "ADI", patterns: [/analog devices|亚德诺|\badi\b/i] },
  { id: "chipsemi", name: "芯海", patterns: [/芯海|chipsea/i] },
  { id: "nordic", name: "Nordic", patterns: [/nordic/i] },
  { id: "telink", name: "泰凌微", patterns: [/泰凌微|telink/i] },
  { id: "espressif", name: "乐鑫", patterns: [/乐鑫|espressif|esp32/i] },
  { id: "juwei", name: "巨微", patterns: [/巨微|juwei/i] },
];

/** 这些域名上的文章，发布方就是对应的公司（托管平台不算）。 */
export const PUBLISHER_DOMAINS: ReadonlyArray<{ entityId: string; domains: readonly string[] }> = [
  { entityId: "senssun", domains: ["senssun.com", "camry.com.cn"] },
  { entityId: "xiaomi", domains: ["mi.com"] },
  { entityId: "huawei", domains: ["huawei.com"] },
  { entityId: "honor", domains: ["honor.com"] },
  { entityId: "withings", domains: ["withings.com"] },
  { entityId: "tanita", domains: ["tanita.com"] },
  { entityId: "omron", domains: ["omron.com"] },
  { entityId: "inbody", domains: ["inbody.com"] },
  { entityId: "fitbit", domains: ["fitbit.com"] },
  { entityId: "garmin", domains: ["garmin.com"] },
  { entityId: "renpho", domains: ["renpho.com"] },
  { entityId: "etekcity", domains: ["etekcity.com"] },
  { entityId: "arboleaf", domains: ["arboleaf.com"] },
];

/** 原文里的这些写法也算提到了对应公司。 */
export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{ entityId: string; pattern: RegExp }> = [
  { entityId: "senssun", pattern: /@SENSSUN\b|@CAMRY\b/i },
  { entityId: "xiaomi", pattern: /@Xiaomi\b|@mi\b/i },
  { entityId: "huawei", pattern: /@Huawei\b|@HuaweiMobile\b/i },
];
