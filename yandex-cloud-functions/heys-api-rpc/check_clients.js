const { Pool } = require('pg');
const pool = new Pool({
    host: 'rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net',
    port: 6432,
    database: 'heys_production',
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    try {
        // Test get_curator_clients with correct curator_id
        const curatorId = '6d4dbb32-fd9d-45b3-8e01-512595e2cb2c';
        const test = await pool.query(`SELECT * FROM get_curator_clients($1::UUID)`, [curatorId]);
        console.log('Function result (UUID):', JSON.stringify(test.rows, null, 2));

        // Also test with TEXT version (my new function)
        const test2 = await pool.query(`SELECT * FROM get_curator_clients($1::TEXT)`, [curatorId]);
        console.log('Function result (TEXT):', JSON.stringify(test2.rows, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        pool.end();
    }
}
main();
