#!/usr/bin/env node
/**
 * ui-v4-check-screen-reachability.mjs — сторож «экран объявлен, входа нет».
 *
 * Проблема. Экран может быть объявлен, экспортирован, покрыт вердиктами «=» и
 * контракт-тестом — но ни один production-маршрут его не рендерит. Один grep по
 * имени функции этого не ловит: export и тесты выглядят как «используется».
 *
 * Два независимых способа (разной природы):
 *   1. symbol — h/createElement/Parts.XxxScreen вне declare/export;
 *   2. behavior — view-dispatch (view === '…' → Screen), setView, state-gate, day-mount.
 *
 * Охват: strength-builder + apps/web/strength + heys_day_trainings_v1.js.
 * Динамика вне набора — в «unchecked remainder», не молчаливый pass.
 *
 *   node scripts/ui-v4-check-screen-reachability.mjs
 *   node scripts/ui-v4-check-screen-reachability.mjs --json
 *   node scripts/ui-v4-check-screen-reachability.mjs --list
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const WEB_DIR = path.join(ROOT, 'apps', 'web');
const STRENGTH_DIR = path.join(WEB_DIR, 'strength');
const VERDICT_FILE = path.join(ROOT, 'docs', 'ui', 'verdicts', 'strength-builder.json');
const SCREEN_NAME_RE = /([A-Z][A-Za-z0-9]+Screen)/g;
const DECLARE_RE = /function\s+([A-Z][A-Za-z0-9]+Screen)\s*\(/g;

const BEHAVIOR_FILES = [
  path.join(STRENGTH_DIR, 'heys_strength_builder_ui_v1.js'),
  path.join(STRENGTH_DIR, 'heys_strength_catalog_ui_v1.js'),
  path.join(STRENGTH_DIR, 'heys_strength_superset_ui_v1.js'),
  path.join(STRENGTH_DIR, 'heys_strength_proposal_ui_v1.js'),
  path.join(STRENGTH_DIR, 'heys_strength_finish_ui_v1.js'),
  path.join(WEB_DIR, 'heys_day_trainings_v1.js'),
].filter((f) => fs.existsSync(f));

const SKIP_DIRS = new Set(['__tests__', 'node_modules', 'public', 'coverage', 'dist']);

function parseArgs(argv) {
  const options = { json: false, list: false };
  for (const arg of argv) {
    if (arg === '--json') options.json = true;
    else if (arg === '--list') options.list = true;
    else throw new Error(`Неизвестный аргумент: ${arg}`);
  }
  return options;
}

function lineAt(source, offset) {
  return source.slice(0, offset).split('\n').length;
}

function rel(file) {
  return path.relative(ROOT, file).replaceAll('\\', '/');
}

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function listProductionJsFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...listProductionJsFiles(abs));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.js')) out.push(abs);
  }
  return out.sort();
}

function verdictBackedScreens() {
  const data = JSON.parse(readText(VERDICT_FILE));
  const counts = new Map();
  for (const row of Object.values(data.rows || {})) {
    if (row.v !== '=') continue;
    for (const match of String(row.f || '').matchAll(SCREEN_NAME_RE)) {
      const name = match[1];
      counts.set(name, (counts.get(name) || 0) + 1);
    }
  }
  return counts;
}

function declaredScreens() {
  const decl = new Map();
  for (const file of listProductionJsFiles(STRENGTH_DIR)) {
    const source = readText(file);
    for (const match of source.matchAll(DECLARE_RE)) {
      const name = match[1];
      if (!decl.has(name)) decl.set(name, { file: rel(file), line: lineAt(source, match.index) });
    }
  }
  return decl;
}

function isExportLine(lineText, screenName) {
  return new RegExp(`[\\w.]+\\.${screenName}\\s*=\\s*${screenName}\\b`).test(lineText)
    || new RegExp(`\\b${screenName}\\s*=\\s*${screenName}\\b`).test(lineText);
}

function collectSymbolIndex(screenNames, fileEntries) {
  const hitsByScreen = new Map(screenNames.map((name) => [name, []]));
  const nameList = [...screenNames];

  for (const { file, source } of fileEntries) {
    if (file.includes('__tests__')) continue;
    const lines = source.split('\n');

    lines.forEach((lineText, lineIndex) => {
      const line = lineIndex + 1;
      if (/^\s*(\/\/|\*)/.test(lineText)) return;
      if (!lineText.includes('Screen')) return;

      for (const screenName of nameList) {
        if (new RegExp(`function\\s+${screenName}\\s*\\(`).test(lineText)) continue;
        if (isExportLine(lineText, screenName)) continue;

        const firstArgRes = [
          new RegExp(`\\bh\\(\\s*(?:[\\w$]+\\.|\\([^)]+\\)\\.)?${screenName}\\s*[,)]`),
          new RegExp(`\\bh\\(\\s*FinUIRef\\(\\)\\.${screenName}\\s*[,)]`),
          new RegExp(`\\bcreateElement\\(\\s*(?:[\\w$]+\\.|\\([^)]+\\)\\.)?${screenName}\\s*[,)]`),
          new RegExp(`\\bh\\(\\s*${screenName}\\s*[,)]`),
        ];
        const partsUseRe = new RegExp(
          `\\b(?:Parts|CatUI|Cat|FinUIRef\\(\\)|Fin\\.)${screenName}\\s*[,)]`,
        );

        let matched = false;
        for (const re of firstArgRes) {
          if (re.test(lineText)) {
            hitsByScreen.get(screenName).push({ kind: 'render', file, line, text: lineText.trim() });
            matched = true;
            break;
          }
        }
        if (!matched && partsUseRe.test(lineText)) {
          hitsByScreen.get(screenName).push({ kind: 'parts-ref', file, line, text: lineText.trim() });
        }
      }
    });

    for (const screenName of nameList) {
      if (new RegExp(`\\bScreen\\s*=\\s*Parts\\.${screenName}\\b`).test(source)) {
        hitsByScreen.get(screenName).push({
          kind: 'dynamic-assign',
          file,
          line: 0,
          text: `Screen = Parts.${screenName}`,
        });
      }
    }
  }

  return hitsByScreen;
}

function extractViewDispatches(builderSource, builderFile) {
  const routes = [];
  const re = /if\s*\(\s*view\s*===\s*'([^']+)'[\s\S]{0,1600}?\}/g;
  for (const match of builderSource.matchAll(re)) {
    const viewKey = match[1];
    const block = match[0];
    const renderTarget = block.match(
      /\b(?:h|createElement)\(\s*(?:FinUIRef\(\)\.|(?:[\w$]+\.)|(?:\([^)]+\)\.))?([A-Z][A-Za-z0-9]+Screen)\s*[,)]/,
    );
    if (!renderTarget) continue;
    routes.push({
      viewKey,
      screen: renderTarget[1],
      file: builderFile,
      kind: 'view-dispatch',
    });
  }
  return routes;
}

function extractNavigationKeys(builderSource) {
  const keys = new Set();
  for (const match of builderSource.matchAll(/setView\(\s*'([^']+)'/g)) keys.add(match[1]);
  for (const match of builderSource.matchAll(/\bgo\(\s*'([^']+)'/g)) keys.add(match[1]);
  return keys;
}

function extractStateGates(catalogSource, catalogFile) {
  const gates = [];
  if (/createDraft\s*!==\s*null/.test(catalogSource) && /\bh\(\s*NewExerciseScreen\b/.test(catalogSource)) {
    gates.push({ gate: 'createDraft', screen: 'NewExerciseScreen', file: catalogFile, kind: 'state-gate' });
  }
  return gates;
}

function extractDayTrainingRoutes(daySource, dayFile) {
  const routes = [];
  for (const match of daySource.matchAll(/createElement\(\s*(?:Parts|HEYS\.StrengthBuilderParts)\.([A-Z][A-Za-z0-9]+Screen)\b/g)) {
    routes.push({ screen: match[1], file: dayFile, kind: 'day-mount' });
  }
  for (const match of daySource.matchAll(/\bScreen\s*=\s*Parts\.([A-Z][A-Za-z0-9]+Screen)\b/g)) {
    routes.push({ screen: match[1], file: dayFile, kind: 'day-assign' });
  }
  if (/builder\.open\s*\(/.test(daySource) || /StrengthBuilder\.open\s*\(/.test(daySource)) {
    routes.push({ screen: 'BuilderScreen', file: dayFile, kind: 'builder-open' });
  }
  return routes;
}

function extractOpenRender(builderSource, builderFile) {
  if (/function\s+open\s*\(/.test(builderSource) && /\bh\(\s*BuilderScreen\b/.test(builderSource)) {
    return [{ screen: 'BuilderScreen', file: builderFile, kind: 'open-render' }];
  }
  return [];
}

function buildBehaviorIndex(sources) {
  const index = [];
  for (const { file, source } of sources) {
    if (file.endsWith('heys_strength_builder_ui_v1.js')) {
      index.push(...extractViewDispatches(source, file));
      index.push(...extractOpenRender(source, file));
    }
    if (file.endsWith('heys_strength_catalog_ui_v1.js')) {
      index.push(...extractStateGates(source, file));
    }
    if (file.endsWith('heys_day_trainings_v1.js')) {
      index.push(...extractDayTrainingRoutes(source, file));
    }
  }
  return index;
}

function behaviorReach(screenName, behaviorIndex, navKeys, viewDispatches) {
  const direct = behaviorIndex.filter((item) => item.screen === screenName);
  if (direct.length) return { ok: true, hits: direct };

  const routed = viewDispatches.filter((d) => d.screen === screenName);
  const entries = routed.filter((d) => navKeys.has(d.viewKey));
  if (entries.length) return { ok: true, hits: entries };

  return { ok: false, hits: [] };
}

function buildReport() {
  const verdictCounts = verdictBackedScreens();
  const declarations = declaredScreens();
  const symbolFiles = [
    ...listProductionJsFiles(STRENGTH_DIR),
    path.join(WEB_DIR, 'heys_day_trainings_v1.js'),
  ].filter((f) => fs.existsSync(f));
  const fileEntries = symbolFiles.map((file) => ({ file: rel(file), source: readText(file) }));
  const behaviorSources = BEHAVIOR_FILES.map((file) => ({ file: rel(file), source: readText(file) }));

  const builderFile = rel(path.join(STRENGTH_DIR, 'heys_strength_builder_ui_v1.js'));
  const builderSource = behaviorSources.find((s) => s.file === builderFile)?.source || '';
  const viewDispatches = extractViewDispatches(builderSource, builderFile);
  const navKeys = extractNavigationKeys(
    behaviorSources.map((s) => s.source).join('\n'),
  );
  const behaviorIndex = buildBehaviorIndex(behaviorSources);
  const symbolIndex = collectSymbolIndex([...verdictCounts.keys()], fileEntries);

  const screensChecked = [];
  const unreachable = [];
  const unchecked = [];

  for (const [screenName, verdictCount] of [...verdictCounts.entries()].sort()) {
    const decl = declarations.get(screenName);
    if (!decl) {
      unchecked.push({ screen: screenName, verdictCount, reason: 'нет function XxxScreen в apps/web/strength/' });
      continue;
    }

    const symHits = symbolIndex.get(screenName) || [];
    const symOk = symHits.some((h) => h.kind === 'render' || h.kind === 'parts-ref' || h.kind === 'dynamic-assign');
    const behavior = behaviorReach(screenName, behaviorIndex, navKeys, viewDispatches);
    const reachable = symOk || behavior.ok;

    const entry = {
      screen: screenName,
      verdictCount,
      declaredAt: `${decl.file}:${decl.line}`,
      symbol: { ok: symOk, hits: symHits.slice(0, 5) },
      behavior: { ok: behavior.ok, hits: behavior.hits.slice(0, 5) },
      reachable,
    };
    screensChecked.push(entry);
    if (!reachable) unreachable.push(entry);
  }

  return {
    ok: unreachable.length === 0,
    scope: {
      zone: 'strength-builder',
      verdictFile: rel(VERDICT_FILE),
      screensChecked: screensChecked.length,
      verdictBackedNames: verdictCounts.size,
      declarationsFound: declarations.size,
      routesScanned: viewDispatches.length + behaviorIndex.length,
      navigationKeys: navKeys.size,
      symbolFilesScanned: symbolFiles.length,
      behaviorFilesScanned: BEHAVIOR_FILES.length,
      unchecked: unchecked.length,
      dynamicRemainder: [
        'heys_add_product_step_v1.js и прочие view/setView вне strength-builder',
        'createElement(Screen) где Screen = Parts.X без статического имени в той же строке',
        'fullscreen-mount кроме BuilderScreen.open',
      ],
    },
    screensChecked,
    unreachable,
    unchecked,
    viewDispatches,
  };
}

function printReport(report) {
  const s = report.scope;
  console.log(
    `UI v4 screen reachability (${s.zone}): проверено ${s.screensChecked} экранов ` +
    `(вердикт «=»), маршрутов ${s.routesScanned}, navigation ${s.navigationKeys}, ` +
    `symbol-файлов ${s.symbolFilesScanned}.`,
  );
  if (s.unchecked) {
    console.log(`Не проверено (нет объявления): ${s.unchecked}`);
    for (const item of report.unchecked) {
      console.log(`  ? ${item.screen} — ${item.reason} (вердиктов «=»: ${item.verdictCount})`);
    }
  }
  console.log(`Остаток вне статики: ${s.dynamicRemainder.join('; ')}.`);

  if (!report.unreachable.length) {
    console.log('✅ Все verdict-backed экраны с объявлением достижимы из production.');
    return;
  }

  console.error(`❌ Недостижимые экраны: ${report.unreachable.length}`);
  for (const item of report.unreachable) {
    console.error('');
    console.error(`${item.screen} — вердиктов «=»: ${item.verdictCount}, объявлен ${item.declaredAt}`);
    console.error(`  symbol: ${item.symbol.ok ? 'да' : 'нет'}`);
    console.error(`  behavior: ${item.behavior.ok ? 'да' : 'нет'}`);
    if (!item.symbol.ok && !item.behavior.ok) {
      const alt = report.viewDispatches.find((d) => d.viewKey === 'new' && item.screen === 'ExerciseCardScreen');
      if (alt) {
        console.error("  подсказка: view 'new' рендерит другой экран (NewExerciseScreen), не ExerciseCardScreen");
      } else {
        console.error('  подсказка: нет production render и нет view/state/day маршрута');
      }
    }
  }
}

function printList(report) {
  for (const item of report.screensChecked) {
    console.log(`${item.reachable ? 'ok' : 'UNREACHABLE'}\t${item.screen}\t${item.verdictCount}\t${item.declaredAt}`);
  }
  for (const item of report.unchecked) {
    console.log(`unchecked\t${item.screen}\t${item.verdictCount}\t—`);
  }
}

const options = parseArgs(process.argv.slice(2));
const report = buildReport();

if (options.json) {
  console.log(JSON.stringify(report, null, 2));
} else if (options.list) {
  printList(report);
} else {
  printReport(report);
}

if (!report.ok) process.exitCode = 1;
