-- 上次读详情的时间。详情一次要一分钟上下，所以只对人工归到型号的 SKU 读，并按它决定什么时候再读。
ALTER TABLE pricing_offer ADD COLUMN detail_at timestamptz;
