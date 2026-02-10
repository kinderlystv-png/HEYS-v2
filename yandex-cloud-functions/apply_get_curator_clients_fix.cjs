const { getPool } = require('./shared/db-pool');
const fs = require('fs');
const path = require('path');

(async () => {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    const sqlPath = path.join(__dirname, 'migrations', '2026-02-10_fix_get_curator_clients_subscription_ends.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('Применяю миграцию: 2026-02-10_fix_get_curator_clients_subscription_ends.sql');
    await client.query(sql);
    console.log('Миграция успешно применена\n');
    
    // Проверка результата
    console.log('=== Тест: get_curator_clients ===');
    const result = await client.query(
      `SELECT * FROM get_curator_clients($1::uuid)`,
      ['6d4dbb32-0176-402e-afb3-330adf7f5462']
    );
    
    result.rows.forEach(row => {
      console.log(`\n${row.name}:`);
                                                                                                               ow                                               pt                        ri                         
    
    
     (erro     (erro    le.error('Er     (erro     (erro    le.error('Erxit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
