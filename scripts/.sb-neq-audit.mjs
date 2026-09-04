#!/usr/bin/env node
/**
 * Audit all «≠» in strength-builder.json — read-only handoff for owner.
 * Output: scripts/.sb-neq-audit-handoff.json
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERDICT_PATH = path.join(ROOT, 'docs/ui/verdicts/strength-builder.json');
const CANVAS_PATH = path.join(
  ROOT,
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/strength-builder.v4.dc.html',
);
const OUT_PATH = path.join(ROOT, 'scripts/.sb-neq-audit-handoff.json');

const hash = (value) => crypto.createHash('sha1').update(value).digest('hex').slice(0, 12);

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function canvasDataV(canvas, key) {
  const re = new RegExp(`<b>${escapeRe(key)}</b><span data-v="([^"]*)"`, 'u');
  const m = canvas.match(re);
  return m ? m[1] : null;
}

function isFConcrete(f) {
  if (!f || f.length < 40) return false;
  return (
    /apps\/web\/|750-strength|\.css:|\.js:|:\d+[–-]?\d*|\.sb-|var\(--v4|test\.js|heys_strength/i.test(f)
    || (f.length >= 80 && /контракт|кадр|runtime|продукт|DOM|CSS|геометр|superset_ui|builder_ui|proposal_ui/i.test(f))
  );
}

function readStrengthSources() {
  const strengthDir = path.join(ROOT, 'apps/web/strength');
  const files = fs.readdirSync(strengthDir).filter((f) => f.endsWith('.js'));
  const all = files.map((f) => fs.readFileSync(path.join(strengthDir, f), 'utf8')).join('\n');
  return all;
}

const strengthAll = readStrengthSources();

/**
 * Audit of unique f-text (27 patterns). reasonAlive = discrepancy still holds.
 * recommend: default when all checks pass; recommendIfStale when f-claim disproven but gap may remain.
 */
const F_AUDIT = {
  'Нет отдельного сравнения snapshot назначенного плана с фактически выполненным объёмом.': {
    reasonAlive: false,
    recommend: '?',
    fDraft:
      'PlanVsDoneScreen (heys_strength_superset_ui_v1.js:2108-2152) сравнивает planSnapshot vs workoutLog; f «нет сравнения» устарел. Canvas-кадры Г2 ·01-37 — full-screen отчёт цикла, геометрия не сведена с in-session sheet.',
    note: 'Причина «нет экрана» мертва; ≠ по кадру Г2 — пересмотреть с усиленным f.',
  },
  'В runtime нет canvas-экрана цикла с фазами недель и единым счётом; есть только частичная program summary.': {
    reasonAlive: true,
    recommend: '≠',
    fDraft:
      'CycleScreen по grep отсутствует; ProgramDoneScreen (proposal_ui:505+) — итог, не экран цикла. Кадры «Программа · цикл · 01-34» не рендерятся.',
  },
  'Отдельный исход предложения для ранее пропущенного дня в клиентском UI отсутствует.': {
    reasonAlive: true,
    recommend: '≠',
    fDraft:
      'SkipSheet (superset_ui:2245+) — пропуск текущего дня; кадры «Правка · пропущен раньше · 01-22» — curator proposal flow для прошлого дня, клиентский исход не построен.',
  },
  'Жизненный цикл дня не предоставляет builder действия завершить прошлым временем/удалить; автозавершение не добавлялось.': {
    reasonAlive: true,
    recommend: '≠',
    fDraft:
      'В heys_strength_builder_ui_v1.js нет finishPastDay/deletePastSession; кадры «Сессия · … · 01-22» (post-hoc lifecycle) не рендерятся.',
  },
  'Итог программы реализован частично и не воспроизводит состав и геометрию canvas-кадра.': {
    reasonAlive: true,
    recommend: '≠',
    fDraft:
      'ProgramDoneScreen (proposal_ui:505-562) функционален; canvas «Программа пройдена · 01-21» — другая геометрия hero/блоков роста.',
  },
  'В клиенте нет отдельного canvas-отчёта за период; существующая program summary не подтверждает этот кадр.': {
    reasonAlive: true,
    recommend: '≠',
    fDraft:
      'PeriodReportScreen/CycleReportScreen отсутствуют; «вид · отчёт за период» + кадры «Программа пройдена» не покрыты ProgramDoneScreen как stop-кадр.',
  },
  'Отдых в карточке — строка А1б .sb-rest-copy; кадр Е1 документирует .sb-rest-cd колонкой «Отдых/из тяжести/вручную» — разметка .sb-rest-cd есть, видимость А1б.': {
    reasonAlive: true,
    recommend: '≠',
    fDraft:
      'superset_ui:1713 .sb-rest-copy видим; .sb-rest-cd aria-hidden (:1724+). Кадр Е1 колонкой не сведён — 750-strength-builder.css rest-block.',
  },
  'Кадр Е1 рисует шапку упражнения и бейдж «3 из 3»; в проде список А1б держит шапку сессии и счётчик в .sb-ex-count (2/4) — heys_strength_builder_ui_v1.js .sb-head.': {
    reasonAlive: true,
    recommend: '≠',
    fDraft:
      'А1б: .sb-head sessionTitle + .sb-ex-count (builder_ui:1236, superset_ui:1979); кадр Е1 — шапка упражнения + badge «3 из 3».',
  },
};

/** Per-key overrides (unique f or special recommend) */
const KEY_AUDIT = {
  каталог: {
    reasonAlive: true,
    recommend: '≠',
    fDraft:
      'Поведение =; расхождение в строке «каталог»: контракт «60 кг × 8», кадр/код «60 × 8». catalog_ui:78-89,164-167; strength-builder-ui.test.js:512.',
  },
  'третий пропуск подряд — сигнал куратору': {
    reasonAlive: true,
    recommend: '≠',
    fDraft:
      'Счётчика трёх назначенных подряд и curator signal нет; SkipSheet (superset_ui:1494+) — локальный пропуск.',
  },
  'вес выше плана — прогресс, а не нарушение': {
    reasonAlive: true,
    recommend: '≠',
    fDraft:
      'Цвет «сделано больше — зелёный» не рендерится; PlanVsDoneScreen :2143 is-match/is-diff без over-plan green.',
  },
  'шторка нужна разработчику первой': {
    reasonAlive: true,
    recommend: '≠',
    fDraft:
      'sheetRows (superset_ui:2160-2199) без «отчёт цикла»; контракт dev-first шторку с cycle report не закрыт.',
  },
  'прочерк — значение, а не пустота': {
    reasonAlive: true,
    recommend: '≠',
    fDraft:
      'Прочерки «—» в .sb-cell.is-blank (superset_ui:242,718), не .dash 56 % из контракта.',
  },
  'Конструктор · итоги · 58': {
    reasonAlive: true,
    recommend: '≠',
    fDraft:
      '«В шаблоны» в FinishScreen нет; save-flow снят (UI_V4 § Б3). finish-v4-canvas-contract.test.js row 58 исключён.',
  },
  'Перенос · след в обе стороны · 18': {
    reasonAlive: false,
    recommend: '?',
    fDraft:
      'f «canvas: нет механизма» vs runtime movedTo/sb-plan-badge (superset_ui:2397-2402). Контракт «перенос — не отдельный мехanism» описывает target-first; кадр ·18 — пилюля «занят» rgba(ink,.4) — сверить геометрию.',
    note: 'Причина «runtime нет переноса» мертва; пересмотреть ≠ vs обновить контракт.',
  },
  'Куратор и зал · 03': {
    reasonAlive: true,
    recommend: '≠',
    fDraft: 'sessionTitle(exercises), не «Тренировка идёт»: builder_ui:1208, superset_ui sessionTitle:405.',
  },
  'Куратор и зал · 04': {
    reasonAlive: true,
    recommend: '≠',
    fDraft: 'Подзаголовок fmtTime, без «что приходит от куратора…»: builder_ui:1209-1212.',
  },
  'Куратор и зал · 12': {
    reasonAlive: true,
    recommend: '≠',
    fDraft: 'CuratorPlanStrip showActions:false mid-session: builder_ui:1257-1262.',
  },
  'Куратор и зал · 13': {
    reasonAlive: true,
    recommend: '≠',
    fDraft: '«Начать по плану» не рендерится mid-session: superset_ui CuratorPlanStrip:2026-2028.',
  },
  'Куратор и зал · 14': {
    reasonAlive: true,
    recommend: '≠',
    fDraft: '«Своя» не рендерится mid-session: superset_ui:2027-2028.',
  },
  'Куратор и зал · 23': {
    reasonAlive: true,
    recommend: '≠',
    fDraft: '«Снять подход» disabled — video не поддерживается: superset_ui:1653-1658.',
  },
  'Куратор и зал · 32': {
    reasonAlive: true,
    recommend: '≠',
    fDraft: '«отправлено в …» — var(--sb-mut), не var(--gr): 750-strength-builder.css:5703-5706.',
  },
  'Куратор и зал · 36': {
    reasonAlive: true,
    recommend: '≠',
    fDraft: '«не отправлена» только при notePending+sync pending: buildSyncQueueRows:2071-2077.',
  },
  'План в ленте дня · 18': {
    reasonAlive: true,
    recommend: '≠',
    fDraft: 'Unsafe early start намеренно absent — owner contract без fact-date rule.',
  },
  'План в ленте дня · 19': {
    reasonAlive: true,
    recommend: '≠',
    fDraft: 'Transfer — sole primary action после снятия unsafe early start (owner decision).',
  },
  'День не состоялся · 17': {
    reasonAlive: false,
    recommend: '?',
    fDraft:
      'Kernel исключает assigned/skipped/moved из тоннажа; canvas помечает как «долг кода». Расхождение контракт↔ядро — не UI-дефект.',
    note: 'Код соответствует kernel; ≠ по canvas-footnote — пересмотреть контракт или снять.',
  },
  'Конструктор · тренировка идёт · спокойнее · 11': {
    reasonAlive: true,
    recommend: '≠',
    fDraft:
      '⠿ намеренно не рендерится (нет reorder persistence); calm-canvas-contract.test.js:243-244, UI_V4_CODEX § intentional.',
  },
};

function decideRow(key, row, canvas) {
  const f = row.f || '';
  const dv = canvasDataV(canvas, key);
  const frameStable = dv !== null && hash(dv) === row.h;
  const fConcrete = isFConcrete(f);

  const keyAudit = KEY_AUDIT[key];
  const fAudit = F_AUDIT[f];

  let reasonAlive;
  let recommend;
  let fDraft;
  let note;

  if (keyAudit && keyAudit.recommend) {
    ({ reasonAlive, recommend, fDraft, note } = keyAudit);
  } else if (fAudit) {
    ({ reasonAlive, recommend, fDraft, note } = fAudit);
  } else {
    reasonAlive = true;
    recommend = '≠';
    fDraft = f.length >= 40 ? `${f} [аудит 2026-09-04]` : `${key}: усилить f file:line`;
    note = 'f без автопроверки; reasonAlive=true — кадр не сведён.';
  }

  if (!frameStable) {
    recommend = '?';
    note = [note, 'frameStable: hash не совпал или ключ не в канвасе.'].filter(Boolean).join(' ');
  } else if (fConcrete && reasonAlive && frameStable && recommend !== '?') {
    recommend = recommend || '≠';
  } else if (!reasonAlive && frameStable) {
    recommend = recommend === '≠' ? '?' : (recommend || '?');
    if (!note) note = 'Причина в f не подтверждена кодом 2026-09-04.';
  }

  if (!fConcrete && recommend === '≠' && reasonAlive && frameStable) {
    note = [note, 'f слабый — усилить file:line при применении.'].filter(Boolean).join(' ');
  }

  return {
    key,
    current: '≠',
    recommend,
    checks: { fConcrete, reasonAlive, frameStable },
    fDraft,
    ...(note ? { note } : {}),
  };
}

function main() {
  const data = JSON.parse(fs.readFileSync(VERDICT_PATH, 'utf8'));
  const canvas = fs.readFileSync(CANVAS_PATH, 'utf8');
  const neqEntries = Object.entries(data.rows).filter(([, r]) => r.v === '≠');

  const rows = neqEntries.map(([key, row]) => decideRow(key, row, canvas));

  const summary = {
    checked: neqEntries.length,
    confirmedNeq: rows.filter((r) => r.recommend === '≠').length,
    suggestQuestion: rows.filter((r) => r.recommend === '?').length,
    suggestEquals: rows.filter((r) => r.recommend === '=').length,
  };

  const out = {
    zone: 'strength-builder',
    generated: '2026-09-04',
    agent: 'neq audit subagent',
    summary,
    rows,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(summary, null, 2));
}

main();
