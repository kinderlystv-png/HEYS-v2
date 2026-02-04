const { Client } = require('pg');
const fs = require('fs');

const client = new Client({
    host: 'rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net',
    port: 6432,
    database: 'heys_production',
    user: 'heys_admin',
    password: 'heys007670',
    ssl: { rejectUnauthorized: true, ca: fs.readFileSync('./certs/root.crt').toString() }
});

async function check() {
    await client.connect();

    // Смотрим ТОЛЬКО клиента ccfe6ea3
    const gameKeys = await client.query(`
    SELECT k, v, updated_at
    FROM client_kv_store 
    WHERE client_id = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a'
      AND (k LIKE '%game%' OR k LIKE '%gamification%')
    ORDER BY updated_at DESC
  `);

    console.log('=== GAME KEYS FOR ccfe6ea3 ===');
    gameKeys.rows.forEach(r => {
        const v = r.v || {};
        console.log(`k=${r.k}`);
        console.log(`  XP=${v.totalXP}, level=${v.level}`);
        console.log(`  stats:`, JSON.stringify(v.stats || {}));
        console.log(`  achievements:`, v.unlockedAchievements?.length || 0);
        console.log(`  updated=${r.updated_at}`);
        console.log('---');
    });

    await client.end();
}

check().catch(console.error);
