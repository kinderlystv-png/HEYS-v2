const { getPool } = require('./shared/db-pool');
const fs = require('fs');
const path = require('path');

(async () => {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    const sqlPath = path.join(__dirname, 'migrations', '2026-02-10_subscription_protection.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('📄 Применяю миграцию: 2026-02-10_subscription_protection.sql');
    await client.query(sql);
    console.log('✅ Миграция успешно применена\n');
    
    // Проверка функций
    console.log('=== Проверка обновленных функций ===');
    const funcs = await client.query(`
      SELECT proname, pg_get_function_identity_arguments(oid) as args
      FROM pg_proc 
      WHERE proname IN ('admin_activate_trial', 'admin_convert_lead')
      ORDER BY proname
    `);
    
    funcs.rows.forEach(row => {
      console.log(`✅ ${row.proname}(${row.args})`);
    });
    
  } catc  } catc  } catc  } catc  } catc  } catc  } error  } catc  } catc  } ca.exit(1);
  } finally {
    client.    clien;
                          })();
