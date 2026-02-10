const { getPool } = require('./shared/db-pool');

(async () => {
    const pool = getPool();
    const client = await pool.connect();

    try {
        // Найдем curator_id для Poplanton и Александра
        const clientsResult = await client.query(`
      SELECT id, name, curator_id FROM clients 
      WHERE name IN ('Poplanton', 'Александра')
    `);

        console.log('=== Клиенты ===');
        clientsResult.rows.forEach(row => {
            console.log(`${row.name}: curator_id = ${row.curator_id}`);
        });

        if (clientsResult.rows.length > 0) {
            const curatorId = clientsResult.rows[0].curator_id;
            console.log(`\n=== get_curator_clients для curator ${curatorId} ===\n`);

            const result = await client.query(
                `SELECT * FROM get_curator_clients($1::uuid)`,
                [curatorId]
            );

            result.rows.forEach(row => {
                const subEnds = row.subscription_ends_at ?
                    new Date(row.subscription_ends_at).toISOString().split('T')[0] :
                    'NULL';
                console.log(`${row.name}: status=${row.subscription_status}, ends=${subEnds}`);
            });
        }

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
})();
