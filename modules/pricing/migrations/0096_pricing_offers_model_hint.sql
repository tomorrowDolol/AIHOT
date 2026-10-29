-- 详情页里带型号的那一行（京东「颜色」字段，例如「【旗舰】专业八电极-至越Pro充电」）。
-- 搜索页标题给不出型号：淘宝标题基本不带型号，京东标题只在少数几款上带。配对靠它，不靠标题。
ALTER TABLE pricing_offer ADD COLUMN model_hint text;
