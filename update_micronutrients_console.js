/**
 * 🥗 HEYS Micronutrients Update Script
 * 
 * Usage: Скопируйте весь файл и вставьте в консоль браузера на https://app.heyslab.ru
 * 
 * Шаги:
 * 1. Откройте https://app.heyslab.ru
 * 2. Откройте DevTools (F12)
 * 3. Скопируйте и вставьте этот файл целиком
 * 4. Выполнится автоматически
 */

(async function updateMicronutrientsConsole() {
    console.log('🥗 HEYS Micronutrients Update — Console Version v1.0\n');
    console.log('═══════════════════════════════════════════════════════\n');

    // Проверка окружения
    if (!window.HEYS?.YandexAPI?.rest) {
        console.error('❌ HEYS.YandexAPI.rest не доступен');
        console.error('   Убедитесь что вы на https://app.heyslab.ru и PWA загружено');
        return;
    }

    // === ШАГ 1: Загрузка products из API ===
    console.log('📥 ШАГ 1: Загрузка products из API...\n');

    try {
        const result = await HEYS.YandexAPI.rest('shared_products', {
            limit: 500,
            order: 'created_at.desc'
        });

        if (result.error) {
            throw new Error(result.error.message || result.error);
        }

        const products = result.data || [];
        console.log(`✅ Получено продуктов: ${products.length}`);

        // Подсчёт микронутриентов
        const withIron = products.filter(p => p.iron && parseFloat(p.iron) > 0).length;
        const withVitC = products.filter(p => p.vitamin_c && parseFloat(p.vitamin_c) > 0).length;
        const withCalc = products.filter(p => p.calcium && parseFloat(p.calcium) > 0).length;
        const withMagnesium = products.filter(p => p.magnesium && parseFloat(p.magnesium) > 0).length;
        const withZinc = products.filter(p => p.zinc && parseFloat(p.zinc) > 0).length;

        console.log(`\n📊 Микронутриенты в API:`);
        console.log(`   🥗 Железо (iron):     ${withIron} продуктов`);
        console.log(`   🍊 Витамин C:         ${withVitC} продуктов`);
        console.log(`   🥛 Кальций:           ${withCalc} продуктов`);
        console.log(`   🧲 Магний:            ${withMagnesium} продуктов`);
        console.log(`   🛡️  Цинк:             ${withZinc} продуктов`);

        // Топ-3 примеров
        const topIron = products
            .filter(p => p.iron && parseFloat(p.iron) > 0)
            .sort((a, b) => parseFloat(b.iron) - parseFloat(a.iron))
            .slice(0, 3);

        const topVitC = products
            .filter(p => p.vitamin_c && parseFloat(p.vitamin_c) > 0)
            .sort((a, b) => parseFloat(b.vitamin_c) - parseFloat(a.vitamin_c))
            .slice(0, 3);

        console.log(`\n🏆 Топ-3 по железу:`);
        topIron.forEach(p => console.log(`   • ${p.name}: ${p.iron} мг`));

        console.log(`\n🏆 Топ-3 по витамину C:`);
        topVitC.forEach(p => console.log(`   • ${p.name}: ${p.vitamin_c} мг`));

        // === ШАГ 2: Сохранение в localStorage ===
        console.log(`\n💾 ШАГ 2: Сохранение в localStorage...\n`);

        if (HEYS.store?.set) {
            HEYS.store.set('heys_products', products);
            console.log('✅ Сохранено через HEYS.store.set');
        } else if (HEYS.utils?.lsSet) {
            HEYS.utils.lsSet('heys_products', products);
            console.log('✅ Сохранено через HEYS.utils.lsSet');
        } else {
            throw new Error('Нет методов для сохранения products');
        }

        // Обновить глобальный индекс
        if (HEYS.products?.setAll) {
            HEYS.products.setAll(products, { source: 'micronutrients-update' });
            console.log('✅ Обновлён HEYS.products.setAll');
        }

        // Инвалидировать кэш
        if (HEYS.cloud?.invalidateSharedProductsCache) {
            HEYS.cloud.invalidateSharedProductsCache();
            console.log('✅ Кэш shared products инвалидирован');
        }

        // === ШАГ 3: Проверка products в памяти ===
        console.log(`\n🔍 ШАГ 3: Проверка products в памяти...\n`);

        let loadedProducts = [];
        if (HEYS.products?.getAll) {
            loadedProducts = HEYS.products.getAll();
        } else if (HEYS.store?.get) {
            loadedProducts = HEYS.store.get('heys_products', []);
        } else if (HEYS.utils?.lsGet) {
            loadedProducts = HEYS.utils.lsGet('heys_products', []);
        }

        const loadedWithIron = loadedProducts.filter(p => p.iron && parseFloat(p.iron) > 0).length;
        const loadedWithVitC = loadedProducts.filter(p => p.vitamin_c && parseFloat(p.vitamin_c) > 0).length;
        const loadedWithCalc = loadedProducts.filter(p => p.calcium && parseFloat(p.calcium) > 0).length;

        console.log(`✅ Загружено в память: ${loadedProducts.length} продуктов`);
        console.log(`   🥗 С железом: ${loadedWithIron}`);
        console.log(`   🍊 С витамином C: ${loadedWithVitC}`);
        console.log(`   🥛 С кальцием: ${loadedWithCalc}`);

        if (loadedWithIron === 0 && withIron > 0) {
            console.warn('⚠️  WARNING: Микронутриенты не сохранились в localStorage');
            console.warn('   Попробуйте: location.reload() и запустите скрипт снова');
        }

        // === ШАГ 4: Очистка кэша инсайтов ===
        console.log(`\n🗑️  ШАГ 4: Очистка кэша инсайтов...\n`);

        if (HEYS.InsightsPI?.clearCache) {
            HEYS.InsightsPI.clearCache();
            console.log('✅ Кэш инсайтов очищен');
        } else {
            console.warn('⚠️  HEYS.InsightsPI.clearCache не доступен');
        }

        // === ШАГ 5: Перезапуск инсайтов ===
        console.log(`\n🧠 ШАГ 5: Перезапуск инсайтов...\n`);

        if (!HEYS.InsightsPI?.analyzeAll) {
            console.warn('⚠️  HEYS.InsightsPI.analyzeAll не доступен');
            console.warn('   Инсайты обновятся при следующей загрузке дневника');
        } else {
            const insights = await HEYS.InsightsPI.analyzeAll();

            const patterns = insights?.patterns || [];
            const activePatterns = patterns.filter(p => p.available || p.hasPattern);
            const inactivePatterns = patterns.filter(p => !p.available && !p.hasPattern);

            console.log(`✅ Инсайты перезапущены`);
            console.log(`   📊 Активно: ${activePatterns.length}/${patterns.length} паттернов`);

            // Micronutrient patterns
            const microPatterns = patterns.filter(p =>
                p.pattern?.includes('vitamin') ||
                p.pattern?.includes('Vitamin') ||
                p.pattern?.includes('iron') ||
                p.pattern?.includes('Iron') ||
                p.pattern?.includes('bone') ||
                p.pattern?.includes('Bone') ||
                p.pattern?.includes('magnesium') ||
                p.pattern?.includes('Magnesium') ||
                p.pattern?.includes('zinc') ||
                p.pattern?.includes('Zinc') ||
                p.pattern?.includes('anemia') ||
                p.pattern?.includes('Anemia')
            );

            const activeMicro = microPatterns.filter(p => p.available || p.hasPattern);
            const inactiveMicro = microPatterns.filter(p => !p.available && !p.hasPattern);

            console.log(`\n🥗 Микронутриенты паттерны:`);
            console.log(`   ✅ Активно: ${activeMicro.length}/${microPatterns.length}`);

            if (activeMicro.length > 0) {
                console.log(`\n   Активные:`);
                activeMicro.forEach(p => {
                    console.log(`   ✅ ${p.pattern}`);
                });
            }

            if (inactiveMicro.length > 0) {
                console.log(`\n   Неактивные:`);
                inactiveMicro.forEach(p => {
                    console.log(`   ❌ ${p.pattern}: ${p.reason || 'N/A'}`);
                });
            }

            // Все неактивные паттерны
            if (inactivePatterns.length > 0) {
                console.log(`\n❌ Все неактивные паттерны (${inactivePatterns.length}):`);
                inactivePatterns.forEach(p => {
                    console.log(`   • ${p.pattern}: ${p.reason || 'N/A'}`);
                });
            }
        }

        // === ИТОГО ===
        console.log(`\n═══════════════════════════════════════════════════════`);
        console.log(`✅ ОБНОВЛЕНИЕ ЗАВЕРШЕНО`);
        console.log(`═══════════════════════════════════════════════════════\n`);

        console.log(`📊 Результат:`);
        console.log(`   • Загружено из API: ${products.length} продуктов`);
        console.log(`   • С микронутриентами: ${withIron} Fe, ${withVitC} VitC, ${withCalc} Ca`);
        console.log(`   • Сохранено в localStorage: ✅`);
        console.log(`   • Обновлён HEYS.products: ✅`);
        console.log(`   • Кэш очищен: ✅`);

        if (HEYS.InsightsPI?.analyzeAll) {
            const patterns = (await HEYS.InsightsPI.analyzeAll())?.patterns || [];
            const active = patterns.filter(p => p.available || p.hasPattern).length;
            console.log(`   • Активных паттернов: ${active}/${patterns.length}`);
        }

        console.log(`\n💡 Рекомендации:`);
        if (loadedWithIron === 0 && withIron > 0) {
            console.log(`   ⚠️  Перезагрузите страницу: location.reload()`);
        } else {
            console.log(`   ✅ Всё готово! Микронутриенты активны.`);
            console.log(`   📱 Откройте дневник и проверьте инсайты.`);
        }

        console.log(`\n═══════════════════════════════════════════════════════\n`);

        return {
            success: true,
            products: products.length,
            micronutrients: { iron: withIron, vitaminC: withVitC, calcium: withCalc },
            loaded: { products: loadedProducts.length, iron: loadedWithIron, vitC: loadedWithVitC, calc: loadedWithCalc }
        };

    } catch (err) {
        console.error(`\n❌ ОШИБКА: ${err.message}\n`);
        console.error(err);
        return { success: false, error: err.message };
    }
})();
