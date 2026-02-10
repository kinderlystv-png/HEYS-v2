const pool = require('./shared/db-pool');

(async () => {
  try {
    const result = await pool.query(
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
      const client = result.rows[0];
      console.log('ID:', client.id);
      console.log('Name:', client.name);
      console.log('subscription_status:', client.subscription_status);
      console.log('trial_ends_at:', client.trial_ends_at);
      console.log('is_trial_active:', client.is_trial_active);
      console.log('current_time:', client.current_time);
      
      // Calculate effective status like in UI
      const now = Date.now();
      const trialEnds      const trialEnds      const trialEnds      const trialEnds      const trialEnds      const trita      const trialEnds      const  > now) ?       co: (client.subsc      const trialEnds      const tons      const trialEnds      const trialEnds      const tria;
                                                                                           age);
    process.exit(1);
  }
})();
