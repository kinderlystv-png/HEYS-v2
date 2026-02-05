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
        console.log('=== Checking for ALL curators with email poplanton@mail.ru ===');
        const r1 = await client.query(
            'SELECT id, email, name, is_active FROM curators WHERE email = \',
            ['poplanton@mail.ru']
        );
        console.log('Result:', JSON.stringify(r1.rows, null, 2));
    } catch (e) {
        console.error('ERROR:', e.message);
    } finally {
        client.release();
        await pool.end();
    }
})();
