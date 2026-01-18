WITH shared_as_jsonb AS (
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', LOWER(REPLACE(gen_random_uuid()::text, '-', '')),
      'name', name,
      'protein100', COALESCE(protein100, 0),
      'carbs100', COALESCE(simple100, 0) + COALESCE(complex100, 0),
      'fat100', COALESCE(badfat100, 0) + COALESCE(goodfat100, 0) + COALESCE(trans100, 0),
      'simple100', COALESCE(simple100, 0),
      'complex100', COALESCE(complex100, 0),
      'badFat100', COALESCE(badfat100, 0),
      'goodFat100', COALESCE(goodfat100, 0),
      'trans100', COALESCE(trans100, 0),
      'fiber100', COALESCE(fiber100, 0),
      'gi', COALESCE(gi, 50),
      'harm', COALESCE(harm, 5),
      'category', COALESCE(category, ''),
      'novaGroup', COALESCE(nova_group, 0),
      'sodium100', COALESCE(sodium100, 0),
      'isOrganic', COALESCE(is_organic, false),
      'isWholeGrain', COALESCE(is_whole_grain, false),
      'isFermented', COALESCE(is_fermented, false),
      'isRaw', COALESCE(is_raw, false),
      'kcal100', ROUND((COALESCE(protein100, 0) * 4 + (COALESCE(simple100, 0) + COALESCE(complex100, 0)) * 4 + (COALESCE(badfat100, 0) + COALESCE(goodfat100, 0) + COALESCE(trans100, 0)) * 9)::numeric, 1),
      'shared_origin_id', id,
      'cloned_at', EXTRACT(EPOCH FROM NOW()) * 1000,
      'shared_updated_at', updated_at,
      'user_modified', false,
      'createdAt', EXTRACT(EPOCH FROM NOW()) * 1000
    )
  ) as products
  FROM shared_products
)
UPDATE client_kv_store 
SET v = shared_as_jsonb.products, updated_at = NOW()
FROM shared_as_jsonb
WHERE client_id = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a' AND k = 'heys_products';
