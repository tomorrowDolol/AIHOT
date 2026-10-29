-- 上次读详情失败的原因（登录墙、风控、页面结构变了）。读不到型号的 SKU 要能解释，
-- 否则后台只看到"没有型号"，不知道是没读还是读失败。
ALTER TABLE pricing_offer ADD COLUMN detail_error text;
