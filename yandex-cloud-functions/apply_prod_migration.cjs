const { getPool } = require('./shared/db-pool');
const fs = require('fs');
const path = require('path');

(async () => {
    const pool = getPool();
    const client = await pool.connect();

    try {
        const sqlPath = path.join(__dirname, 'migrations', '2026-02-10_fix_get_curator_clients_subscription_ends.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('📄 Применяю миграцию на продакшн БД...');
        await client.query(sql);
        console.log('✅ Миграция применена\n');

        // Проверка что active_until есть в результате
        console.log('=== Тест: проверка колонок ===');
        const test = await client.query(`
      SELECT * FROM get_curator_clients('6d4dbb32-0176-402e-afb3-330adf7f5462'::uuid)
      LIMIT 1
    `);

        if (test.rows.length > 0) {
            const cols = Object.keys(test.rows[0]);
            console.log('Колонки:', cols.join(', '));
            console.log('\n✅ active_until:', cols.includes('active_until') ? 'ЕСТЬ' : 'НЕТ');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
})();
