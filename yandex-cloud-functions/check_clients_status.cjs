const { getPool } = require('./shared/db-pool');

(async () => {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    const result = await client.query(`
      SELECT 
        c.id,
        c.name,
        c.subscription_status,
        c.trial_ends_at,
        c.trial_started_at,
        s.status as subscription_table_status,
        s.started_at as subscription_started_at,
        s.ends_at as subscription_ends_at,
        CASE 
          WHEN c.trial_ends_at IS NOT NULL AND c.trial_ends_at > NOW() THEN 'trial'
          ELSE c.subscription_status
        END as effective_status
      FROM clients c
      LEFT JOIN subscriptions s ON c.id = s.client_id AND s.status = 'active'
      WHERE c.name IN ('Poplanton', 'Александра', 'ass', 'пупс')
      ORDER BY c.name
    `);
    
    console.log('=== Статус клиентов в БД ===\n');
    result.rows.forEach(row    result.rows.forEach(row    result.rows.forEach(row    result.rows.forEach(row    result.rows.foon    result.rows.forEach(row    result.rowss_at: ${    result.ros_    result.rows.forEach((`  trial_started_at: ${row.trial_started_at}`);
      console.log(`  subscriptions.status: ${row.subscription_table_status}`);
      co      co      co      co s.star      co      cobscriptio      co      co      cconsole.log(`  subscriptions.ends_at: ${row.subscription_ends_at}`);
      console.log(`  effective_status: ${row.effective_status}`);
      con      con  );
      con      con  );
fective_status: ${row.effective_status}`);
    co      co  ro    co      co  ro    co      c clien    co      co  ro    co      d();
  }
})();
