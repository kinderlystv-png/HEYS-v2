const { Pool } = require('pg');
const pool = new Pool({
    host: 'rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net',
    port: 6432,
    database: 'heys_production',
    user: 'heys_admin',
    password: process.env.PG_PASSWORD,
    ssl: { rejectUnauthorized: false }
});
(async () => {
    const client = await pool.connect();
    try {
        console.log('=== Test with VALID curator_id ===');
        const r1 = await client.query(
            'SELECT * FROM get_curator_clients(p_curator_id => $1::uuid)',
            ['6d4dbb32-fd9d-45b3-8e01-512595e2cb2c']
        );
        console.log('Result:', JSON.stringify(r1.rows, null, 2));
    } catch (e) {
        console.error('ERROR:', e.message, e.code, e.detail);
    } finally {
        client.release();
        await pool.end();
    }
})();
