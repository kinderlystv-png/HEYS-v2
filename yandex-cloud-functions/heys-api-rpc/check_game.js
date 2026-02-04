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

    const clientId = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';

    // Смотрим сколько дней дневника есть (для восстановления статистики)
    console.log('=== Дни дневника Poplanton ===');
    const days = await c.query(`
        SELECT k, 
               (v->>'meals')::text as meals_raw,
               jsonb_array_length(v->'meals') as meals_count,
               (v->>'waterMl')::int as water_ml,
               jsonb_array_length(v->'trainings') as trainings_count
        FROM client_kv_store 
        WHERE client_id='${clientId}' AND k LIKE 'heys_dayv2_%'
        ORDER BY k DESC LIMIT 30
    `);
    console.table(days.rows);

    // Подсчитаем статистику
    let totalProducts = 0;
    let totalWater = 0;
    let totalTrainings = 0;
    let totalDays = 0;
    let perfectDays = 0; // дни где meals >= 3

    for (const row of days.rows) {
        totalDays++;
        const mealsCount = row.meals_count || 0;
        totalProducts += mealsCount * 2; // примерно 2 продукта на приём
        if (row.water_ml > 0) totalWater++;
        if (row.trainings_count > 0) totalTrainings += row.trainings_count;
        if (mealsCount >= 3) perfectDays++;
    }

    console.log('\n=== Восстановленная статистика ===');
    console.log('Всего дней:', totalDays);
    console.log('Всего приёмов пищи (примерно продуктов):', totalProducts);
    console.log('Дней с водой:', totalWater);
    console.log('Всего тренировок:', totalTrainings);
    console.log('Хороших дней (>=3 приёма):', perfectDays);

    // Получаем текущие данные геймификации
    const current = await c.query(`
        SELECT v FROM client_kv_store 
        WHERE client_id='${clientId}' AND k='heys_game'
    `);

    const currentData = current.rows[0]?.v || {};
    console.log('\n=== Текущие данные heys_game ===');
    console.log('totalXP:', currentData.totalXP);
    console.log('level:', currentData.level);
    console.log('stats:', JSON.stringify(currentData.stats || {}));
    console.log('unlockedAchievements:', JSON.stringify(currentData.unlockedAchievements || []));

    // Восстанавливаем stats на основе данных дневника
    const restoredStats = {
        product_added: totalProducts,
        water_added: totalWater * 5, // в среднем 5 логов воды за день
        training_added: totalTrainings,
        sleep_logged: totalDays,
        weight_logged: Math.floor(totalDays / 3), // примерно 1/3 дней
        day_completed: perfectDays,
        perfect_day: Math.floor(perfectDays / 2), // половина хороших дней = идеальные
        advice_read: totalDays * 3 // примерно 3 совета в день
    };

    // Восстанавливаем achievements на основе counts
    const achievements = [];

    // Streak достижения (предполагаем что были)
    if (totalDays >= 7) achievements.push('streak_7');
    if (totalDays >= 3) achievements.push('streak_3');

    // Onboarding достижения
    if (totalProducts > 0) achievements.push('first_meal');
    if (totalWater > 0) achievements.push('first_water');
    if (totalTrainings > 0) achievements.push('first_training');

    // Quality достижения
    if (perfectDays >= 7) achievements.push('perfect_week');
    if (perfectDays > 0) achievements.push('perfect_day');

    // Level достижения
    if (currentData.level >= 5) achievements.push('level_5');

    // Activity достижения
    if (totalWater >= 7) achievements.push('water_day');

    console.log('\n=== Восстановленные данные ===');
    console.log('stats:', JSON.stringify(restoredStats));
    console.log('achievements:', JSON.stringify(achievements));

    // Формируем итоговые данные
    const restoredData = {
        ...currentData,
        stats: restoredStats,
        unlockedAchievements: achievements,
        updatedAt: new Date().toISOString()
    };

    console.log('\n=== Итоговые данные для сохранения ===');
    console.log(JSON.stringify(restoredData, null, 2));

    // РАСКОММЕНТИРУЙ ДЛЯ ЗАПИСИ:
    // await c.query(`
    //     UPDATE client_kv_store 
    //     SET v = $1, updated_at = NOW()
    //     WHERE client_id = $2 AND k = 'heys_game'
    // `, [JSON.stringify(restoredData), clientId]);
    // console.log('\n✅ Данные восстановлены!');

    await c.end();
}

main().catch(e => { console.error(e); c.end(); });
