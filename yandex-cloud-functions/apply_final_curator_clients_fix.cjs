const { getPool } = require('./shared/db-pool');
const fs = require('fs');
const path = require('path');

(async () => {
    const pool = getPool();
    const client = await pool.connect();

    try {
        const sqlPath = path.join(__dirname, 'migrations', '2026-02-10_fix_get_curator_clients_subscription_ends.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Применяю обновленную миграцию...');
        await client.query(sql);
        console.log('Готово!\n');
        console.log('Функция get_curator_clients теперь возвращает:');
        console.log('  - subscription_ends_at (для бэкендов)');
        console.log('  - active_until (для UI)');

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
})();
