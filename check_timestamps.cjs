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

(async () => {
    try {
        // Проверяем: какие updatedAt у продуктов в KV?
        const res = await pool.query(`
      SELECT 
        jsonb_array_length(v) as total,
        (SELECT COUNT(DISTINCT (elem->>'updatedAt'))
         FROM jsonb_array_elements(v) elem
         WHERE elem ? 'updatedAt') as unique_timestamps,
        (SELECT MAX((elem->>'updatedAt')::text)
         FROM jsonb_array_elements(v) elem
         WHERE elem ? 'updatedAt') as max_timestamp,
        (SELECT MIN((elem->>'updatedAt')::text)
         FROM jsonb_array_elements(v) elem
         WHERE elem ? 'updatedAt') as min_timestamp
      FROM client_kv_store 
      WHERE client_id = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a' 
        AND k = 'heys_products'
    `);

        console.log('📊 KV products timestamps:', res.rows[0]);

        // Пример продукта с железом
        const sample = await pool.query(`
      SELECT elem
      FROM client_kv_store,
           jsonb_array_elements(v) elem
      WHERE client_id = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a'
        AND k = 'heys_products'
        AND (elem->>'iron')::numeric > 0
      LIMIT 1
    `);

        if (sample.rows.length > 0) {
            const prod = sample.rows[0].elem;
            console.log('\n🔍 Sample product with iron:');
            console.log('  name:', prod.name);
            console.log('  iron:', prod.iron);
            console.log('  updatedAt:', prod.updatedAt);
            console.log('  has updatedAt?:', 'updatedAt' in prod);
        } else {
            console.log('\n⚠️ No products with iron found in KV!');
        }

        // Проверяем сколько продуктов вообще имеют updatedAt
        const counts = await pool.query(`
      SELECT
        jsonb_array_length(v) as total,
        (SELECT COUNT(*)
         FROM jsonb_array_elements(v) elem
         WHERE elem ? 'updatedAt') as with_updatedAt,
        (SELECT COUNT(*)
         FROM jsonb_array_elements(v) elem
         WHERE elem->>'iron' IS NOT NULL AND (elem->>'iron')::numeric > 0) as with_iron
      FROM client_kv_store 
      WHERE client_id = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a' 
        AND k = 'heys_products'
    `);

        console.log('\n📈 Counts:', counts.rows[0]);

        await pool.end();
    } catch (e) {
        console.error('❌ Error:', e.message);
        await pool.end();
        process.exit(1);
    }
})();
