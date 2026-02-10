const { getPool } = require('./shared/db-pool');

(async () => {
    const pool = getPool();
    const client = await pool.connect();

    try {
        const clients_data = [
            { id: 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a', name: 'Poplanton' },
            { id: '4545ee50-4f5f-4fc0-b862-7ca45fa1bafc', name: 'Александра' }
        ];

        console.log('=== Исправление подписок ===\n');

        for (const { id, name } of clients_data) {
            // Проверяем существующую подписку
            const existing = await client.query(
                'SELECT * FROM subscriptions WHERE client_id = $1',
                [id]
            );

            if (existing.rows.length === 0) {
                // Создаем новую подписку на 1 год
                await client.query(`
          INSERT INTO subscriptions (client_id, active_until)
          VALUES ($1, NOW() + INTERVAL '1 year')
        `, [id]);

                console.log(`${name}: Создана подписка на 1 год`);
            } else {
                const sub = existing.rows[0];

                if (!sub.active_until || new Date(sub.active_until) < new Date()) {
                    // Обновляем active_until
                    await client.query(`
            UPDATE subscriptions 
            SET active_until = NOW() + INTERVAL '1 year',
                updated_at = NOW()
            WHERE client_id = $1
          `, [id]);
                    console.log(`${name}: Обновлена подписка на 1 год`);
                } else {
                    console.log(`${name}: Подписка уже активна до ${sub.active_until.toISOString().split('T')[0]}`);
                }
            }
        }

        console.log('\n=== Результат ===\n');
        const result = await client.query(`
      SELECT 
        c.name,
        c.subscription_status,
        s.active_until
      FROM clients c
      LEFT JOIN subscriptions s ON c.id = s.client_id
      WHERE c.name IN ('Poplanton', 'Александра')
      ORDER BY c.name
    `);

        result.rows.forEach(row => {
            const activeUntil = row.active_until ? row.active_until.toISOString().split('T')[0] : 'NULL';
            console.log(`${row.name}: ${row.subscription_status}, active_until: ${activeUntil}`);
        });

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
})();
