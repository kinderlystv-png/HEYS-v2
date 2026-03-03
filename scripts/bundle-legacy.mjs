#!/usr/bin/env node
/**
 * bundle-legacy.mjs — HEYS Legacy Bundle Builder
 *
 * Конкатенирует legacy JS-скрипты в 8 бандлов с content-hash.
 * Выход: apps/web/public/*.bundle.{hash}.js + apps/web/bundle-manifest.json
 *
 * Запуск:
 *   node scripts/bundle-legacy.mjs             — собрать все бандлы
 *   node scripts/bundle-legacy.mjs --dry-run   — показать без записи
 *   node scripts/bundle-legacy.mjs --bundle=boot-core — один бандл
 */

import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    unlinkSync,
    writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const WEB_DIR = resolve(ROOT, 'apps/web');
const PUB_DIR = resolve(WEB_DIR, 'public');
const MANIFEST = resolve(WEB_DIR, 'bundle-manifest.json');

const INDEX_HTML = resolve(WEB_DIR, 'index.html');

const DRY_RUN = process.argv.includes('--dry-run');
const ONLY = (process.argv.find(a => a.startsWith('--bundle=')) ?? '').slice(9) || null;

// ─── Bundle definitions ────────────────────────────────────────────────────
// Порядок файлов строго соответствует index.html.
// Аудит 2026-02-25: DEFER ORDER: PERFECT MATCH (151/151),
//                   POSTBOOT CONTENT: PERFECT MATCH (93/93).
// Пути — относительно apps/web/. Query-строки (?v=…) в именах не нужны —
// стрипаются автоматически при чтении файла с диска.

const BUNDLES = {

    // ── Boot bundles (бывшие <script defer>) ─────────────────────────────

    'boot-core': [
        'heys_dev_utils.js',
        'heys_feature_flags_v1.js',
        'heys_module_perf_v1.js',
        'heys_module_loader_v1.js',
        'heys_bootstrap_v1.js',
        'heys_platform_apis_v1.js',
        'heys_pwa_module_v1.js',
        'heys_simple_analytics.js',
        'heys_smart_search_v2.js',
        'heys_shared_products_export_fields_v1.js',
        'heys_export_utils_v1.js',
        'heys_core_v12.js',
        'heys_yandex_api_v1.js',
        'heys_cloud_merge_v1.js',
        'heys_cloud_storage_utils_v1.js',
        'heys_cloud_shared_v1.js',
        'heys_cloud_queue_v1.js',
        'heys_storage_photos_v1.js',
        'heys_storage_supabase_v1.js',
        'heys_models_v1.js',
        'heys_storage_layer_v1.js',
        'heys_wheel_picker.js',
        'heys_swipeable.js',
        'heys_pull_refresh.js',
        'heys_toast_v1.js',
    ],

    'boot-calc': [
        'heys_ratio_zones_v1.js',
        'heys_tef_v1.js',
        'heys_tdee_v1.js',
        'heys_harm_v1.js',
        'heys_sparkline_utils_v1.js',
        'heys_sparklines_shared_v1.js',
        'heys_day_core_bundle_v1.js',
        'heys_day_utils.js',
        'heys_day_pickers.js',
        'heys_day_popups.js',
        'heys_day_gallery.js',
        'heys_day_bundle_v1.js',
        'heys_day_add_product.js',
        'heys_day_storage_v1.js',
        'heys_day_sound_v1.js',
        'heys_day_guards_v1.js',
        'heys_day_init_v1.js',
        'heys_day_sleep_effects_v1.js',
        'heys_day_global_exports_v1.js',
    ],

    'boot-day': [
        'heys_day_stats_bundle_loader_v1.js',
        'heys_day_edit_grams_modal_v1.js',
        'heys_day_time_mood_picker_v1.js',
        'heys_day_sparklines_v1.js',
        'heys_day_sparkline_data_v1.js',
        'heys_day_caloric_balance_v1.js',
        'heys_day_insights_data_v1.js',
        'heys_day_insulin_wave_data_v1.js',
        'heys_day_goal_progress_v1.js',
        'heys_day_daily_summary_v1.js',
        'heys_day_pull_refresh_v1.js',
        'heys_day_offline_sync_v1.js',
        'heys_day_insulin_wave_ui_v1.js',
        'heys_day_measurements_v1.js',
        'heys_day_popups_state_v1.js',
        'heys_day_main_block_v1.js',
        'heys_day_side_block_v1.js',
        'heys_day_cycle_card_v1.js',
        'heys_day_weight_trends_v1.js',
        'heys_day_picker_modals.js',
        'heys_day_animations.js',
        'heys_day_hero_metrics.js',
        'heys_day_water_state.js',
        'heys_day_daily_table.js',
        'heys_day_steps_ui.js',
        'heys_day_sparkline_state.js',
        'heys_day_edit_grams_state.js',
        'heys_day_caloric_display_state.js',
        'heys_day_page_shell.js',
        'heys_day_engagement_effects.js',
        'heys_day_calendar_metrics.js',
        'heys_day_calendar_block_v1.js',
        'heys_day_mood_sparkline_v1.js',
        'heys_day_stats_block_v1.js',
        'heys_day_orphan_state_v1.js',
        'heys_day_nutrition_state_v1.js',
        'heys_day_runtime_ui_state_v1.js',
        'heys_day_water_card_v1.js',
        'heys_day_activity_card_v1.js',
        'heys_day_energy_context_v1.js',
        'heys_day_bottom_sheet_v1.js',
        'heys_day_hero_display_v1.js',
        'heys_day_rating_averages_v1.js',
        'heys_day_advice_integration_v1.js',
        'heys_day_products_context_v1.js',
        'heys_day_diary_section.js',
        'heys_day_tab_render_v1.js',
        'heys_day_cycle_state.js',
        'day/_meals.js',
        'heys_day_tab_impl_v1.js',
        'heys_day_v12.js',
    ],

    'boot-app': [
        'heys_user_tab_impl_v1.js',
        'heys_user_v12.js',
        'heys_auth_v1.js',
        'heys_subscription_v1.js',
        'heys_trial_queue_v1.js',
        'heys_paywall_v1.js',
        'heys_login_screen_v1.js',
        'heys_ui_onboarding_v1.js',
        'heys_app_hooks_v1.js',
        'heys_app_tabs_v1.js',
        'heys_early_warning_panel_v1.js',
        'heys_gamification_bar_v1.js',
        'heys_app_gates_v1.js',
        'heys_app_shell_v1.js',
        'heys_app_overlays_v1.js',
        'heys_app_gate_flow_v1.js',
        'heys_app_backup_v1.js',
        'heys_app_shortcuts_v1.js',
        'heys_app_onboarding_v1.js',
        'heys_app_auth_init_v1.js',
        'heys_app_client_helpers_v1.js',
        'heys_app_desktop_gate_v1.js',
        'heys_app_morning_checkin_v1.js',
        'heys_app_swipe_nav_v1.js',
        'heys_app_runtime_effects_v1.js',
        'heys_app_sync_effects_v1.js',
        'heys_app_tab_state_v1.js',
        'heys_app_client_management_v1.js',
        'heys_app_backup_actions_v1.js',
        'heys_app_backup_export_v1.js',
        'heys_app_update_checks_v1.js',
        'heys_app_update_notifications_v1.js',
        'heys_app_cloud_init_v1.js',
        'heys_app_client_state_manager_v1.js',
        'heys_app_date_state_v1.js',
        'heys_app_derived_state_v1.js',
        'heys_app_shell_props_v1.js',
        'heys_app_overlays_props_v1.js',
        'heys_app_gate_state_v1.js',
        'heys_app_global_bindings_v1.js',
        'heys_app_backup_state_v1.js',
        'heys_app_banner_state_v1.js',
        'heys_app_client_init_v1.js',
        'heys_app_twemoji_effect_v1.js',
        'heys_app_runtime_state_v1.js',
        'heys_app_core_state_v1.js',
        'heys_app_root_impl_v1.js',
        'heys_app_root_component_v1.js',
    ],

    'boot-init': [
        'heys_app_root_v1.js',
        'heys_app_dependency_loader_v1.js',
        'heys_app_ui_state_v1.js',
        'heys_cascade_card_v1.js',
        'heys_supplements_v1.js',
        'heys_app_initialize_v1.js',
        'heys_app_entry_v1.js',
        'heys_app_v12.js',
    ],

    // ── Postboot bundles (бывший POST_BOOT_SCRIPTS) ───────────────────────
    // heys_cascade_card_v1.js и heys_supplements_v1.js намеренно ИСКЛЮЧЕНЫ:
    // они уже в boot-init (runtime prioritySet тоже их скипает).

    'postboot-1-game': [
        'heys_daily_missions_v1.js',
        'heys_gamification_v1.js',
        'heys_advice_rules_v1.js',
        'heys_advice_bundle_v1.js',
        'heys_meal_optimizer_v1.js',
        'heys_sounds_v1.js',
        'heys_expandable_card_v1.js',
        'heys_iw_shim.js',
        'heys_iw_patterns.js',
        'heys_iw_config_loader.js',
        'heys_iw_constants.js',
        'heys_iw_utils.js',
        'heys_iw_lipolysis.js',
        'heys_iw_v30.js',
        'heys_iw_v41.js',
        'heys_iw_calc.js',
        'heys_iw_orchestrator.js',
        'heys_iw_graph.js',
        'heys_iw_ndte.js',
        'heys_iw_ui.js',
        'heys_insulin_wave_v1.js',
        'heys_iw_version_info.js',
        'heys_cycle_v1.js',
        'heys_refeed_v1.js',
        'heys_yesterday_verify_v1.js',
        'heys_sms_v1.js',
        'heys_consents_v1.js',
        'heys_subscriptions_v1.js',
        'heys_status_v1.js',
    ],

    'postboot-2-insights': [
        'insights/pi_constants.js',
        'insights/pi_stats.js',
        'insights/pi_thresholds.js',
        'insights/pi_science_info.js',
        'insights/patterns/timing.js',
        'insights/patterns/sleep.js',
        'insights/patterns/psychology.js',
        'insights/patterns/activity.js',
        'insights/patterns/lifestyle.js',
        'insights/patterns/body.js',
        'insights/patterns/training_nutrition.js',
        'insights/patterns/metabolic.js',
        'insights/patterns/quality.js',
        'insights/patterns/micronutrients.js',
        'insights/pi_patterns.js',
        'insights/pi_advanced.js',
        'insights/pi_cache.js',
        'insights/pi_analytics_api.js',
        'insights/pi_calculations.js',
        'insights/pi_phenotype.js',
        'insights/pi_causal_chains.js',
        'insights/pi_early_warning.js',
        'insights/pi_whatif.js',
        'insights/pi_ui_phenotype.js',
        'insights/pi_ui_whatif_scenarios.js',
        'insights/pi_product_picker.js',
        'insights/pi_meal_rec_patterns.js',
        'insights/pi_meal_planner.js',
        'insights/pi_meal_recommender.js',
        'insights/pi_feedback_loop.js',
        'insights/pi_outcome_modal.js',
        'insights/pi_meal_rec_feedback.js',
        'insights/pi_ui_meal_rec_card.js',
        'insights/pi_ui_helpers.js',
        'insights/pi_ui_rings.js',
        'insights/pi_ui_cards.js',
        'insights/pi_ui_whatif.js',
        'insights/pi_ui_dashboard.js',
        'insights/pi_pattern_debugger.js',
    ],

    'postboot-3-ui': [
        'heys_modal_manager_v1.js',
        'heys_step_modal_v1.js',
        'heys_steps_v1.js',
        'heys_add_product_step_v1.js',
        'heys_confirm_modal_v1.js',
        'heys_predictive_insights_v1.js',
        'heys_phenotype_v1.js',
        'heys_metabolic_intelligence_v1.js',
        'heys_supplements_science_v1.js',
        'heys_profile_step_v1.js',
        'heys_meal_step_v1.js',
        'heys_training_step_v1.js',
        'heys_morning_checkin_v1.js',
        'heys_monthly_reports_service_v1.js',
        'heys_monthly_reports_v1.js',
        'heys_reports_tab_impl_v1.js',
        'heys_reports_v12.js',
        'heys_weekly_reports_v2.js',
        'heys_data_overview_v1.js',
        'heys_widgets_events_v1.js',
        'heys_widgets_registry_v1.js',
        'heys_widgets_data_crash_risk_v1.js',
        'heys_widgets_core_v1.js',
        'widgets/widget_data.js',
        'heys_widgets_ui_v1.js',
    ],
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function contentHash(str) {
    return createHash('sha256').update(str).digest('hex').slice(0, 12);
}

function fmtSize(bytes) {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1_048_576).toFixed(2)}MB`;
}

function readWebFile(relPath) {
    const clean = relPath.split('?')[0];
    const full = resolve(WEB_DIR, clean);
    if (!existsSync(full)) throw new Error(`Not found: ${full}`);
    return readFileSync(full, 'utf8');
}

// ─── Build one bundle ──────────────────────────────────────────────────────

function buildBundle(name, files) {
    const parts = [];
    const missing = [];

    for (const f of files) {
        try {
            const src = readWebFile(f);
            parts.push(`\n/* ===== ${f} ===== */\n${src}`);
        } catch {
            missing.push(f);
        }
    }

    if (missing.length) {
        console.error(`\n  Missing files:\n${missing.map(f => `    ${f}`).join('\n')}`);
        throw new Error(`${name}: ${missing.length} file(s) missing`);
    }

    const content = parts.join('\n');
    const hash = contentHash(content);
    const outName = `${name}.bundle.${hash}.js`;
    const outPath = resolve(PUB_DIR, outName);
    const size = Buffer.byteLength(content, 'utf8');

    if (!DRY_RUN) {
        writeFileSync(outPath, content, 'utf8');

        // 🛡️ Syntax validation — catch broken bundles before deploy
        try {
            execSync(`node --check "${outPath}"`, { stdio: 'pipe' });
        } catch (err) {
            const stderr = err.stderr ? err.stderr.toString() : '';
            // Count parens to give actionable hint
            let opens = 0, closes = 0;
            for (const ch of content) {
                if (ch === '(') opens++;
                if (ch === ')') closes++;
            }
            console.error(`\n[bundle-legacy] ❌ SYNTAX ERROR in ${outName}!`);
            console.error(`  Paren balance: ( = ${opens}, ) = ${closes}, diff = ${opens - closes}`);
            if (stderr) console.error(`  Node says: ${stderr.split('\n')[0]}`);
            // Find which source file is probably broken
            const errorLine = stderr.match(/:([0-9]+)/);
            if (errorLine) {
                const lineNum = parseInt(errorLine[1], 10);
                const lines = content.split('\n');
                for (let i = lineNum - 1; i >= 0; i--) {
                    if (lines[i] && lines[i].includes('===== heys_')) {
                        console.error(`  Likely broken source: ${lines[i].replace(/[\/\* =]+/g, '').trim()}`);
                        break;
                    }
                }
            }
            throw new Error(`${name}: bundle has syntax errors — fix source files before deploying`);
        }
    }

    return { name, file: outName, hash, fileCount: files.length, size };
}

// ─── Clean stale bundles ───────────────────────────────────────────────────

function cleanOldBundles(onlyName) {
    if (!existsSync(PUB_DIR)) return;
    const pattern = /^(boot|postboot)-[\w-]+\.bundle\.[a-f0-9]{12}\.js(\.gz)?$/;
    const old = readdirSync(PUB_DIR).filter(f => {
        if (!pattern.test(f)) return false;
        // При --bundle=X удаляем только файлы этого конкретного бандла
        if (onlyName) return f.startsWith(onlyName + '.bundle.');
        return true;
    });
    if (old.length === 0) return;
    console.info(`\n[bundle-legacy] 🧹 Removing ${old.length} stale bundle(s):`);
    for (const f of old) {
        unlinkSync(resolve(PUB_DIR, f));
        console.info(`  removed: ${f}`);
    }
}

// ─── Sync index.html ───────────────────────────────────────────────────────

/**
 * Обновляет ссылки на постбут-бандлы в index.html.
 * Заменяет старые хэши в POST_BOOT_BUNDLES на новые из manifest.
 * Также обновляет ссылки на boot-*.bundle.*.js в <script defer src="...">
 * @param {Record<string, {file: string}>} manifest
 */
function syncIndexHtml(manifest) {
    if (!existsSync(INDEX_HTML)) {
        console.warn('[bundle-legacy] ⚠️  index.html not found, skipping sync');
        return;
    }

    let html = readFileSync(INDEX_HTML, 'utf8');
    let changed = 0;

    for (const [name, entry] of Object.entries(manifest)) {
        // Заменяем любые вхождения bundle-имени этого типа (старый хэш → новый)
        const pattern = new RegExp(
            name.replace(/[-]/g, '[-]') + '\\.bundle\\.[a-f0-9]{12}\\.js',
            'g',
        );
        const updated = html.replace(pattern, (old) => {
            if (old !== entry.file) {
                changed++;
                console.info(`  index.html: ${old} → ${entry.file}`);
            }
            return entry.file;
        });
        html = updated;
    }

    if (changed > 0) {
        writeFileSync(INDEX_HTML, html, 'utf8');
        console.info(`[bundle-legacy] 📝 index.html updated (${changed} hash(es) replaced)`);
    } else {
        console.info('[bundle-legacy] 📝 index.html already up-to-date');
    }
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
    console.info('[bundle-legacy] 🚀 HEYS Legacy Bundle Builder');
    console.info(`  web dir : ${WEB_DIR}`);
    console.info(`  output  : ${PUB_DIR}`);
    if (DRY_RUN) console.info('  mode    : DRY RUN (no files written)');
    if (ONLY) console.info(`  filter  : "${ONLY}" only`);

    if (!DRY_RUN) {
        mkdirSync(PUB_DIR, { recursive: true });
        cleanOldBundles(ONLY || null);
    }

    const entries = Object.entries(BUNDLES);
    const toRun = ONLY ? entries.filter(([n]) => n === ONLY) : entries;

    if (toRun.length === 0) {
        console.error(`[bundle-legacy] ❌ Unknown bundle "${ONLY}". Available: ${Object.keys(BUNDLES).join(', ')}`);
        process.exit(1);
    }

    const manifest = {};
    const t0 = Date.now();

    for (const [name, files] of toRun) {
        process.stdout.write(`  📦 ${name.padEnd(22)} (${String(files.length).padStart(3)} files) ... `);
        const r = buildBundle(name, files);   // throws on missing files → exits
        manifest[r.name] = {
            file: r.file,
            hash: r.hash,
            fileCount: r.fileCount,
            size: r.size,
            builtAt: new Date().toISOString(),
        };
        console.info(`✅ ${r.file}  ${fmtSize(r.size)}`);
    }

    // Манифест пишем только при полном прогоне (не --bundle=X)
    if (!DRY_RUN && !ONLY) {
        writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2), 'utf8');
        console.info(`\n[bundle-legacy] 📋 Manifest → ${MANIFEST}`);

        // Копируем манифест в public/ — SW читает /bundle-manifest.json при install
        // для proactive precache boot-бандлов (без этого файла SW не видит бандлы)
        const PUBLIC_MANIFEST = resolve(PUB_DIR, 'bundle-manifest.json');
        writeFileSync(PUBLIC_MANIFEST, JSON.stringify(manifest, null, 2), 'utf8');
        console.info(`[bundle-legacy] 📋 Manifest → ${PUBLIC_MANIFEST} (SW copy)`);

        // Обновляем CACHE_VERSION в sw.js — новое значение → браузер видит изменение SW
        // → переустанавливает SW → precache загружает свежие boot-бандлы
        const SW_PATH = resolve(PUB_DIR, 'sw.js');
        if (existsSync(SW_PATH)) {
            const swContent = readFileSync(SW_PATH, 'utf8');
            const newVersion = `heys-${Date.now()}`;
            const updated = swContent.replace(
                /const CACHE_VERSION = 'heys-\d+';/,
                `const CACHE_VERSION = '${newVersion}';`,
            );
            if (updated !== swContent) {
                writeFileSync(SW_PATH, updated, 'utf8');
                console.info(`[bundle-legacy] 🔄 sw.js CACHE_VERSION → ${newVersion}`);
            } else {
                console.warn('[bundle-legacy] ⚠️ sw.js CACHE_VERSION pattern not found — проверь вручную');
            }
        }

        syncIndexHtml(manifest);
    }

    // ── Step: Pre-compress bundles with gzip ─────────────────────────────
    // Yandex Object Storage не сжимает автоматически.
    // Создаём .gz рядом с .js → CI загружает .gz с Content-Encoding: gzip.
    // Браузер распаковывает прозрачно; SW кэширует уже распакованный response.
    if (!DRY_RUN) {
        console.info('\n[bundle-legacy] 🗜️  Pre-compressing bundles (gzip -9)...');
        let totalRaw = 0;
        let totalGz = 0;

        for (const entry of Object.values(manifest)) {
            const jsPath = resolve(PUB_DIR, entry.file);
            const raw = readFileSync(jsPath);
            const gz = gzipSync(raw, { level: 9 });
            writeFileSync(jsPath + '.gz', gz);
            totalRaw += raw.length;
            totalGz += gz.length;
            const pct = (100 - (gz.length / raw.length) * 100).toFixed(0);
            console.info(`  ${entry.file}: ${fmtSize(raw.length)} → ${fmtSize(gz.length)} (${pct}% saved)`);
        }

        // Also compress react-bundle.js (blocking script, ~139KB → ~45KB)
        const reactPath = resolve(WEB_DIR, 'react-bundle.js');
        if (existsSync(reactPath)) {
            const raw = readFileSync(reactPath);
            const gz = gzipSync(raw, { level: 9 });
            writeFileSync(resolve(PUB_DIR, 'react-bundle.js.gz'), gz);
            totalRaw += raw.length;
            totalGz += gz.length;
            const pct = (100 - (gz.length / raw.length) * 100).toFixed(0);
            console.info(`  react-bundle.js: ${fmtSize(raw.length)} → ${fmtSize(gz.length)} (${pct}% saved)`);
        }

        console.info(`[bundle-legacy] 🗜️  Total: ${fmtSize(totalRaw)} → ${fmtSize(totalGz)} (${(100 - (totalGz / totalRaw) * 100).toFixed(0)}% saved)`);
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const totalSize = Object.values(manifest).reduce((s, v) => s + v.size, 0);
    console.info(`[bundle-legacy] ✅ Done in ${elapsed}s  total ${fmtSize(totalSize)}`);
}

main().catch(err => {
    console.error('\n[bundle-legacy] ❌ Fatal:', err.message);
    process.exit(1);
});
