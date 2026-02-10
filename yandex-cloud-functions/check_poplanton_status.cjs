const { getPool } = require('./shared/db-pool');

(async () => {
  const pool = getPool();
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT id, name, subscription_status, trial_ends_at, 
              trial_ends_at > NOW() as is_trial_active,
              NOW() as current_time
       FROM clients 
       WHERE name = 'Poplanton'`
    );

    console.log('=== Poplanton Client Data ===');
    if (result.rows.length === 0) {
      console.log('NOT FOUND');
    } else {
      const row = result.rows[0];
      console.log('ID:', row.id);
      console.log('Name:', row.name);
      console.log('subscription_status:', row.subscription_status);
      console.log('trial_ends_at:', row.trial_ends_at);
      console.log('is_trial_active:', row.is_trial_active);
      console.log('current_time:', row.current_time);

      // Calculate effective status like in UI
      const now = Date.now();
      const trialEndsAt = row.trial_ends_at ? new Date(row.trial_ends_at).getTime() : null;
      const effectiveStatus = (trialEndsAt && trialEndsAt > now) ? 'trial' : (row.subscription_status || 'none');
      console.log('\nEffective Status (UI logic):', effectiveStatus);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
