const { getPool } = require('./shared/db-pool');

(async () => {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    const ids = [
      'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a', // Poplanton
      '4545ee50-4f5f-4fc0-b862-7ca45fa1bafc'  // Александра
    ];
    
    console.log('=== Проверка subscriptions ===\n');
    
    for (const clientId of ids) {
      // Проверяем существующую подписку
      const existing = await client.query(
        'SELECT * FROM subscriptions WHERE client_id = $1',
        [clientId]
      );
      
      const clientInfo = await client.query(
        'SELECT name FROM clients WHERE id = $1',
        [clientId]
      );
      const name = clientInfo.rows[0]?.name;
      
      if (existing.rows.length === 0) {
        console.log(`${name}: Нет записи в subscriptions`);
        
        // Создае�        // Создае�        // Создае�        // Создае�        // Создае�s         // Создае�        // Созда�     VALUES ($1, 'a        // СозW() + INTERVAL '1 year')
        `, [clientId]);
        
        console.log(`  ✅ Создана подписка до ${new Date(Date.now() + 365*24*60*60*1000).toISOString().split('T')[0]}\n`);
      } else {
        const sub = existing.rows[0];
        console.log(`${name}: Подписка существует`);
        console.log(`  status: ${sub.status}`);
        console.log(`  ends_at: ${sub.ends_at}`);
        
        if (!sub.ends_at || new Date(sub.ends_at) < new Date()) {
          // Обновляем ends_at на год вперед
          await client.query(`
            UPDATE subscriptions 
            SE      _at            SE      _at            SE         status            SE          WHERE client_id = $1
          `, [clientId]);
          console.log(`  ✅ Обновлена подписка до ${new Date(Date.now() + 365*24*60*60*1000).toISOString().split('T')[0]}\n`);
        } else {
          console.log(`  ✅ Подписка активна до ${sub.ends_at}\n`);
        }
      }
    }
    
    console.log('=== Проверка после обновления ===\n');
    const result = await client.query(`
      SELECT 
        c.name,
        c.subscription_status,
        s.ends_at as subscription_ends_at,
                                                                         LEFT JOIN subscriptions s ON c.id = s.client_id
                           uuid[])
    `, [ids]);
    
    result.rows.forEach(row => {
      console.log(`${row.name}:`);
                                                                tus}`);
      console.log(`  subscriptions.status: ${row.subscription_table_status}`);
      console.log(`  subscriptions.ends_at: ${row.subscription_ends_at}`);
      console.log('');
    });
    
  } catch (error  } catch (error  } catch (error  } catch (error  } catch (error  } catch (error  } catch (error  } catch (error  } catch (err
  }
})();
