#!/usr/bin/env node
/**
 * Recalculate harm for all products in shared_products
 * Generates SQL for database update
 */

const fs = require('fs');
const path = require('path');

// Load data from JSON
const sharedPath = path.join(__dirname, '../heys_shared_products_export.json');
const data = JSON.parse(fs.readFileSync(sharedPath, 'utf-8'));
const products = data.products;

console.log('Loaded ' + products.length + ' products from JSON\n');

// === HARM SCORE FORMULA (from DATA_MODEL_REFERENCE.md) ===
function calculateHarmScore(p) {
    const simple100 = p.simple100 || 0;
    const protein100 = p.protein100 || 0;
    const badFat100 = p.badFat100 || 0;
    const goodFat100 = p.goodFat100 || 0;
    const trans100 = p.trans100 || 0;
    const fiber100 = p.fiber100 || 0;
    const gi = p.gi || 0;
    const sodium100 = p.sodium100 || 0;
    const novaGroup = p.nova_group || 1;

    // PENALTIES
    let penalties = 0;
    penalties += trans100 * 3.0;      // trans fats
    penalties += simple100 * 0.08;    // simple sugars
    penalties += badFat100 * 0.10;    // saturated fats
    penalties += sodium100 * 0.002;   // sodium

    // GI penalty
    if (gi <= 35) {
        penalties += 0;
    } else if (gi <= 55) {
        penalties += 0.5;
    } else if (gi <= 70) {
        penalties += 1.0;
    } else {
        penalties += 1.5 + (gi - 70) * 0.02;
    }

    // NOVA penalty
    const novaPenalties = { 1: 0, 2: 0.3, 3: 0.8, 4: 2.5 };
    penalties += novaPenalties[novaGroup] || 0;

    // BONUSES
    let bonuses = 0;
    bonuses += fiber100 * 0.30;       // fiber
    bonuses += protein100 * 0.06;     // protein
    bonuses += goodFat100 * 0.04;     // good fats

    // Final score
    const raw = penalties - bonuses;
    return Math.max(0, Math.min(10, raw));
}

// Recalculate harm for all products
const updates = [];
let changed = 0;
let unchanged = 0;

products.forEach(p => {
    const oldHarm = p.harm || 0;
    const newHarm = calculateHarmScore(p);
    const roundedHarm = Math.round(newHarm * 10) / 10;

    if (Math.abs(roundedHarm - oldHarm) > 0.01) {
        updates.push({
            id: p.id,
            name: p.name,
            oldHarm,
            newHarm: roundedHarm
        });
        changed++;
    } else {
        unchanged++;
    }
});

console.log('=== RESULTS ===');
console.log('Changed: ' + changed);
console.log('Unchanged: ' + unchanged);
console.log('Total: ' + products.length + '\n');

// Show examples
console.log('=== EXAMPLES (first 20) ===');
updates.slice(0, 20).forEach(u => {
    console.log('  ' + u.name + ': ' + u.oldHarm + ' -> ' + u.newHarm);
});

// Generate SQL
const sqlPath = path.join(__dirname, '../database/2026-01-31_recalc_harm.sql');
let sql = '-- Auto recalculate harm for ' + changed + ' products\n';
sql += '-- Date: ' + new Date().toISOString().split('T')[0] + '\n';
sql += '-- Formula: HarmScore v2.0 (see DATA_MODEL_REFERENCE.md)\n\n';
sql += 'BEGIN;\n\n';

updates.forEach(u => {
    const escapedName = u.name.replace(/'/g, "''");
    sql += 'UPDATE shared_products SET harm = ' + u.newHarm + " WHERE id = '" + u.id + "'; -- " + escapedName + '\n';
});

sql += '\nCOMMIT;\n';

fs.writeFileSync(sqlPath, sql);
console.log('\nSQL saved to: ' + sqlPath);
console.log('Total UPDATEs: ' + updates.length);
