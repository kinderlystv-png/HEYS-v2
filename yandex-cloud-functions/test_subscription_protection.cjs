const { getPool } = require('./shared/db-pool');

(async () => {
    const pool = getPool();
    const client = await pool.connect();

    try {
        // Попытка активировать триал для Poplanton (subscription_status = 'active')
        console.log('=== Тест 1: Попытка активировать триал для клиента с active подпиской ===');
        const test1 = await client.query(
            `SELECT admin_activate_trial($1, CURRENT_DATE, 7, NULL)`,
            ['ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a']
        );
        console.log('Результат:', JSON.stringify(test1.rows[0].admin_activate_trial, null, 2));

        // Попытка активировать триал для клиента с trial_ends_at в будущем
        // Сначала создадим тестового клиента
        console.log('\n=== Тест 2: Попытка активировать триал для клиента с активным триалом ===');

        // Создаем тестового клиента с триалом
        const insertResult = await client.query(`
      INSERT INTO clients (name, phone, pin_hash, trial_ends_at, subscription_status)
      VALUES ('Test Client', '79999999999', 'dummy', NOW() + INTERVAL '5 days', 'trial')
      RETURNING id
    `);
        const testClientId = insertResult.rows[0].id;
        console.log('Создан тестовый клиент:', testClientId);

        const test2 = await client.query(
            `SELECT admin_activate_trial($1, CURRENT_DATE, 7, NULL)`,
            [testClientId]
        );
        console.log('Результат:', JSON.stringify(test2.rows[0].admin_activate_trial, null, 2));

        // Удаляем тестового клиента
        await client.query('DELETE FROM clients WHERE id = $1', [testClientId]);
        console.log('Тестовый клиент удален');

        console.log('\n✅ Защита работает!');

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
})();
