// generate_shared_products_update_sql.cjs — dry-run SQL generator for shared_products
const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2];
if (!inputPath) {
    console.error('Usage: node generate_shared_products_update_sql.cjs <jsonPath>');
    process.exit(1);
}

const raw = fs.readFileSync(inputPath, 'utf8');
let data;
try {
    data = JSON.parse(raw);
} catch (err) {
    console.error('Invalid JSON:', err.message);
    process.exit(1);
}

const products = Array.isArray(data)
    ? data
    : Array.isArray(data.products)
        ? data.products
        : [];

if (!products.length) {
    console.error('No products found in JSON. Expected array or { products: [...] }');
    process.exit(1);
}

const columns = [
    'name',
    'category',
    'simple100',
    'complex100',
    'protein100',
    'badfat100',
    'goodfat100',
    'trans100',
    'fiber100',
    'gi',
    'harm',
    'sodium100',
    'nova_group',
    'omega3_100',
    'omega6_100',
    'additives',
    'nutrient_density',
    'is_organic',
    'is_whole_grain',
    'is_fermented',
    'is_raw',
    'vitamin_a',
    'vitamin_c',
    'vitamin_d',
    'vitamin_e',
    'vitamin_k',
    'vitamin_b1',
    'vitamin_b2',
    'vitamin_b3',
    'vitamin_b6',
    'vitamin_b9',
    'vitamin_b12',
    'calcium',
    'iron',
    'magnesium',
    'phosphorus',
    'potassium',
    'zinc',
    'selenium',
    'iodine',
    'portions',
    'description',
];

const keyMap = {
    badfat100: 'badFat100',
    goodfat100: 'goodFat100',
    nova_group: 'nova_group',
    omega3_100: 'omega3_100',
    omega6_100: 'omega6_100',
    nutrient_density: 'nutrient_density',
};

const boolColumns = new Set([
    'is_organic',
    'is_whole_grain',
    'is_fermented',
    'is_raw',
]);

const jsonColumns = new Set(['portions']);
const textArrayColumns = new Set(['additives']);

const numColumns = new Set([
    'simple100',
    'complex100',
    'protein100',
    'badfat100',
    'goodfat100',
    'trans100',
    'fiber100',
    'gi',
    'harm',
    'sodium100',
    'nova_group',
    'omega3_100',
    'omega6_100',
    'nutrient_density',
    'vitamin_a',
    'vitamin_c',
    'vitamin_d',
    'vitamin_e',
    'vitamin_k',
    'vitamin_b1',
    'vitamin_b2',
    'vitamin_b3',
    'vitamin_b6',
    'vitamin_b9',
    'vitamin_b12',
    'calcium',
    'iron',
    'magnesium',
    'phosphorus',
    'potassium',
    'zinc',
    'selenium',
    'iodine',
]);

function sqlString(value) {
    const str = String(value).replace(/'/g, "''");
    return `'${str}'`;
}

function sqlValue(col, value) {
    if (value === undefined || value === null || value === '') return 'NULL';
    if (boolColumns.has(col)) return value ? 'TRUE' : 'FALSE';
    if (jsonColumns.has(col)) return sqlString(JSON.stringify(value));
    if (textArrayColumns.has(col)) {
        if (!Array.isArray(value)) return 'NULL';
        const escaped = value.map((v) => `"${String(v).replace(/"/g, '\\"')}"`);
        return `'{' + escaped.join(',') + '}'`;
    }
    if (numColumns.has(col)) {
        const num = Number(value);
        return Number.isFinite(num) ? String(num) : 'NULL';
    }
    return sqlString(value);
}

function getValue(product, col) {
    if (col === 'name') return product.name;
    const mapped = keyMap[col];
    if (mapped && Object.prototype.hasOwnProperty.call(product, mapped)) return product[mapped];
    return product[col];
}

function getValueWithPresence(product, col) {
    if (col === 'name') {
        return { present: Object.prototype.hasOwnProperty.call(product, 'name'), value: product.name };
    }
    const mapped = keyMap[col];
    if (mapped && Object.prototype.hasOwnProperty.call(product, mapped)) {
        return { present: true, value: product[mapped] };
    }
    if (Object.prototype.hasOwnProperty.call(product, col)) {
        return { present: true, value: product[col] };
    }
    return { present: false, value: undefined };
}

function hasMeaningfulValue(value) {
    if (value === undefined || value === null || value === '') return false;
    return true;
}

const stats = {
    total: products.length,
    withName: 0,
    missingName: 0,
    nullCounts: Object.fromEntries(columns.map((c) => [c, 0])),
    setCounts: Object.fromEntries(columns.map((c) => [c, 0])),
};

const statements = [];

for (const product of products) {
    const name = product?.name;
    if (!name) {
        stats.missingName += 1;
        continue;
    }
    stats.withName += 1;

    const sets = [];
    for (const col of columns) {
        if (col === 'name') continue;
        const { present, value } = getValueWithPresence(product, col);
        if (!present || !hasMeaningfulValue(value)) {
            stats.nullCounts[col] += 1;
            continue;
        }
        stats.setCounts[col] += 1;
        sets.push(`${col} = ${sqlValue(col, value)}`);
    }

    if (sets.length) {
        statements.push(
            `UPDATE shared_products SET ${sets.join(', ')} WHERE name = ${sqlValue('name', name)};`
        );
    }
}

const header = [
    '-- DRY RUN: generated SQL to update shared_products from JSON',
    `-- Source: ${inputPath}`,
    `-- Products total: ${stats.total}, with name: ${stats.withName}, missing name: ${stats.missingName}`,
    '-- Wrap in transaction when applying:',
    '-- BEGIN;',
    '-- (statements)',
    '-- COMMIT;',
    '',
].join('\n');

const report = [
    'DRY RUN SUMMARY',
    `Total products: ${stats.total}`,
    `With name: ${stats.withName}`,
    `Missing name: ${stats.missingName}`,
    `Updates generated: ${statements.length}`,
    'Null/empty counts by column:',
    ...columns
        .filter((c) => c !== 'name')
        .map((c) => `  ${c}: ${stats.nullCounts[c]} (set: ${stats.setCounts[c]})`),
].join('\n');

const output = header + statements.join('\n');

const outPath = process.env.OUT ? path.resolve(process.env.OUT) : null;
if (outPath) {
    fs.writeFileSync(outPath, output, 'utf8');
    console.error(`SQL written to: ${outPath}`);
}

console.log(report);

if (!outPath) {
    console.log('\n-- SQL preview (first 5 statements) --');
    statements.slice(0, 5).forEach((s) => console.log(s));
}
