#!/usr/bin/env node
/**
 * HEYS v2 — Legacy JS Bundler
 *
 * Конкатенирует 246 legacy <script defer> файлов в 3 бандла по приоритету.
 * Запускается как post-build шаг через Vite plugin (vite-plugin-bundle-legacy.js).
 *
 * Группы:
 *   critical.bundle.js  — fetchpriority="high" файлы (auth, core, storage, app shell)
 *   features.bundle.js  — fetchpriority="low": day, insights, advice, iw, cycle, refeed
 *   lazy.bundle.js      — fetchpriority="low": widgets, reports, supplements, phenotype
 *
 * В production index.html 246 <script> тегов заменяются на 3.
 * В dev-режиме (NODE_ENV=development) скрипт не запускается — HMR работает как раньше.
 *
 * @version 1.0.0
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Пути ────────────────────────────────────────────────────────────────────
const WEB_ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(WEB_ROOT, 'dist');
const INDEX_HTML = path.join(DIST_DIR, 'index.html');

// Имена выходных файлов (без хеша — инвалидация через CACHE_VERSION в sw.js)
const BUNDLE_CRITICAL = 'heys-critical.bundle.js';
const BUNDLE_FEATURES = 'heys-features.bundle.js';
const BUNDLE_LAZY = 'heys-lazy.bundle.js';

// ─── Классификация файлов ─────────────────────────────────────────────────────
/**
 * Классифицирует src скрипта в один из трёх бандлов.
 * Возвращает 'critical' | 'features' | 'lazy' | 'skip'.
 * 'skip' — react-bundle.js и другие файлы, которые уже обрабатываются Vite.
 */
function classify(src) {
    // Убираем query string
    const clean = src.split('?')[0];

    // Vite-managed assets — не трогаем
    if (clean.startsWith('assets/') || clean.startsWith('/assets/')) return 'skip';
    // react-bundle, twemoji и прочие CDN-замены
    if (clean.includes('react-bundle') || clean.includes('twemoji')) return 'skip';
    // SW регистрация
    if (clean.includes('register-sw') || clean.includes('service-worker')) return 'skip';

    const name = path.basename(clean);

    // ── CRITICAL (high priority — нужны до первого рендера) ──────────────────
    // Bootstrap, platform, core infrastructure
    if (/^heys_(dev_utils|feature_flags|module_perf|module_loader|bootstrap|platform_apis|pwa_module|simple_analytics)/.test(name)) return 'critical';
    if (/^heys_(smart_search|shared_products_export_fields|export_utils|core_v12|yandex_api|cloud_merge|cloud_storage_utils|cloud_shared|cloud_queue|storage_photos|storage_supabase|models|storage_layer)/.test(name)) return 'critical';
    // Auth & Subscription
    if (/^heys_(auth|subscription|trial_queue|paywall|login_screen|ui_onboarding)/.test(name)) return 'critical';
    // App shell infrastructure (heys_app_* with high priority)
    if (/^heys_app_(hooks|tabs|gates|shell|overlays|gate_flow|backup|shortcuts|onboarding|auth_init|client_helpers|desktop_gate|morning_checkin|swipe_nav|runtime_effects|sync_effects|tab_state|client_management|backup_actions|backup_export|update_checks|update_notifications|cloud_init|client_state_manager|date_state|derived_state|shell_props|overlays_props|gate_state|global_bindings|backup_state|banner_state|client_init|twemoji_effect|runtime_state|core_state|root_impl|root_component|root|dependency_loader|ui_state|initialize|entry)/.test(name)) return 'critical';
    if (/^heys_app_v12/.test(name)) return 'critical';
    if (/^heys_(early_warning_panel|gamification_bar)/.test(name)) return 'critical';

    // ── LAZY (явно defer-able: отчёты, виджеты, доп. модули) ────────────────
    if (/^heys_(widgets_events|widgets_registry|widgets_data_crash_risk|widgets_core|widgets_ui)/.test(name)) return 'lazy';
    if (clean.includes('widgets/widget_data')) return 'lazy';
    if (/^heys_(monthly_reports_service|monthly_reports|reports_tab_impl|reports_v12|weekly_reports|data_overview)/.test(name)) return 'lazy';
    if (/^heys_(supplements|supplements_science|phenotype|metabolic_intelligence)/.test(name)) return 'lazy';
    if (/^heys_(cycle|refeed|sms|consents|subscriptions|status)/.test(name)) return 'lazy';
    if (/^insights\/(pi_pattern_debugger|pi_ui_dashboard|pi_ui_cards|pi_ui_rings|pi_ui_helpers|pi_ui_whatif|pi_outcome_modal)/.test(clean)) return 'lazy';

    // ── FEATURES (всё остальное — day, insights, advice, iw) ────────────────
    return 'features';
}

// ─── Парсинг index.html ───────────────────────────────────────────────────────
/**
 * Извлекает все <script src=...> теги из html.
 * Возвращает массив { src, fullTag, fetchpriority, defer }.
 */
function parseScriptTags(html) {
    const regex = /<script([^>]*)><\/script>/g;
    const results = [];
    let m;
    while ((m = regex.exec(html)) !== null) {
        const attrs = m[1];
        const srcMatch = attrs.match(/src=["']([^"']+)["']/);
        if (!srcMatch) continue;
        const src = srcMatch[1];
        const fetchpriority = (attrs.match(/fetchpriority=["']([^"']+)["']/) || [])[1] || 'auto';
        const defer = attrs.includes('defer');
        results.push({ src, fullTag: m[0], fetchpriority, defer });
    }
    return results;
}

// ─── Конкатенация файлов ──────────────────────────────────────────────────────
function readFileOrEmpty(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch {
        console.warn(`[HEYS.bundle] ⚠️  File not found, skipping: ${filePath}`);
        return `/* FILE NOT FOUND: ${filePath} */\n`;
    }
}

function buildBundle(scripts, distDir, webRoot) {
    const parts = [];
    for (const { src } of scripts) {
        const cleanSrc = src.split('?')[0];
        // Пробуем найти файл в dist, потом в webRoot (для static-copy)
        const fromDist = path.join(distDir, cleanSrc);
        const fromRoot = path.join(webRoot, cleanSrc);
        const content = fs.existsSync(fromDist)
            ? readFileOrEmpty(fromDist)
            : readFileOrEmpty(fromRoot);
        parts.push(`\n/* ── ${cleanSrc} ── */\n${content}`);
    }
    return parts.join('\n');
}

function contentHash(content) {
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 8);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function run() {
    console.info('[HEYS.bundle] ✅ Starting legacy JS bundling...');

    if (!fs.existsSync(INDEX_HTML)) {
        console.error(`[HEYS.bundle] ❌ dist/index.html not found at: ${INDEX_HTML}`);
        console.error('[HEYS.bundle] ❌ Run pnpm build first, then this script.');
        process.exit(1);
    }

    let html = fs.readFileSync(INDEX_HTML, 'utf8');
    const scripts = parseScriptTags(html);

    console.info(`[HEYS.bundle] ✅ Found ${scripts.length} <script src> tags`);

    // Классифицируем скрипты
    const groups = { critical: [], features: [], lazy: [], skip: [] };
    for (const s of scripts) {
        const group = classify(s.src);
        groups[group].push(s);
    }

    console.info(`[HEYS.bundle] ✅ Classification:
  critical : ${groups.critical.length} files
  features : ${groups.features.length} files
  lazy     : ${groups.lazy.length} files
  skip     : ${groups.skip.length} files (Vite-managed, untouched)`);

    // Строим бандлы
    const criticalContent = buildBundle(groups.critical, DIST_DIR, WEB_ROOT);
    const featuresContent = buildBundle(groups.features, DIST_DIR, WEB_ROOT);
    const lazyContent = buildBundle(groups.lazy, DIST_DIR, WEB_ROOT);

    // Добавляем хеш для cache busting
    const criticalHash = contentHash(criticalContent);
    const featuresHash = contentHash(featuresContent);
    const lazyHash = contentHash(lazyContent);

    const criticalFile = BUNDLE_CRITICAL.replace('.bundle.js', `.bundle.${criticalHash}.js`);
    const featuresFile = BUNDLE_FEATURES.replace('.bundle.js', `.bundle.${featuresHash}.js`);
    const lazyFile = BUNDLE_LAZY.replace('.bundle.js', `.bundle.${lazyHash}.js`);

    fs.writeFileSync(path.join(DIST_DIR, criticalFile), criticalContent, 'utf8');
    fs.writeFileSync(path.join(DIST_DIR, featuresFile), featuresContent, 'utf8');
    fs.writeFileSync(path.join(DIST_DIR, lazyFile), lazyContent, 'utf8');

    const criticalKB = (Buffer.byteLength(criticalContent, 'utf8') / 1024).toFixed(0);
    const featuresKB = (Buffer.byteLength(featuresContent, 'utf8') / 1024).toFixed(0);
    const lazyKB = (Buffer.byteLength(lazyContent, 'utf8') / 1024).toFixed(0);

    console.info(`[HEYS.bundle] ✅ Bundles written:
  ${criticalFile}  (${criticalKB} KB)
  ${featuresFile}  (${featuresKB} KB)
  ${lazyFile}      (${lazyKB} KB)`);

    // Заменяем все классифицированные <script> теги в index.html
    const allClassifiedTags = [
        ...groups.critical.map(s => s.fullTag),
        ...groups.features.map(s => s.fullTag),
        ...groups.lazy.map(s => s.fullTag),
    ];

    // Удаляем все классифицированные теги
    for (const tag of allClassifiedTags) {
        html = html.replace(tag, '');
    }

    // Вставляем 3 бандла перед закрывающим </body>
    const bundleScripts = [
        `    <script defer src="${criticalFile}" fetchpriority="high"></script>`,
        `    <script defer src="${featuresFile}" fetchpriority="low"></script>`,
        `    <script defer src="${lazyFile}" fetchpriority="low"></script>`,
    ].join('\n');

    html = html.replace('</body>', `${bundleScripts}\n  </body>`);

    // Убираем пустые строки, возникшие после удаления тегов
    html = html.replace(/\n{3,}/g, '\n\n');

    fs.writeFileSync(INDEX_HTML, html, 'utf8');

    console.info(`[HEYS.bundle] ✅ index.html updated: ${allClassifiedTags.length} script tags → 3 bundles`);
    console.info(`[HEYS.bundle] ✅ HTTP requests: ${scripts.length + groups.skip.length} → ${groups.skip.length + 3}`);
}

run();
