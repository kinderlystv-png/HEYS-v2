const { getPool } = require('./shared/db-pool');

(async () => {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'subscriptions'
      ORDER BY ordinal_position
    `);
    
    console.log('=== Схема таблицы subscriptions ===\n');
    result.rows.forEach(row => {
      console.log(`${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
