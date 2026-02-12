/**
 * 🧠 HEYS Insights Check with Auto-Load
 * Проверяет инсайты с автоматической загрузкой модулей
 */

(async function checkPatternsWithFallback() {
    console.log('🧠 HEYS Insights Check v2.0\n');
    console.log('═══════════════════════════════════════════════════════\n');

    // === ШАГ 1: Проверка окружения ===
    console.log('📋 Проверка окружения...\n');

    const checks = {
        HEYS: !!window.HEYS,
        InsightsPI: !!window.HEYS?.InsightsPI,
        analyzeAll: !!window.HEYS?.InsightsPI?.analyzeAll,
        patterns: !!window.HEYS?.InsightsPI?.patterns,
        patternModules: !!window.HEYS?.InsightsPI?.patternModules,
        products: !!window.HEYS?.products,
        productsCount: window.HEYS?.products?.getAll?.()?.length || 0
    };

    console.log('Статус модулей:');
    Object.entries(checks).forEach(([key, value]) => {
        console.log(`   ${value ? '✅' : '❌'} ${key}: ${value}`);
    });

    // === ШАГ 2: Ожидание загрузки InsightsPI ===
    if (!checks.InsightsPI) {
        console.log('\n⏳ InsightsPI не загружен, ожидаем 3 секунды...');

        await new Promise(resolve => setTimeout(resolve, 3000));

        if (window.HEYS?.InsightsPI) {
            console.log('✅ InsightsPI загружен!');
        } else {
            console.error('\n❌ КРИТИЧНО: InsightsPI не загрузился');
            console.error('   Возможные причины:');
            console.error('   1. Модуль не подключен в index.html');
            console.error('   2. Ошибка загрузки скрипта');
            console.error('   3. Не та страница (нужен дневник)');

            // Fallback: прямая проверка products
            console.log('\n📊 Fallback: проверка products напрямую...\n');

            const products = window.HEYS?.products?.getAll?.() ||
                window.HEYS?.store?.get?.('heys_products', []) ||
                [];

            if (products.length === 0) {
                console.error('❌ Products не загружены');
                return { success: false, error: 'No products' };
            }

            const withMicro = {
                iron: products.filter(p => p.iron && parseFloat(p.iron) > 0).length,
                vitC: products.filter(p => p.vitamin_c && parseFloat(p.vitamin_c) > 0).length,
                calc: products.filter(p => p.calcium && parseFloat(p.calcium) > 0).length,
                mag: products.filter(p => p.magnesium && parseFloat(p.magnesium) > 0).length,
                zinc: products.filter(p => p.zinc && parseFloat(p.zinc) > 0).length
            };

            console.log(`✅ Products: ${products.length} шт`);
            console.log(`\n🥗 Микронутриенты в products:`);
            console.log(`   • Железо:    ${withMicro.iron}/${products.length} (${(withMicro.iron / products.length * 100).toFixed(1)}%)`);
            console.log(`   • Витамин C: ${withMicro.vitC}/${products.length} (${(withMicro.vitC / products.length * 100).toFixed(1)}%)`);
            console.log(`   • Кальций:   ${withMicro.calc}/${products.length} (${(withMicro.calc / products.length * 100).toFixed(1)}%)`);
            console.log(`   • Магний:    ${withMicro.mag}/${products.length} (${(withMicro.mag / products.length * 100).toFixed(1)}%)`);
            console.log(`   • Цинк:      ${withMicro.zinc}/${products.length} (${(withMicro.zinc / products.length * 100).toFixed(1)}%)`);

            console.log('\n💡 Для проверки паттернов откройте секцию "Инсайты" в UI');
            console.log('   Или подождите и запустите скрипт снова через 5 сек');

            return {
                success: false,
                fallback: true,
                products: products.length,
                micronutrients: withMicro
            };
        }
    }

    // === ШАГ 3: Очистка кэша ===
    console.log('\n🗑️  Очистка кэша...\n');

    if (window.HEYS.InsightsPI.clearCache) {
        window.HEYS.InsightsPI.clearCache();
        console.log('✅ Кэш очищен');
    }

    // === ШАГ 4: Анализ паттернов ===
    console.log('\n🧠 Запуск analyzeAll()...\n');

    try {
        const insights = await window.HEYS.InsightsPI.analyzeAll();

        if (!insights || !insights.patterns) {
            throw new Error('analyzeAll вернул пустой результат');
        }

        const patterns = insights.patterns;
        const active = patterns.filter(p => p.available || p.hasPattern);
        const inactive = patterns.filter(p => !p.available && !p.hasPattern);

        console.log(`✅ Анализ завершён`);
        console.log(`\n📊 ИТОГО: ${active.length}/${patterns.length} паттернов активны\n`);

        // === Микронутриентные паттерны ===
        const microKeywords = [
            'vitamin', 'iron', 'bone', 'magnesium', 'zinc', 'anemia',
            'Vitamin', 'Iron', 'Bone', 'Magnesium', 'Zinc', 'Anemia',
            'calcium', 'Calcium', 'витамин', 'железо', 'кальций'
        ];

        const micro = patterns.filter(p =>
            microKeywords.some(kw => p.pattern?.includes(kw))
        );

        const microActive = micro.filter(p => p.available || p.hasPattern);
        const microInactive = micro.filter(p => !p.available && !p.hasPattern);

        console.log(`🥗 Микронутриены: ${microActive.length}/${micro.length} активны\n`);

        if (microActive.length > 0) {
            console.log('✅ Активные микронутриентные паттерны:');
            microActive.forEach(p => {
                const status = p.hasPattern ? '🔥' : '✅';
                console.log(`   ${status} ${p.pattern}${p.hasPattern ? ' (паттерн найден!)' : ''}`);
            });
        }

        if (microInactive.length > 0) {
            console.log(`\n❌ Неактивные микронутриентные паттерны (${microInactive.length}):`);
            microInactive.forEach(p => {
                console.log(`   • ${p.pattern}: ${p.reason || 'N/A'}`);
            });
        }

        // === Все неактивные паттерны ===
        if (inactive.length > 0) {
            console.log(`\n\n❌ ВСЕ неактивные паттерны (${inactive.length}):`);

            const grouped = {};
            inactive.forEach(p => {
                const reason = p.reason || 'no_data';
                if (!grouped[reason]) grouped[reason] = [];
                grouped[reason].push(p.pattern);
            });

            Object.entries(grouped).forEach(([reason, patterns]) => {
                console.log(`\n   📌 ${reason} (${patterns.length}):`);
                patterns.forEach(p => console.log(`      • ${p}`));
            });
        }

        // === ИТОГО ===
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('✅ ПРОВЕРКА ЗАВЕРШЕНА');
        console.log('═══════════════════════════════════════════════════════\n');

        console.log('📊 Результат:');
        console.log(`   • Всего паттернов: ${patterns.length}`);
        console.log(`   • Активно: ${active.length} (${(active.length / patterns.length * 100).toFixed(1)}%)`);
        console.log(`   • Неактивно: ${inactive.length} (${(inactive.length / patterns.length * 100).toFixed(1)}%)`);
        console.log(`   • Микронутриенты активны: ${microActive.length}/${micro.length}`);

        // Сравнение с ожидаемым
        const expectedActive = 34; // Ожидаемое после обновления
        const delta = active.length - 26; // До обновления было 26

        console.log(`\n📈 Изменение:`);
        console.log(`   • Было активно: 26/41`);
        console.log(`   • Стало активно: ${active.length}/${patterns.length}`);
        console.log(`   • Прирост: ${delta > 0 ? '+' : ''}${delta} паттернов`);

        if (microActive.length > 0) {
            console.log(`\n🎉 Микронутриентные паттерны РАЗБЛОКИРОВАНЫ!`);
        } else {
            console.log(`\n⚠️  Микронутриентные паттерны ещё не активны`);
            console.log(`   Проверьте что products загружены с полями iron/vitamin_c/calcium`);
        }

        console.log('\n═══════════════════════════════════════════════════════\n');

        return {
            success: true,
            total: patterns.length,
            active: active.length,
            inactive: inactive.length,
            micro: {
                total: micro.length,
                active: microActive.length,
                inactive: microInactive.length
            },
            delta: delta,
            patterns: {
                active: active.map(p => p.pattern),
                inactive: inactive.map(p => ({ pattern: p.pattern, reason: p.reason })),
                microActive: microActive.map(p => p.pattern),
                microInactive: microInactive.map(p => ({ pattern: p.pattern, reason: p.reason }))
            }
        };

    } catch (err) {
        console.error('\n❌ ОШИБКА при анализе:', err.message);
        console.error(err);
        return { success: false, error: err.message };
    }
})();
