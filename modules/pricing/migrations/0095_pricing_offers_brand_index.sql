CREATE INDEX CONCURRENTLY IF NOT EXISTS pricing_offer_brand ON pricing_offer (brand_entity_id) WHERE brand_entity_id IS NOT NULL;
