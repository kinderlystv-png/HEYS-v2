const { Client } = require('pg');

async function main() {
    const hasConnStr = Boolean(process.env.DATABASE_URL);
    const client = hasConnStr
        ? new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
        : new Client({
            host: process.env.PG_HOST || 'rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net',
            port: process.env.PG_PORT ? Number(process.env.PG_PORT) : 6432,
            database: process.env.PG_DATABASE || 'heys_production',
            user: process.env.PG_USER || 'heys_rpc',
            password: process.env.PG_PASSWORD,
            ssl: { rejectUnauthorized: false },
        });

    await client.connect();

    const clientId = process.env.CLIENT_ID || '4545ee50-4f5f-4fc0-b862-7ca45fa1bafc';

    console.log('=== ДАННЫЕ КЛИЕНТА', clientId, '===\n');

    // 0. Опционально: сбросить флаг регистрации
    if (process.env.FIX_REGISTRATION_FLAG === 'true') {
        const res = await client.query(
            "UPDATE client_kv_store SET v = 'false'::jsonb WHERE client_id = $1 AND k = 'heys_registration_in_progress'",
            [clientId]
        );
        console.log('0. Сброс флага регистрации: updated_rows=', res.rowCount);
    }

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

    // 2. Зашифрованные записи
    const encrypted = await client.query(`
    SELECT k, 
           length(v_encrypted) as encrypted_bytes,
           key_version,
            v IS NOT NULL AND v::text != '{}' as has_plaintext
    FROM client_kv_store 
    WHERE client_id = $1 AND v_encrypted IS NOT NULL
  `, [clientId]);

    console.log('\n2. ЗАШИФРОВАННЫЕ ЗАПИСИ:');
    if (encrypted.rows.length > 0) {
        encrypted.rows.forEach(r => {
            console.log('  -', r.k, ':', r.encrypted_bytes, 'bytes, key_version=', r.key_version, ', has_plaintext=', r.has_plaintext);
        });
    } else {
        console.log('  Нет зашифрованных записей');
    }

    // 3. Попробуем расшифровать с ключом
    const encKey = process.env.HEYS_ENCRYPTION_KEY;

    console.log('\n3. ПОПЫТКА РАСШИФРОВКИ:');
    try {
        if (!encKey) {
            console.log('  HEYS_ENCRYPTION_KEY не задан — пропускаю расшифровку');
        } else {
            await client.query('SELECT set_config($1, $2, false)', ['heys.encryption_key', encKey]);
            const keyLen = await client.query("SELECT length(current_setting('heys.encryption_key', true)) as len");
            console.log('  Длина ключа в сессии:', keyLen.rows[0]?.len || 0);

            const fnCheck = await client.query(`
      SELECT routine_name FROM information_schema.routines 
      WHERE routine_name = 'decrypt_health_data' AND routine_schema = 'public'
    `);

            if (fnCheck.rows.length === 0) {
                console.log('  Функция decrypt_health_data НЕ СУЩЕСТВУЕТ!');
            } else {
                console.log('  Функция decrypt_health_data существует');

                if (encrypted.rows.length > 0) {
                    const decrypted = await client.query(`
          SELECT k,
                 (decrypt_health_data(v_encrypted) IS NULL) as is_null,
                 length(decrypt_health_data(v_encrypted)::text) as decrypted_len
          FROM client_kv_store
          WHERE client_id = $1 AND v_encrypted IS NOT NULL
          ORDER BY updated_at DESC
          LIMIT 5
        `, [clientId]);

                    console.log('  Диагностика расшифровки (до 5 записей):');
                    decrypted.rows.forEach((r) => {
                        console.log('   -', r.k, ': is_null=', r.is_null, ', length=', r.decrypted_len || 0);
                    });
                }
            }
        }
    } catch (e) {
        console.log('  Ошибка расшифровки:', e.message);
    }

    // 4. Plaintext данные
    const plaintext = await client.query(`
    SELECT k, v::text as value
    FROM client_kv_store 
    WHERE client_id = $1 AND v IS NOT NULL AND v::text != '{}'
    LIMIT 10
  `, [clientId]);

    console.log('\n4. PLAINTEXT ДАННЫЕ (v колонка):');
    if (plaintext.rows.length > 0) {
        plaintext.rows.forEach(r => {
            console.log('  -', r.k, ':', (r.value || '').substring(0, 150));
        });
    } else {
        console.log('  Нет plaintext данных');
    }

    await client.end();
}

main().catch(console.error);
