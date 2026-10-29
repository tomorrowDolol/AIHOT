-- A thing whose price is watched: one model on sale somewhere, ours or a competitor's.
-- brand_entity_id points at industry/taxonomy.ts ENTITIES, so a competitor's items sit on its topic page.
CREATE TABLE IF NOT EXISTS pricing_item (
  id bigserial PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  brand_entity_id text,
  product_line text,
  spec text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
