/**
 * HEYS Pattern Availability Diagnostic v1.0
 * Проверяет почему 15/41 паттернов неактивны
 * 
 * Запуск: откройте консоль браузера на app.heyslab.ru и вставьте этот код
 */

(async function debugPatternAvailability() {
    console.log('🔍 HEYS Pattern Diagnostic v1.0\n');

    // 1. Получить дни с данными
    const profile = HEYS.profile;
    const clientId = profile?.id;

    if (!clientId) {
        console.error('❌ Нет profile.id — войдите в систему');
        return;
    }

    console.log(`👤 Client ID: ${clientId}`);
    console.log(`📧 Email: ${profile?.email || 'N/A'}`);

    // 2. Получить последние 30 дней
    const today = new Date();
    const daysData = [];

    for (let i = 0; i < 30; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];

        const dayData = U.lsGet(`heys_dayv2_${dateStr}`);
        if (dayData) {
            daysData.push({ ...dayData, date: dateStr });
        }
    }

    console.log(`\n📅 Всего дней с данными: ${daysData.length}/30`);

    if (daysData.length === 0) {
        console.error('❌ Нет данных — добавьте приёмы пищи');
        return;
    }

    // 3. Диагностика по категориям
    const diagnostics = {
        basics: {
            totalDays: daysData.length,
            daysWithMeals: daysData.filter(d => d.meals?.length > 0).length,
            avgProductsPerDay: 0,
            avgMealsPerDay: 0
        },
        sleep: {
            daysWithSleepHours: 0,
            daysWithSleepTimes: 0,
            avgSleepHours: 0
        },
        psychology: {
            daysWithStress: 0,
            daysWithMood: 0,
            avgStress: 0,
            avgMood: 0
        },
        body: {
            daysWithWeight: 0,
            daysWithBiceps: 0,
            daysWithThigh: 0,
            daysWithFatPct: 0
        },
        cycle: {
            daysWithCycleData: 0
        },
        micronutrients: {
            productsWithIron: 0,
            productsWithVitaminC: 0,
            productsWithCalcium: 0,
            totalProducts: 0
        }
    };

    // 4. Анализ данных
    const pIndex = HEYS.products;
    let totalProducts = 0;
    let totalMeals = 0;
    let totalSleepHours = 0;
    let sleepCount = 0;
    let totalStress = 0;
    let stressCount = 0;
    let totalMood = 0;
    let moodCount = 0;

    const productsSeen = new Set();

    for (const day of daysData) {
        // Meals
        if (day.meals?.length > 0) {
            totalMeals += day.meals.length;

            for (const meal of day.meals) {
                if (meal.items?.length > 0) {
                    totalProducts += meal.items.length;

                    for (const item of meal.items) {
                        const productId = String(item.product_id || item.productId || item.id || '').toLowerCase();
                        productsSeen.add(productId);

                        const prod = pIndex?.byId?.get?.(productId);
                        if (prod) {
                            if (prod.iron) diagnostics.micronutrients.productsWithIron++;
                            if (prod.vitamin_c) diagnostics.micronutrients.productsWithVitaminC++;
                            if (prod.calcium) diagnostics.micronutrients.productsWithCalcium++;
                        }
                    }
                }

                // Psychology data в meals
                if (meal.stress) {
                    totalStress += meal.stress;
                    stressCount++;
                }
                if (meal.mood) {
                    totalMood += meal.mood;
                    moodCount++;
                }
            }
        }

        // Sleep
        if (day.sleepHours) {
            diagnostics.sleep.daysWithSleepHours++;
            totalSleepHours += day.sleepHours;
            sleepCount++;
        }
        if (day.sleepStart && day.sleepEnd) {
            diagnostics.sleep.daysWithSleepTimes++;
        }

        // Psychology data в day
        if (day.stressAvg) {
            diagnostics.psychology.daysWithStress++;
            totalStress += day.stressAvg;
            stressCount++;
        }
        if (day.moodAvg) {
            diagnostics.psychology.daysWithMood++;
            totalMood += day.moodAvg;
            moodCount++;
        }

        // Body measurements
        if (day.weight) diagnostics.body.daysWithWeight++;
        if (day.measurements?.biceps) diagnostics.body.daysWithBiceps++;
        if (day.measurements?.thigh) diagnostics.body.daysWithThigh++;
        if (day.measurements?.fatPct) diagnostics.body.daysWithFatPct++;

        // Cycle
        if (day.cycleDay || day.cyclePhase) {
            diagnostics.cycle.daysWithCycleData++;
        }
    }

    // 5. Средние значения
    diagnostics.basics.avgProductsPerDay = (totalProducts / daysData.length).toFixed(1);
    diagnostics.basics.avgMealsPerDay = (totalMeals / daysData.length).toFixed(1);
    diagnostics.sleep.avgSleepHours = sleepCount > 0 ? (totalSleepHours / sleepCount).toFixed(1) : 0;
    diagnostics.psychology.avgStress = stressCount > 0 ? (totalStress / stressCount).toFixed(1) : 0;
    diagnostics.psychology.avgMood = moodCount > 0 ? (totalMood / moodCount).toFixed(1) : 0;
    diagnostics.micronutrients.totalProducts = productsSeen.size;

    // 6. Вывод
    console.log('\n═══════════════════════════════════════════════');
    console.log('📊 ДИАГНОСТИКА ДАННЫХ');
    console.log('═══════════════════════════════════════════════\n');

    console.log('🍽️  БАЗОВЫЕ ДАННЫЕ:');
    console.log(`   Дней с приёмами пищи: ${diagnostics.basics.daysWithMeals}/${diagnostics.basics.totalDays}`);
    console.log(`   Среднее приёмов/день: ${diagnostics.basics.avgMealsPerDay}`);
    console.log(`   Среднее продуктов/день: ${diagnostics.basics.avgProductsPerDay}`);
    console.log(`   Уникальных продуктов: ${diagnostics.micronutrients.totalProducts}\n`);

    console.log('😴 СОН:');
    console.log(`   Дней с данными сна: ${diagnostics.sleep.daysWithSleepHours}`);
    console.log(`   Дней с временем сна: ${diagnostics.sleep.daysWithSleepTimes}`);
    console.log(`   Средняя длительность: ${diagnostics.sleep.avgSleepHours}ч\n`);

    console.log('🧠 ПСИХОЛОГИЯ:');
    console.log(`   Дней с данными стресса: ${diagnostics.psychology.daysWithStress}`);
    console.log(`   Дней с данными настроения: ${diagnostics.psychology.daysWithMood}`);
    console.log(`   Средний стресс: ${diagnostics.psychology.avgStress}/5`);
    console.log(`   Среднее настроение: ${diagnostics.psychology.avgMood}/5\n`);

    console.log('💪 ТЕЛО:');
    console.log(`   Дней с весом: ${diagnostics.body.daysWithWeight}`);
    console.log(`   Дней с бицепсом: ${diagnostics.body.daysWithBiceps}`);
    console.log(`   Дней с бедром: ${diagnostics.body.daysWithThigh}`);
    console.log(`   Дней с % жира: ${diagnostics.body.daysWithFatPct}\n`);

    console.log('🩸 ЦИКЛ:');
    console.log(`   Дней с данными цикла: ${diagnostics.cycle.daysWithCycleData}\n`);

    console.log('🥗 МИКРОНУТРИЕНТЫ:');
    console.log(`   Продуктов с железом: ${diagnostics.micronutrients.productsWithIron}`);
    console.log(`   Продуктов с витамином C: ${diagnostics.micronutrients.productsWithVitaminC}`);
    console.log(`   Продуктов с кальцием: ${diagnostics.micronutrients.productsWithCalcium}\n`);

    // 7. Недостающие паттерны
    console.log('═══════════════════════════════════════════════');
    console.log('❌ НЕАКТИВНЫЕ ПАТТЕРНЫ И ПРИЧИНЫ');
    console.log('═══════════════════════════════════════════════\n');

    const inactivePatterns = [];

    // Protein Satiety, Fiber — нужно >= 7 дней с meals
    if (diagnostics.basics.daysWithMeals < 7) {
        inactivePatterns.push({
            pattern: 'Protein Satiety, Fiber Regularity',
            reason: `❌ Недостаточно дней с едой: ${diagnostics.basics.daysWithMeals}/7`,
            fix: `Добавьте ещё ${7 - diagnostics.basics.daysWithMeals} дней с приёмами пищи`
        });
    }

    // Average products check
    if (parseFloat(diagnostics.basics.avgProductsPerDay) < 3) {
        inactivePatterns.push({
            pattern: 'Micronutrient patterns',
            reason: `❌ Мало продуктов в день: ${diagnostics.basics.avgProductsPerDay}/3.0`,
            fix: 'Добавляйте больше разнообразных продуктов'
        });
    }

    // Sleep patterns
    if (diagnostics.sleep.daysWithSleepHours < 7 && diagnostics.sleep.daysWithSleepTimes < 7) {
        inactivePatterns.push({
            pattern: 'Sleep Quality',
            reason: `❌ Нет данных сна: ${Math.max(diagnostics.sleep.daysWithSleepHours, diagnostics.sleep.daysWithSleepTimes)}/7 дней`,
            fix: 'Начните отмечать время сна в приложении'
        });
    }

    // Psychology patterns
    if (diagnostics.psychology.daysWithStress < 7) {
        inactivePatterns.push({
            pattern: 'Stress Eating',
            reason: `❌ Нет данных стресса: ${diagnostics.psychology.daysWithStress}/7 дней`,
            fix: 'Отмечайте уровень стресса в приложении'
        });
    }

    if (diagnostics.psychology.daysWithMood < 7) {
        inactivePatterns.push({
            pattern: 'Mood-Food',
            reason: `❌ Нет данных настроения: ${diagnostics.psychology.daysWithMood}/7 дней`,
            fix: 'Отмечайте настроение в приложении'
        });
    }

    // Body patterns
    if (diagnostics.basics.totalDays < 14 || diagnostics.body.daysWithBiceps < 5) {
        inactivePatterns.push({
            pattern: 'Hypertrophy',
            reason: `❌ Недостаточно измерений тела: ${diagnostics.body.daysWithBiceps}/5 дней (нужно 14+ дней всего)`,
            fix: 'Измеряйте бицепс/бедро минимум 5 раз за 14 дней'
        });
    }

    if (diagnostics.body.daysWithWeight < 7) {
        inactivePatterns.push({
            pattern: 'Body Composition',
            reason: `❌ Мало данных веса: ${diagnostics.body.daysWithWeight}/7 дней`,
            fix: 'Взвешивайтесь регулярно (минимум 7 дней)'
        });
    }

    // Cycle
    if (diagnostics.cycle.daysWithCycleData < 14) {
        inactivePatterns.push({
            pattern: 'Cycle Patterns',
            reason: `❌ Нет данных цикла: ${diagnostics.cycle.daysWithCycleData}/14 дней`,
            fix: 'Отмечайте дни цикла в приложении (минимум 14 дней)'
        });
    }

    // Micronutrients
    if (diagnostics.micronutrients.productsWithIron < 20) {
        inactivePatterns.push({
            pattern: 'Vitamin Defense, Bone Health, B-Complex',
            reason: `❌ Мало продуктов с микронутриентами: ${diagnostics.micronutrients.productsWithIron} продуктов с железом`,
            fix: 'Добавляйте продукты богатые витаминами (зелень, мясо, рыба, молоко)'
        });
    }

    // Вывод
    if (inactivePatterns.length === 0) {
        console.log('✅ Все паттерны должны быть активны! Если нет — проверьте загрузку модулей.');
    } else {
        inactivePatterns.forEach((p, i) => {
            console.log(`${i + 1}. ${p.pattern}`);
            console.log(`   ${p.reason}`);
            console.log(`   💡 Решение: ${p.fix}\n`);
        });
    }

    console.log('═══════════════════════════════════════════════');
    console.log(`✅ Диагностика завершена (${inactivePatterns.length} проблем найдено)`);
    console.log('═══════════════════════════════════════════════\n');

    // 8. Копируем результат в буфер
    const summary = `HEYS Pattern Diagnostic
Дней с данными: ${diagnostics.basics.totalDays}
Недостающие паттерны: ${inactivePatterns.length}

${inactivePatterns.map(p => `• ${p.pattern}: ${p.reason}`).join('\n')}`;

    console.log('📋 Результат скопирован в буфер обмена');

    if (navigator.clipboard) {
        await navigator.clipboard.writeText(summary);
    }

    return { diagnostics, inactivePatterns };
})();
