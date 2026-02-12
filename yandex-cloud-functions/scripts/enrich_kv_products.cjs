/**
 * Update client KV products with micronutrients from shared_products.
 * This script enriches the client's personal products stored in KV
 * with micronutrient data (iron, vitamin_c, calcium, magnesium, zinc, etc.)
 * from the PostgreSQL shared_products table.
 */
const fs = require('fs');

const { Pool } = require('pg');

const sslCaPath = process.env.PG_SSL_CA_PATH || '/Users/poplavskijanton/.postgresql/root.crt';

if (!process.env.PG_PASSWORD) {
    console.error('❌ Missing PG_PASSWORD env variable');
    process.exit(1);
}

const pool = new Pool({
    host: process.env.PG_HOST || 'rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net',
    port: Number(process.env.PG_PORT) || 6432,
    database: process.env.PG_DATABASE || 'heys_production',
    user: process.env.PG_USER || 'heys_admin',
    password: process.env.PG_PASSWORD,
    ssl: { rejectUnauthorized: true, ca: fs.readFileSync(sslCaPath) }
});

const CLIENT_ID = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';

// Micronutrient fields to enrich
const MICRO_FIELDS = [
    'iron', 'vitamin_c', 'calcium', 'vitamin_d', 'vitamin_b12',
    'vitamin_a', 'vitamin_e', 'magnesium', 'zinc', 'potassium',
    'sodium', 'folate'
];

(async () => {
    try {
        // 1. Load shared_products with micronutrients
        console.log('📥 Loading shared_products from PostgreSQL...');
        const spResult = await pool.query(`
      SELECT id, name, iron, vitamin_c, calcium, vitamin_d, vitamin_b12,
             vitamin_a, vitamin_e, magnesium, zinc, potassium, sodium, folate
      FROM shared_products
    `);

        // Build lookup maps: by name (normalized) and by id
        const spByName = new Map();
        const spById = new Map();
        for (const sp of spResult.rows) {
            const normName = String(sp.name || '').trim().toLowerCase();
            if (normName) spByName.set(normName, sp);
            if (sp.id) spById.set(sp.id, sp);
        }
        console.log(`  ✅ ${spResult.rows.length} products, ${spByName.size} unique names`);

        // 2. Load KV products
        console.log('\n📥 Loading KV products...');
        const kvResult = await pool.query(`
      SELECT v FROM client_kv_store 
      WHERE client_id = $1 AND k = 'heys_products'
    `, [CLIENT_ID]);

        if (!kvResult.rows.length) {
            console.error('❌ No heys_products in KV store!');
            await pool.end();
            return;
        }

        const kvProducts = kvResult.rows[0].v;
        console.log(`  ✅ ${kvProducts.length} products in KV`);

        // 3. Count before
        const countMicro = (arr) => ({
            iron: arr.filter(p => p.iron && Number(p.iron) > 0).length,
            vitC: arr.filter(p => p.vitamin_c && Number(p.vitamin_c) > 0).length,
            ca: arr.filter(p => p.calcium && Number(p.calcium) > 0).length,
            mg: arr.filter(p => p.magnesium && Number(p.magnesium) > 0).length,
            zn: arr.filter(p => p.zinc && Number(p.zinc) > 0).length
        });

        const before = countMicro(kvProducts);
        console.log('\n📊 BEFORE enrichment:');
        console.log(`  Fe=${before.iron}, VitC=${before.vitC}, Ca=${before.ca}, Mg=${before.mg}, Zn=${before.zn}`);

        // 4. Enrich products
        let enriched = 0;
        let notFound = 0;
        const enrichedProducts = kvProducts.map(product => {
            const normName = String(product.name || '').trim().toLowerCase();

            // Find matching shared_product
            let sp = null;
            if (product.shared_origin_id) {
                sp = spById.get(product.shared_origin_id);
            }
            if (!sp && normName) {
                sp = spByName.get(normName);
            }

            if (!sp) {
                notFound++;
                return product;
            }

            // Enrich with micronutrient data from shared_products
            let changed = false;
            const enrichedProduct = { ...product };

            for (const field of MICRO_FIELDS) {
                const spValue = Number(sp[field]) || 0;
                const kvValue = Number(product[field]) || 0;

                // Update if shared_products has value and KV doesn't (or KV has 0)
                if (spValue > 0 && kvValue === 0) {
                    enrichedProduct[field] = spValue;
                    changed = true;
                }
            }

            if (changed) enriched++;
            return enrichedProduct;
        });

        const after = countMicro(enrichedProducts);
        console.log('\n📊 AFTER enrichment:');
        console.log(`  Fe=${after.iron}, VitC=${after.vitC}, Ca=${after.ca}, Mg=${after.mg}, Zn=${after.zn}`);
        console.log(`  📈 Enriched: ${enriched} products, Not found in shared: ${notFound}`);

        // 5. Save back to KV
        if (enriched > 0) {
            console.log('\n💾 Saving enriched products to KV store...');
            await pool.query(`
        UPDATE client_kv_store 
        SET v = $1::jsonb, updated_at = NOW()
        WHERE client_id = $2 AND k = 'heys_products'
      `, [JSON.stringify(enrichedProducts), CLIENT_ID]);
            console.log('  ✅ KV heys_products updated!');

            // Also update hidden_products if it exists
            const hiddenResult = await pool.query(`
        SELECT v FROM client_kv_store 
        WHERE client_id = $1 AND k = 'heys_hidden_products'
      `, [CLIENT_ID]);

            if (hiddenResult.rows.length && Array.isArray(hiddenResult.rows[0].v)) {
                const hiddenProducts = hiddenResult.rows[0].v;
                let hiddenEnriched = 0;

                const enrichedHidden = hiddenProducts.map(product => {
                    const normName = String(product.name || '').trim().toLowerCase();
                    let sp = product.shared_origin_id ? spById.get(product.shared_origin_id) : null;
                    if (!sp && normName) sp = spByName.get(normName);
                    if (!sp) return product;

                    let changed = false;
                    const enrichedProduct = { ...product };
                    for (const field of MICRO_FIELDS) {
                        const spValue = Number(sp[field]) || 0;
                        const kvValue = Number(product[field]) || 0;
                        if (spValue > 0 && kvValue === 0) {
                            enrichedProduct[field] = spValue;
                            changed = true;
                        }
                    }
                    if (changed) hiddenEnriched++;
                    return enrichedProduct;
                });

                if (hiddenEnriched > 0) {
                    await pool.query(`
            UPDATE client_kv_store 
            SET v = $1::jsonb, updated_at = NOW()
            WHERE client_id = $2 AND k = 'heys_hidden_products'
          `, [JSON.stringify(enrichedHidden), CLIENT_ID]);
                    console.log(`  ✅ KV heys_hidden_products updated (${hiddenEnriched} enriched)`);
                }
            }
        } else {
            console.log('\n⚠️ No products needed enrichment');
        }

        // 6. Final verification
        console.log('\n🔍 Verification...');
        const verify = await pool.query(`
      SELECT 
        jsonb_array_length(v) as total,
        (SELECT COUNT(*) FROM jsonb_array_elements(v) elem 
         WHERE elem ? 'iron' AND (elem->>'iron')::numeric > 0) as with_iron,
        (SELECT COUNT(*) FROM jsonb_array_elements(v) elem 
         WHERE elem ? 'vitamin_c' AND (elem->>'vitamin_c')::numeric > 0) as with_vitc,
        (SELECT COUNT(*) FROM jsonb_array_elements(v) elem 
         WHERE elem ? 'calcium' AND (elem->>'calcium')::numeric > 0) as with_ca
      FROM client_kv_store 
      WHERE client_id = $1 AND k = 'heys_products'
    `, [CLIENT_ID]);
        console.log('  KV heys_products:', verify.rows[0]);

        await pool.end();
        console.log('\n✅ ALL DONE');
    } catch (e) {
        console.error('❌ Error:', e.message);
        await pool.end();
        process.exit(1);
    }
})();
