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

const micronutrientFields = [
    'iron', 'vitamin_c', 'calcium', 'magnesium', 'zinc',
    'vitamin_d', 'vitamin_b12', 'folate', 'potassium',
    'selenium', 'vitamin_a', 'vitamin_e'
];

(async () => {
    try {
        console.log('📥 Loading shared_products from PostgreSQL...');
        const sharedRes = await pool.query(`
      SELECT id, name, iron, vitamin_c, calcium, magnesium, zinc,
             vitamin_d, vitamin_b12, folate, potassium, selenium, vitamin_a, vitamin_e
      FROM shared_products
    `);
        console.log(`   ✅ Loaded ${sharedRes.rows.length} shared_products`);

        // Индексируем по name (snake_case)
        const sharedByName = {};
        sharedRes.rows.forEach(sp => {
            const normalized = (sp.name || '').toLowerCase().trim();
            if (normalized) {
                sharedByName[normalized] = sp;
            }
        });
        console.log(`   📇 Indexed ${Object.keys(sharedByName).length} unique names`);

        console.log('\n📥 Loading KV heys_products...');
        const kvRes = await pool.query(`
      SELECT v 
      FROM client_kv_store 
      WHERE client_id = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a' 
        AND k = 'heys_products'
    `);

        if (kvRes.rows.length === 0) {
            console.error('❌ No heys_products found in KV!');
            await pool.end();
            process.exit(1);
        }

        let products = kvRes.rows[0].v;
        console.log(`   ✅ Loaded ${products.length} products from KV`);

        // Считаем "до"
        const countMicronutrients = (arr) => {
            const counts = {};
            micronutrientFields.forEach(f => {
                counts[f] = arr.filter(p => p[f] && +p[f] > 0).length;
            });
            return counts;
        };

        const countUpdatedAt = (arr) => arr.filter(p => p.updatedAt).length;

        const before = countMicronutrients(products);
        const beforeTs = countUpdatedAt(products);
        console.log('\n📊 BEFORE enrichment:');
        console.log(`   Fe=${before.iron}, VitC=${before.vitamin_c}, Ca=${before.calcium}, Mg=${before.magnesium}, Zn=${before.zinc}`);
        console.log(`   updatedAt: ${beforeTs}/${products.length}`);

        let enriched = 0;
        let timestampsAdded = 0;
        let notFound = 0;
        const now = Date.now();

        products = products.map(prod => {
            const normalized = (prod.name || '').toLowerCase().trim();
            const shared = sharedByName[normalized];

            // Добавляем updatedAt ВСЕМ продуктам если его нет
            if (!prod.updatedAt) {
                prod.updatedAt = now;
                timestampsAdded++;
            }

            if (!shared) {
                notFound++;
                return prod;
            }

            let changed = false;
            micronutrientFields.forEach(field => {
                if (shared[field] && (!prod[field] || +prod[field] === 0)) {
                    prod[field] = shared[field];
                    changed = true;
                }
            });

            if (changed) {
                enriched++;
                // Обновляем timestamp при enrichment
                prod.updatedAt = now;
            }

            return prod;
        });

        const after = countMicronutrients(products);
        const afterTs = countUpdatedAt(products);
        console.log('\n📊 AFTER enrichment:');
        console.log(`   Fe=${after.iron}, VitC=${after.vitamin_c}, Ca=${after.calcium}, Mg=${after.magnesium}, Zn=${after.zinc}`);
        console.log(`   updatedAt: ${afterTs}/${products.length}`);
        console.log(`\n📈 Enriched ${enriched} products with micronutrients`);
        console.log(`   Added updatedAt to ${timestampsAdded} products`);
        console.log(`   Not found in shared: ${notFound}`);

        // Сохраняем в KV
        console.log('\n💾 Saving to KV...');
        await pool.query(`
      UPDATE client_kv_store
      SET v = $1::jsonb, updated_at = NOW()
      WHERE client_id = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a'
        AND k = 'heys_products'
    `, [JSON.stringify(products)]);
        console.log('   ✅ KV heys_products updated!');

        // Проверяем
        const verify = await pool.query(`
      SELECT
        jsonb_array_length(v) as total,
        (SELECT COUNT(*) FROM jsonb_array_elements(v) elem WHERE (elem->>'iron')::numeric > 0) as with_iron,
        (SELECT COUNT(*) FROM jsonb_array_elements(v) elem WHERE elem ? 'updatedAt') as with_ts,
        (SELECT COUNT(DISTINCT (elem->>'updatedAt')) FROM jsonb_array_elements(v) elem WHERE elem ? 'updatedAt') as unique_ts
      FROM client_kv_store
      WHERE client_id = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a'
        AND k = 'heys_products'
    `);
        console.log('\n🔍 Verification:', verify.rows[0]);

        console.log('\n✅ ALL DONE');
        await pool.end();

    } catch (e) {
        console.error('❌ Error:', e.message);
        await pool.end();
        process.exit(1);
    }
})();
