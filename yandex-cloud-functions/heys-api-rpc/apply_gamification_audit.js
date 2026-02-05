const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const CA_CERT_PATH = path.join(__dirname, 'certs', 'root.crt');
const CA_CERT = fs.existsSync(CA_CERT_PATH) ? fs.readFileSync(CA_CERT_PATH, 'utf8') : null;

const pool = new Pool({
    host: 'rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net',
    port: 6432,
    database: 'heys_production',
    user: 'heys_admin',
    password: 'heys007670',
    ssl: CA_CERT ? { rejectUnauthorized: true, ca: CA_CERT } : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
});

async function run() {
    const client = await pool.connect();
    console.log('✅ Connected to PostgreSQL');

    try {
        const sqlPath = path.join(__dirname, '../../database/2026-02-04_gamification_audit.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('📄 Applying gamification_audit.sql...');
        await client.query(sql);
        console.log('✅ Migration applied successfully');

        // Test: check functions exist
        const funcs = [
            'log_gamification_event_by_session',
            'log_gamification_event_by_curator',
            'get_gamification_events_by_session',
            'get_gamification_events_by_curator',
            'purge_gamification_events'
        ];

        console.log('\n=== Checking functions ===');
        for (const fn of funcs) {
            const res = await client.query(`
        SELECT proname FROM pg_proc 
        WHERE proname = $1 
        AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      `, [fn]);
            console.log(`  ${res.rows.length > 0 ? '✅' : '❌'} ${fn}`);
        }

        // Test: check table exists
        const tableRes = await client.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' AND tablename = 'gamification_events'
    `);
        console.log(`\n=== Table check ===`);
        console.log(`  ${tableRes.rows.length > 0 ? '✅' : '❌'} gamification_events`);

    } catch (e) {
        console.error('❌ Error:', e.message);
        if (e.position) {
            console.error('   Position:', e.position);
        }
    } finally {
        client.release();
        await pool.end();
    }
}

run();
