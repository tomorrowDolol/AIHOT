-- What a price was at a moment. Append-only: a re-import of the same moment corrects the row instead of
-- adding a second one, so a pasted list can be replayed without inventing a price change.
CREATE TABLE IF NOT EXISTS pricing_snapshot (
  id bigserial PRIMARY KEY,
  offer_id bigint NOT NULL REFERENCES pricing_offer (id) ON DELETE CASCADE,
  captured_at timestamptz NOT NULL,
  price numeric(12, 2) NOT NULL,
  promo_price numeric(12, 2),
  list_price numeric(12, 2),
  in_stock boolean,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offer_id, captured_at)
);
