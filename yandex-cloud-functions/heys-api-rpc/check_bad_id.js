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
        console.log('=== Checking for invalid curator ID ===');
        const r1 = await client.query(
            'SELECT id, email, name FROM curators WHERE id = \',
            ['6d4dbb32-ebb4-4375-a8ca-360b22093c91']
        );
        console.log('Result:', JSON.stringify(r1.rows, null, 2));
    } catch (e) {
        console.error('ERROR:', e.message, e.code, e.detail);
    } finally {
        client.release();
        await pool.end();
    }
})();
