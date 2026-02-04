const { Client } = require('pg');

const c = new Client({
    host: 'rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net',
    port: 6432,
    database: 'heys_production',
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    await c.connect();

    // Оба клиента для сброса
    const clients = [
        { id: 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a', name: 'Poplanton' },
        { id: '4545ee50-4f5f-4fc0-b862-7ca45fa1bafc', name: 'Клиент 4545ee50' }
    ];

    // Новые чистые данные геймификации
    const freshGameData = {
        version: 2,
        totalXP: 0,
        level: 1,
        unlockedAchievements: [],
        achievementProgress: {},
        dailyXP: {},
        dailyBonusClaimed: null,
        dailyActions: {},
        dailyMissions: null,
        weeklyChallenge: null,
        weeklyTrainings: null,
        earlyBirdDays: [],
        streakShieldUsed: null,
        stats: {
            bestStreak: 0,
            totalWater: 0,
            perfectDays: 0,
            totalProducts: 0,
            totalTrainings: 0,
            totalAdvicesRead: 0
        },
        createdAt: Date.now(),
        updatedAt: Date.now()
    };

    console.log('=== СБРОС ГЕЙМИФИКАЦИИ ===\n');

    for (const client of clients) {
        console.log(`📌 ${client.name} (${client.id})`);

        // Показываем текущие данные
        const current = await c.query(
            "SELECT v FROM client_kv_store WHERE client_id=$1 AND k='heys_game'",
            [client.id]
        );

        if (current.rows[0]) {
            const oldData = current.rows[0].v;
            console.log(`   Старые данные: XP=${oldData.totalXP || 0}, level=${oldData.level || 1}, achievements=${oldData.unlockedAchievements?.length || 0}`);
        } else {
            console.log('   Старых данных нет');
        }

        // Обновляем данные
        await c.query(`
            INSERT INTO client_kv_store (client_id, k, v, updated_at)
            VALUES ($1, 'heys_game', $2, NOW())
            ON CONFLICT (client_id, k) DO UPDATE SET v = $2, updated_at = NOW()
        `, [client.id, JSON.stringify(freshGameData)]);

        console.log(`   ✅ Сброшено: XP=0, level=1, achievements=0\n`);
    }

    console.log('=== ГОТОВО! ===');
    console.log('Теперь при следующем входе геймификация начнётся с нуля.');
    console.log('Защита v2.2 предотвратит перезапись богатых данных бедными.');

    await c.end();
}

main().catch(e => { console.error(e); c.end(); });
