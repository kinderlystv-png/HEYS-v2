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

(async () => {
    try {
        // 1. shared_products micronutrients
        const sp = await pool.query(`
      SELECT COUNT(*) as total,
        COUNT(CASE WHEN iron > 0 THEN 1 END) as fe,
        COUNT(CASE WHEN vitamin_c > 0 THEN 1 END) as vitc,
        COUNT(CASE WHEN calcium > 0 THEN 1 END) as ca,
        COUNT(CASE WHEN magnesium > 0 THEN 1 END) as mg,
        COUNT(CASE WHEN zinc > 0 THEN 1 END) as zn
      FROM shared_products
    `);
        console.log('=== 1. shared_products ===');
        console.log(sp.rows[0]);

        // 2. KV store product keys for client
        const kv = await pool.query(`
      SELECT k, 
        CASE WHEN jsonb_typeof(v) = 'array' THEN jsonb_array_length(v) ELSE -1 END as arr_len,
        length(v::text) as bytes,
        updated_at
      FROM client_kv_store 
      WHERE client_id = $1
        AND k LIKE '%product%'
      ORDER BY k
    `, [CLIENT_ID]);
        console.log('\n=== 2. client_kv_store product keys ===');
        kv.rows.forEach(r => console.log(`  ${r.k}: ${r.arr_len} items, ${Math.round(r.bytes / 1024)}KB, updated: ${r.updated_at}`));

        // 3. Check micronutrients in KV products
        const kvMicro = await pool.query(`
      SELECT 
        jsonb_array_length(v) as total,
        (SELECT COUNT(*) FROM jsonb_array_elements(v) elem 
         WHERE elem ? 'iron' AND (elem->>'iron')::numeric > 0) as with_iron,
        (SELECT COUNT(*) FROM jsonb_array_elements(v) elem 
         WHERE elem ? 'vitamin_c' AND (elem->>'vitamin_c')::numeric > 0) as with_vitc,
        (SELECT COUNT(*) FROM jsonb_array_elements(v) elem 
         WHERE elem ? 'calcium' AND (elem->>'calcium')::numeric > 0) as with_ca
      FROM client_kv_store 
      WHERE client_id = $1
        AND k = 'heys_products'
    `, [CLIENT_ID]);
        console.log('\n=== 3. KV heys_products micronutrients ===');
        console.log(kvMicro.rows[0] || 'NO DATA');

        // 4. Sample first product from KV to see fields
        const sample = await pool.query(`
      SELECT elem
      FROM client_kv_store,
        jsonb_array_elements(v) elem
      WHERE client_id = $1
        AND k = 'heys_products'
      LIMIT 1
    `, [CLIENT_ID]);
        console.log('\n=== 4. Sample KV product fields ===');
        if (sample.rows[0]) {
            const p = sample.rows[0].elem;
            console.log('  name:', p.name);
            console.log('  keys:', Object.keys(p).sort().join(', '));
            console.log('  iron:', p.iron, '| vitamin_c:', p.vitamin_c, '| calcium:', p.calcium);
        }

        await pool.end();
        console.log('\n✅ Done');
    } catch (e) {
        console.error('Error:', e.message);
        await pool.end();
        process.exit(1);
    }
})();
