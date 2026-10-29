CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS pricing_offer_platform_sku ON pricing_offer (platform, sku) WHERE sku IS NOT NULL;
