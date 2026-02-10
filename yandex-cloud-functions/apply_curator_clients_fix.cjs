const { getPool } = require('./shared/db-pool');
const fs = require('fs');
const path = require('path');

(async () => {
    const pool = getPool();
    const client = await pool.connect();

    try {
        const sqlPath = path.join(__dirname, 'migrations', '2026-02-10_fix_get_curator_clients_subscription_ends.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Применяю миграцию...');
        await client.query(sql);
        console.log('Готово!\n');

        // Тест
        console.log('=== Тест get_curator_clients ===\n');
        const result = await client.query(
            `SELECT * FROM get_curator_clients($1::uuid)`,
            ['6d4dbb32-0176-402e-afb3-330adf7f5462']
        );

        result.rows.forEach(row => {
            const subEnds = row.subscription_ends_at ? new Date(row.subscription_ends_at).toISOString().split('T')[0] : 'NULL';
            console.log(`${row.name}: ${row.subscription_status}, ends: ${subEnds}`);
        });

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
})();
