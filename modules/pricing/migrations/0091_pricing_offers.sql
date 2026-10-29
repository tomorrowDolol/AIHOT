-- 一个 SKU 在一个平台上的上架。两种来源共用这张表：
--   人工建（后台加了型号和 SKU）：item_id 指向那个型号；
--   采价程序推来的（搜索页发现的所有 SKU）：只有 brand_entity_id，还没归到型号上。
-- 归到型号是 UPDATE 一行 item_id 的事，不用另起一张表，价格历史也只有一份。
CREATE TABLE IF NOT EXISTS pricing_offer (
  id bigserial PRIMARY KEY,
  item_id bigint REFERENCES pricing_item (id) ON DELETE CASCADE,
  brand_entity_id text,
  platform text NOT NULL,
  shop text,
  sku text,
  title text,
  url text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
