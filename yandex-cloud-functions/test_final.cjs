const { getPool } = require('./shared/db-pool');

(async () => {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    console.log('=== Финальная проверка защиты подписок ===\n');
    
    // Тест 1: Клиент с subscription_status = 'active'
    console.log('1️⃣ Тест: Клиент с subscription_status = active (Poplanton)');
    const poplanton = await client.query(
      `SELECT admin_activate_trial($1::uuid, CURRENT_DATE, 7, NULL)`,
      ['ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a']
    );
    const res1 = poplanton.rows[0].admin_activate_trial;
    console.log('   Результат:', res1.error || 'OK');
    console.log('   ' + (res1.success ? '❌ БАГ: Триал активирован!' : '✅ Защита сработала'));
    
    // Тест 2: Клиент с subscription_status = 'active' (Александра)
    console.    console.    console.    console.    console.    console.    console.    console.    console
    const alexandra = await client.query(
      `SE      `SE  activate_trial($1::uuid, CURRE      `SE      `SE  activate4545ee50-4f5f-4fc0-b862-7ca45fa1bafc']
    );
    const res2 = alexandra.rows[0].admin_activate_trial;
    console.log('   Результат:', res2.error || 'OK');
    console.log('   ' + (res2.success ? '❌ БАГ: Триал активирован!' : '✅ Защита сработала'));
    
    console.log('\n===     console.log('\n===     console.log('\n===     console.log('\n===��    console.log('\n===     console.log('\nиски р�    console.log('\n===     console.log('\n===     conso� active подпиской НЕ МОГУТ активировать триал');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
