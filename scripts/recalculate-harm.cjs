#!/usr/bin/env node
/**
 * HARM RECALCULATION SCRIPT
 * Пересчитывает harm для всех продуктов с harm=0 и генерирует SQL
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// HARM SCORE CALCULATION (копия из heys_harm_v1.js)
// ============================================================================

const HARM_WEIGHTS = {
    trans100: 3.0,
    simple100: 0.08,
    badFat100: 0.10,
    sodium100: 0.002,
    fiber100: -0.30,
    protein100: -0.06,
    goodFat100: -0.04,
    nova1: 0,
    nova2: 0.3,
    nova3: 0.8,
    nova4: 2.5,
};

const GI_PENALTY = {
    low: { max: 35, penalty: 0 },
    medium: { max: 55, penalty: 0.5 },
    high: { max: 70, penalty: 1.0 },
    veryHigh: { max: Infinity, penalty: 1.5, progressive: 0.02 }
};

function calculateGIPenalty(gi) {
    if (!gi || gi <= 0) return 0;
    if (gi <= GI_PENALTY.low.max) return GI_PENALTY.low.penalty;
    if (gi <= GI_PENALTY.medium.max) return GI_PENALTY.medium.penalty;
    if (gi <= GI_PENALTY.high.max) return GI_PENALTY.high.penalty;
    return GI_PENALTY.veryHigh.penalty + (gi - 70) * GI_PENALTY.veryHigh.progressive;
}

function calculateHarmScore(product) {
    const trans = Number(product.trans100) || 0;
    const simple = Number(product.simple100) || 0;
    const badFat = Number(product.badFat100) || 0;
    const sodium = Number(product.sodium100) || 0;
    const fiber = Number(product.fiber100) || 0;
    const protein = Number(product.protein100) || 0;
    const goodFat = Number(product.goodFat100) || 0;
    const gi = Number(product.gi) || 0;
    const novaGroup = Number(product.nova_group) || 2;

    // PENALTIES
    const penalties = {
        trans: trans * HARM_WEIGHTS.trans100,
        simple: simple * HARM_WEIGHTS.simple100,
        badFat: badFat * HARM_WEIGHTS.badFat100,
        sodium: sodium * HARM_WEIGHTS.sodium100,
        gi: calculateGIPenalty(gi),
        nova: HARM_WEIGHTS[`nova${novaGroup}`] || 0,
    };
    const totalPenalties = Object.values(penalties).reduce((s, v) => s + v, 0);

    // BONUSES
    const bonuses = {
        fiber: Math.abs(fiber * HARM_WEIGHTS.fiber100),
        protein: Math.abs(protein * HARM_WEIGHTS.protein100),
        goodFat: Math.abs(goodFat * HARM_WEIGHTS.goodFat100),
    };
    const totalBonuses = Object.values(bonuses).reduce((s, v) => s + v, 0);

    // FINAL
    let rawScore = totalPenalties - totalBonuses;
    const score = Math.max(0, Math.min(10, rawScore));
    return Math.round(score * 10) / 10;
}

// ============================================================================
// MAIN
// ============================================================================

const sharedPath = path.join(__dirname, '../heys_shared_products_export.json');
const data = JSON.parse(fs.readFileSync(sharedPath, 'utf-8'));
const shared = data.products;

console.log('=== HARM RECALCULATION ===\n');
console.log(`Всего продуктов: ${shared.length}`);

// Найти продукты с harm=0
const needsRecalc = shared.filter(p => p.harm === 0 || p.harm === null);
console.log(`Нужно пересчитать: ${needsRecalc.length}\n`);

// Также исправляем Raffaello (ошибка данных — белок 47г вместо 4.7г)
const raffaello = shared.find(p => p.name && p.name.includes('Raffaello'));
if (raffaello) {
    console.log('🔧 Исправляем Raffaello (белок 47 → 6.6)');
    raffaello.protein100 = 6.6; // Правильное значение
}

// Пересчитываем harm
const results = [];
const sqlStatements = [];

for (const product of needsRecalc) {
    const oldHarm = product.harm;
    const newHarm = calculateHarmScore(product);
    
    results.push({
        id: product.id,
        name: product.name,
        oldHarm,
        newHarm,
        gi: product.gi,
        nova: product.nova_group,
        protein: product.protein100,
        simple: product.simple100,
        fiber: product.fiber100,
    });

    // Генерируем SQL
    const escapedName = (product.name || '').replace(/'/g, "''");
    sqlStatements.push(
        `UPDATE shared_products SET harm = ${newHarm} WHERE id = '${product.id}'; -- ${escapedName}`
    );
}

// Добавляем фикс для Raffaello
if (raffaello) {
    const newHarm = calculateHarmScore(raffaello);
    const escapedName = (raffaello.name || '').replace(/'/g, "''");
    sqlStatements.push(
        `UPDATE shared_products SET protein100 = 6.6, harm = ${newHarm} WHERE id = '${raffaello.id}'; -- ${escapedName} (FIX protein)`
    );
}

// Выводим результаты
console.log('=== РЕЗУЛЬТАТЫ ПЕРЕСЧЁТА ===\n');

// Группируем по категориям harm
const categories = {
    superHealthy: { name: '🟢 Суперполезный (0-1)', products: [] },
    healthy: { name: '🟢 Полезный (1.1-2.5)', products: [] },
    neutral: { name: '🟡 Нейтральный (2.6-4.0)', products: [] },
    mildlyHarmful: { name: '🟠 Умеренно вредный (4.1-5.5)', products: [] },
    harmful: { name: '🔴 Вредный (5.6-7.0)', products: [] },
    veryHarmful: { name: '🔴 Очень вредный (7.1-8.5)', products: [] },
    superHarmful: { name: '⚫ Супервредный (8.6-10)', products: [] },
};

for (const r of results) {
    if (r.newHarm <= 1.0) categories.superHealthy.products.push(r);
    else if (r.newHarm <= 2.5) categories.healthy.products.push(r);
    else if (r.newHarm <= 4.0) categories.neutral.products.push(r);
    else if (r.newHarm <= 5.5) categories.mildlyHarmful.products.push(r);
    else if (r.newHarm <= 7.0) categories.harmful.products.push(r);
    else if (r.newHarm <= 8.5) categories.veryHarmful.products.push(r);
    else categories.superHarmful.products.push(r);
}

for (const [key, cat] of Object.entries(categories)) {
    if (cat.products.length > 0) {
        console.log(`\n${cat.name}: ${cat.products.length} продуктов`);
        for (const p of cat.products) {
            console.log(`  ${p.newHarm.toFixed(1)} | ${p.name}`);
        }
    }
}

// Статистика
console.log('\n=== СТАТИСТИКА ===');
const harmValues = results.map(r => r.newHarm);
const avgHarm = harmValues.reduce((s, v) => s + v, 0) / harmValues.length;
const minHarm = Math.min(...harmValues);
const maxHarm = Math.max(...harmValues);

console.log(`Средний harm: ${avgHarm.toFixed(2)}`);
console.log(`Минимальный: ${minHarm.toFixed(1)}`);
console.log(`Максимальный: ${maxHarm.toFixed(1)}`);

// Записываем SQL файл
const sqlContent = `-- ============================================================================
-- HARM RECALCULATION SQL
-- Generated: ${new Date().toISOString()}
-- Products updated: ${sqlStatements.length}
-- ============================================================================

BEGIN;

${sqlStatements.join('\n')}

COMMIT;

-- Проверка результатов
SELECT 
    CASE 
        WHEN harm <= 1.0 THEN '🟢 Суперполезный'
        WHEN harm <= 2.5 THEN '🟢 Полезный'
        WHEN harm <= 4.0 THEN '🟡 Нейтральный'
        WHEN harm <= 5.5 THEN '🟠 Умеренно вредный'
        WHEN harm <= 7.0 THEN '🔴 Вредный'
        WHEN harm <= 8.5 THEN '🔴 Очень вредный'
        ELSE '⚫ Супервредный'
    END as category,
    COUNT(*) as count
FROM shared_products
GROUP BY 1
ORDER BY MIN(harm);
`;

const sqlPath = path.join(__dirname, '../database/2026-01-31_recalculate_harm.sql');
fs.writeFileSync(sqlPath, sqlContent);
console.log(`\n✅ SQL записан: ${sqlPath}`);

// Обновляем JSON экспорт
for (const r of results) {
    const product = shared.find(p => p.id === r.id);
    if (product) {
        product.harm = r.newHarm;
    }
}

const updatedPath = path.join(__dirname, '../heys_shared_products_export.json');
fs.writeFileSync(updatedPath, JSON.stringify(data, null, 2));
console.log(`✅ JSON обновлён: ${updatedPath}`);

console.log('\n=== ГОТОВО ===');
console.log(`Пересчитано: ${results.length} продуктов`);
console.log('\nДля применения в БД выполните:');
console.log(`  psql -h <host> -U heys_admin -d heys_production -f ${sqlPath}`);
