const { getPool } = require('./shared/db-pool');

(async () => {
    const pool = getPool();
    const client = await pool.connect();

    try {
        const ids = [
            'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a', // Poplanton
            '4545ee50-4f5f-4fc0-b862-7ca45fa1bafc'  // Александра
        ];

        console.log('=== До обновления ===');
        for (const id of ids) {
            const result = await client.query(
                `SELECT id, name, subscription_status, trial_ends_at, 
                trial_ends_at > NOW() as is_trial_active
         FROM clients 
         WHERE id = $1`,
                [id]
            );

            if (result.rows.length > 0) {
                const row = result.rows[0];
                console.log(`\n${row.name}:`);
                console.log('  subscription_status:', row.subscription_status);
                console.log('  trial_ends_at:', row.trial_ends_at);
                console.log('  is_trial_active:', row.is_trial_active);
            }
        }

        // Сбрасываем trial_ends_at для обоих клиентов
        console.log('\n\n=== Обновление ===');
        const updateResult = await client.query(
            `UPDATE clients 
       SET trial_ends_at = NULL 
       WHERE id = ANY($1::uuid[])
       RETURNING id, name, subscription_status, trial_ends_at`,
            [ids]
        );

        console.log('Обновлено клиентов:', updateResult.rowCount);
        updateResult.rows.forEach(row => {
            console.log(`  ✅ ${row.name}: trial_ends_at = ${row.trial_ends_at}`);
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
})();
