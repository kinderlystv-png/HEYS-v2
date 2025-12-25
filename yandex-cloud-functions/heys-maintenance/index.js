/**
 * heys-maintenance — Scheduled maintenance tasks
 * 
 * Functions:
 * - cleanup_security_logs: Remove old auth attempt logs (30 days)
 * - process_trial_queue: Assign trial offers to queued users
 * 
 * Trigger: Timer (every 5 minutes for trial queue, daily for cleanup)
 */

const { Pool } = require('pg');

// Database configuration
const pool = new Pool({
  host: process.env.PG_HOST,
  port: parseInt(process.env.PG_PORT || '6432'),
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  ssl: process.env.PG_SSL === 'require' ? { rejectUnauthorized: false } : false,
  max: 1,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
});

// Telegram configuration (без ПДн — только lead_id)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * Send Telegram notification (минимум ПДн — только ID)
 */
async function sendTelegramNotification(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('[Telegram] Not configured, skipping');
    return;
  }
  
  try {
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'Markdown',
      })
    });
    
    if (!response.ok) {
      console.warn('[Telegram] Failed to send:', response.status);
    }
  } catch (err) {
    console.error('[Telegram] Error:', err.message);
  }
}

/**
 * Process trial queue — assign offers to waiting users
 */
async function processTrialQueue(client) {
  console.log('[Trial Queue] Processing queue...');
  
  // 1. Expire old offers
  const expireResult = await client.query(`
    UPDATE trial_queue 
    SET status = 'expired', updated_at = now()
    WHERE status = 'offer' 
      AND offer_expires_at IS NOT NULL 
      AND offer_expires_at < now()
    RETURNING client_id
  `);
  
  if (expireResult.rowCount > 0) {
    console.log(`[Trial Queue] Expired ${expireResult.rowCount} offers`);
    
    // Логируем события
    for (const row of expireResult.rows) {
      await client.query(`
        INSERT INTO trial_queue_events (client_id, event_type, meta)
        VALUES ($1, 'offer_expired', '{"reason":"timeout"}')
      `, [row.client_id]);
    }
  }
  
  // 2. Assign new offers from queue
  // NOTE: assign_trials_from_queue returns jsonb with keys: assigned, expired, available_after
  const assignResult = await client.query(
    'SELECT assign_trials_from_queue($1) as result',
    [5] // Assign up to 5 at a time
  );
  
  const assignData = assignResult.rows[0]?.result || {};
  const assignedCount = assignData.assigned || 0;
  
  if (assignedCount > 0) {
    console.log(`[Trial Queue] Assigned ${assignedCount} new offers (expired: ${assignData.expired || 0})`);
    
    // Notify curator (без ПДн — только кол-во)
    await sendTelegramNotification(
      `🎟️ *Trial Queue*\n\n` +
      `Выдано ${assignedCount} новых offer.\n` +
      `Проверьте статус очереди в админке.`
    );
  }
  
  // 3. Get queue stats for logging
  const statsResult = await client.query(`
    SELECT 
      COUNT(*) FILTER (WHERE status = 'queued') as queued,
      COUNT(*) FILTER (WHERE status = 'offer') as offers,
      COUNT(*) FILTER (WHERE status = 'assigned') as assigned
    FROM trial_queue
  `);
  
  const stats = statsResult.rows[0] || {};
  console.log(`[Trial Queue] Stats: queued=${stats.queued || 0}, offers=${stats.offers || 0}, assigned=${stats.assigned || 0}`);
  
  return {
    expired: expireResult.rowCount || 0,
    assigned: assignedCount,
    stats
  };
}

/**
 * Cleanup old security logs
 */
async function cleanupSecurityLogs(client) {
  const result = await client.query(
    'SELECT public.cleanup_security_logs($1) as deleted_count',
    [30] // Keep 30 days
  );
  return result.rows[0]?.deleted_count || 0;
}

/**
 * Main handler for timer trigger
 * Supports multiple tasks via event.messages[0].details.trigger_id
 * - trial_queue: Process trial queue (every 5-10 minutes)
 * - daily_cleanup: Security logs cleanup (daily at 03:00 UTC)
 */
module.exports.handler = async (event, context) => {
  const triggerId = event.messages?.[0]?.details?.trigger_id || 'default';
  console.log(`[Maintenance] Starting task: ${triggerId}`);
  
  let client;
  try {
    client = await pool.connect();
    
    const results = {};
    
    // Determine which tasks to run
    const runTrialQueue = triggerId === 'trial_queue' || triggerId === 'all' || triggerId === 'default';
    const runCleanup = triggerId === 'daily_cleanup' || triggerId === 'all';
    
    // Process trial queue
    if (runTrialQueue) {
      results.trial_queue = await processTrialQueue(client);
    }
    
    // Cleanup security logs
    if (runCleanup) {
      results.cleanup = {
        deleted_count: await cleanupSecurityLogs(client)
      };
      console.log(`[Maintenance] Cleanup: deleted ${results.cleanup.deleted_count} old entries`);
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        trigger_id: triggerId,
        results,
        timestamp: new Date().toISOString(),
      }),
    };
    
  } catch (error) {
    console.error('[Maintenance] Error:', error.message);
    
    // Notify on critical errors
    if (error.message.includes('trial_queue') || error.message.includes('advisory')) {
      await sendTelegramNotification(
        `⚠️ *Maintenance Error*\n\n` +
        `Task: ${triggerId}\n` +
        `Error: ${error.message.slice(0, 100)}`
      );
    }
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        trigger_id: triggerId,
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
    };
    
  } finally {
    if (client) client.release();
  }
};
