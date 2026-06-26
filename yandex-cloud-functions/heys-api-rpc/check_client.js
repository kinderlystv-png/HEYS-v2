const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: 'rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net',
    port: 6432,
    database: 'heys_production',
    user: 'heys_admin',
    password: process.env.YC_PG_PASSWORD,
    ssl: { rejectUnauthorized: false }
  });
  
  await client.connect();
  
  const clientId = process.env.HEYS_DEBUG_CLIENT_ID;
  if (!clientId) {
    throw new Error('HEYS_DEBUG_CLIENT_ID is required');
  }
  
  console.log('=== ДАННЫЕ КЛИЕНТА', clientId, '===\n');
  
  // 1. Все записи клиента
  const all = await client.query(`
    SELECT k, 
           CASE WHEN v IS NOT NULL AND v::text != '{}' THEN 'plaintext' ELSE 'empty' END as v_status,
           CASE WHEN v_encrypted IS NOT NULL THEN 'encrypted' ELSE 'null' END as encrypted_status,
           key_version,
           updated_at
    FROM client_kv_store 
    WHERE client_id = $1
    ORDER BY updated_at DESC
  `, [clientId]);
  
  console.log('1. ВСЕ ЗАПИСИ:');
  console.table(all.rows);
  
  // 2. Зашифрованные записи с непустым v_encrypted
  const encrypted = await client.query(`
    SELECT k, 
           length(v_encrypted) as encrypted_bytes,
           key_version,
           v::text as plaintext_value
    FROM client_kv_store 
    WHERE client_id = $1 AND v_encrypted IS NOT NULL
  `, [clientId]);
  
  console.log('\n2. ЗАШИФРОВАННЫЕ ЗАПИСИ:');
  if (encrypted.rows.length > 0) {
    encrypted.rows.forEach(r => {
      console.log(`  - ${r.k}: ${r.encrypted_bytes} bytes, key_version=${r.key_version}`);
      console.log(`    plaintext v: ${r.plaintext_value?.substring(0, 100)}...`);
    });
  } else {
    console.log('  Нет зашифрованных записей');
  }
  const encKey = process.env.HEYS_ENCRYPTION_KEY;
  if (!encKey) {
    throw new Error('HEYS_ENCRYPTION_KEY is required');
  }
  
  console.log('\n3. ПОПЫТКА РАСШИФРОВКИ:');
  try {
    // Установим ключ в сессию
    await client.query(`SET heys.encryption_key = $1`, [encKey]);
    
    // Проверим есть ли функция decrypt_health_data
    const fnCheck = await client.query(`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_name = 'decrypt_health_data' AND routine_schema = 'public'
    `);
    
    if (fnCheck.rows.length === 0) {
      console.log('  ❌ Функция decrypt_health_data НЕ СУЩЕСТВУЕТ в БД!');
    } else {
      console.log('  ✅ Функция decrypt_health_data существует');
      
      // Попробуем расшифровать первую зашифрованную запись
      if (encrypted.rows.length > 0) {
        const testKey = encrypted.rows[0].k;
        const decrypted = await client.query(`
          SELECT k, decrypt_health_data(v_encrypted)::text as decrypted
          FROM client_kv_store 
          WHERE client_id = $1 AND k = $2
        `, [clientId, testKey]);
        
        console.log(`  Расшифровка ${testKey}:`, decrypted.rows[0]?.decrypted?.substring(0, 200));
      }
    }
  } catch (e) {
    console.log('  ❌ Ошибка расшифровки:', e.message);
  }
  
  // 4. Проверим что в plaintext колонке v
  const plaintext = await client.query(`
    SELECT k, v::text as value
    FROM client_kv_store 
    WHERE client_id = $1 AND v IS NOT NULL AND v::text != '{}'
    LIMIT 5
  `, [clientId]);
  
  console.log('\n4. PLAINTEXT ДАННЫЕ (v колонка):');
  if (plaintext.rows.length > 0) {
    plaintext.rows.forEach(r => {
      console.log('  - ' + r.k + ': ' + String(r.value || '').substring(0, 200) + '...');
    });
  } else {
    console.log('  Нет plaintext данных');
  }
  
  await client.end();
}

main().catch(console.error);
