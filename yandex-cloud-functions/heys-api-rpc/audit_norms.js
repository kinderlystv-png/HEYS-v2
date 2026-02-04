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

async function audit() {
    await client.connect();
    console.log('Connected to DB\n');

    // Get all clients
    const clients = await client.query(`SELECT id, name, phone_normalized FROM clients`);
    console.log('=== CLIENTS ===');
    clients.rows.forEach(c => console.log(`  ${c.id}: ${c.name} (${c.phone_normalized})`));

    // For each client, get profile and norms
    for (const c of clients.rows) {
        console.log(`\n=== CLIENT: ${c.name} (${c.id}) ===`);

        const profile = await client.query(
            `SELECT v FROM client_kv_store WHERE client_id = $1 AND k = 'heys_profile'`,
            [c.id]
        );

        const norms = await client.query(
            `SELECT v FROM client_kv_store WHERE client_id = $1 AND k = 'heys_norms'`,
            [c.id]
        );

        if (profile.rows[0]?.v) {
            const p = profile.rows[0].v;
            console.log('Profile:');
            console.log(`  weight: ${p.weight}, height: ${p.height}, age: ${p.age}`);
            console.log(`  gender: ${p.gender}`);
            console.log(`  deficitPctTarget: ${p.deficitPctTarget}`);
        }

        if (norms.rows[0]?.v) {
            const n = norms.rows[0].v;
            console.log('Norms:');
            console.log(`  carbsPct: ${n.carbsPct}%`);
            console.log(`  proteinPct: ${n.proteinPct}%`);
            console.log(`  fatPct (auto): ${100 - (n.carbsPct || 0) - (n.proteinPct || 0)}%`);

            // Calculate expected protein grams for 2525 kcal (from screenshot)
            const optimum = 2525;
            const protGrams = (optimum * (n.proteinPct || 0) / 100) / 4;
            console.log(`  → При калорийности ${optimum} ккал, белок = ${Math.round(protGrams)}г`);
        }
    }

    await client.end();
}

audit().catch(console.error);
