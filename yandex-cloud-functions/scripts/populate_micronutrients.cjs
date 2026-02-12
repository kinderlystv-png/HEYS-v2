#!/usr/bin/env node
/**
 * @fileoverview Populate micronutrients for shared_products from USDA FoodData Central
 * @version 1.0.0
 * 
 * Usage:
 *   node populate_micronutrients.js
 * 
 * Prerequisites:
 *   - Apply migration: 2026-02-12_add_micronutrients.sql
 *   - Get USDA API key: https://fdc.nal.usda.gov/api-key-signup.html
 *   - Set env: USDA_API_KEY=your_key_here
 */

const https = require('https');
const { Pool } = require('pg');

// Database connection (from env or hardcoded)
const pool = new Pool({
    host: process.env.PG_HOST || 'rc1b-2gfin10qjx3ldu26.mdb.yandexcloud.net',
    port: process.env.PG_PORT || 6432,
    database: process.env.PG_DATABASE || 'heysdb',
    user: process.env.PG_USER || 'heysuser',
    password: process.env.PG_PASSWORD, // REQUIRED
    ssl: { rejectUnauthorized: false }
});

// USDA FoodData Central API key (optional — falls back to manual mapping)
const USDA_API_KEY = process.env.USDA_API_KEY;

/**
 * Manual micronutrient mapping for common Russian products
 * Source: USDA FoodData Central + Russian ГОСТ tables
 * Values per 100g
 */
const MANUAL_DATA = {
    // Meat
    'говядина': { iron: 3.5, protein100: 26, vitamin_b12: 2.6, zinc: 5.8 },
    'курица': { iron: 1.3, protein100: 27, vitamin_b12: 0.3, zinc: 1.3 },
    'свинина': { iron: 1.1, protein100: 21, vitamin_b12: 0.7, zinc: 2.4 },
    'индейка': { iron: 1.4, protein100: 29, vitamin_b12: 1.6, zinc: 2.0 },
    'печень говяжья': { iron: 6.5, vitamin_a: 16898, vitamin_b12: 60, folate: 290 },

    // Fish
    'лосось': { iron: 0.8, vitamin_d: 11, vitamin_b12: 3.2, protein100: 20 },
    'тунец': { iron: 1.0, vitamin_d: 5.7, vitamin_b12: 9.4, protein100: 23 },
    'скумбрия': { iron: 1.6, vitamin_d: 16.1, vitamin_b12: 8.7, protein100: 18 },

    // Dairy
    'творог': { calcium: 120, protein100: 18, vitamin_b12: 1.2 },
    'молоко': { calcium: 120, vitamin_d: 1.3, vitamin_b12: 0.4, protein100: 3.2 },
    'сыр': { calcium: 700, vitamin_a: 250, protein100: 25 },
    'йогурт': { calcium: 140, protein100: 10, vitamin_b12: 0.5 },
    'кефир': { calcium: 120, protein100: 2.8, vitamin_b12: 0.4 },

    // Eggs
    'яйцо': { iron: 1.8, vitamin_a: 160, vitamin_b12: 1.1, vitamin_d: 2.0, protein100: 13 },

    // Legumes
    'фасоль': { iron: 6.7, folate: 394, magnesium: 140, protein100: 21 },
    'чечевица': { iron: 6.5, folate: 479, magnesium: 122, protein100: 24.6 },
    'нут': { iron: 2.9, folate: 557, magnesium: 115, protein100: 19 },

    // Vegetables
    'шпинат': { iron: 2.7, vitamin_c: 28, vitamin_a: 469, calcium: 99, folate: 194 },
    'брокколи': { vitamin_c: 89, calcium: 47, folate: 63, fiber100: 2.6 },
    'перец болгарский': { vitamin_c: 128, vitamin_a: 157 },
    'морковь': { vitamin_a: 835, vitamin_c: 5.9 },
    'капуста': { vitamin_c: 37, calcium: 40, fiber100: 2.5 },

    // Fruits
    'апельсин': { vitamin_c: 53, folate: 30, calcium: 40 },
    'киви': { vitamin_c: 93, vitamin_e: 1.5, folate: 25 },
    'клубника': { vitamin_c: 59, folate: 24 },
    'банан': { vitamin_c: 8.7, magnesium: 27, potassium: 358 },

    // Nuts & Seeds
    'миндаль': { iron: 3.7, calcium: 269, vitamin_e: 25.6, magnesium: 270 },
    'грецкий орех': { iron: 2.9, magnesium: 158, zinc: 3.1 },
    'кунжут': { iron: 14.6, calcium: 975, magnesium: 351, zinc: 7.8 },
    'семена подсолнечника': { iron: 5.2, vitamin_e: 35.2, magnesium: 325 },

    // Grains
    'гречка': { iron: 2.2, magnesium: 231, zinc: 2.4, protein100: 13.3 },
    'овсянка': { iron: 4.7, magnesium: 177, zinc: 4.0, protein100: 16.9, fiber100: 10.6 },
    'рис': { iron: 0.8, magnesium: 25, zinc: 1.1, protein100: 2.7 },
    'хлеб': { iron: 3.6, magnesium: 22, zinc: 0.7, protein100: 8.0 }
};

/**
 * Search USDA FoodData Central (if API key available)
 */
async function searchUSDA(productName) {
    if (!USDA_API_KEY) return null;

    return new Promise((resolve, reject) => {
        const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${USDA_API_KEY}&query=${encodeURIComponent(productName)}&pageSize=1`;

        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.foods?.[0]) {
                        const food = json.foods[0];
                        const nutrients = {};

                        for (const nutrient of food.foodNutrients || []) {
                            const name = nutrient.nutrientName?.toLowerCase();
                            const value = nutrient.value;

                            if (name?.includes('iron')) nutrients.iron = value;
                            if (name?.includes('vitamin c')) nutrients.vitamin_c = value;
                            if (name?.includes('calcium')) nutrients.calcium = value;
                            if (name?.includes('vitamin d')) nutrients.vitamin_d = value;
                            if (name?.includes('vitamin b-12')) nutrients.vitamin_b12 = value;
                        }

                        resolve(nutrients);
                    } else {
                        resolve(null);
                    }
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

/**
 * Update product with micronutrients
 */
async function updateProduct(client, productId, productName, nutrients) {
    const fields = [];
    const values = [];
    let idx = 1;

    for (const [key, value] of Object.entries(nutrients)) {
        if (value !== undefined && value !== null) {
            fields.push(`${key} = $${idx}`);
            values.push(value);
            idx++;
        }
    }

    if (fields.length === 0) return 0;

    values.push(productId);
    const query = `UPDATE public.shared_products SET ${fields.join(', ')} WHERE id = $${idx}`;

    await client.query(query, values);
    return fields.length;
}

/**
 * Main processing
 */
async function main() {
    console.log('🥗 HEYS Micronutrients Populator v1.0\n');

    if (!process.env.PG_PASSWORD) {
        console.error('❌ Missing PG_PASSWORD env variable');
        process.exit(1);
    }

    const client = await pool.connect();

    try {
        // Get all products without micronutrients
        const result = await client.query(`
      SELECT id, name, name_norm 
      FROM public.shared_products 
      WHERE iron IS NULL 
        AND vitamin_c IS NULL 
        AND calcium IS NULL
      ORDER BY created_at DESC
      LIMIT 500
    `);

        console.log(`📦 Products to process: ${result.rows.length}\n`);

        let updated = 0;
        let skipped = 0;

        for (const row of result.rows) {
            const nameNorm = row.name_norm.toLowerCase();

            // Try manual mapping first
            let nutrients = null;
            for (const [keyword, data] of Object.entries(MANUAL_DATA)) {
                if (nameNorm.includes(keyword)) {
                    nutrients = data;
                    break;
                }
            }

            // Try USDA if no manual match
            if (!nutrients && USDA_API_KEY) {
                try {
                    nutrients = await searchUSDA(row.name);
                    await new Promise(r => setTimeout(r, 200)); // Rate limit
                } catch (e) {
                    console.error(`   USDA error for ${row.name}: ${e.message}`);
                }
            }

            if (nutrients) {
                const fields = await updateProduct(client, row.id, row.name, nutrients);
                if (fields > 0) {
                    console.log(`✅ ${row.name}: ${fields} nutrients`);
                    updated++;
                }
            } else {
                skipped++;
            }
        }

        console.log(`\n📊 Summary:`);
        console.log(`   Updated: ${updated}`);
        console.log(`   Skipped: ${skipped}`);
        console.log(`   Total: ${result.rows.length}`);

    } finally {
        client.release();
        await pool.end();
    }
}

main().catch(console.error);
