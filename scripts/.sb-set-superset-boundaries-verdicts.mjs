// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.
import { patchZoneRow, setVerdictKey } from './lib/ui-v4-verdicts.mjs';

const TEST = 'apps/web/__tests__/strength-superset-boundaries-v4-canvas-contract.test.js';
const CSS = 'apps/web/styles/modules/750-strength-builder.css';
const SS = 'apps/web/strength/heys_strength_superset_ui_v1.js';
const PROP = 'apps/web/strength/heys_strength_proposal_ui_v1.js';

const ITEMS = [
  ['Связка · границы правки · 01', `Шапка кадра: .sb-ss-bound-screen .sb-head с .sb-icon-btn и .sb-head-title — ${SS}:1533-1540; стандартная sb-head из ${CSS}.`],
  ['Связка · границы правки · 02', `Колонка заголовка: .sb-ss-bound-head { flex-direction:column; gap:3px } — ${CSS}:3817-3820; computed row 02 в ${TEST}.`],
  ['Связка · границы правки · 03', `Имя экрана «{who} заменил связку»: h('b', …) — ${SS}:1538; DOM ${TEST}.`],
  ['Связка · границы правки · 04', `Ключ «связка не начата»: .sb-head-sub из replacements[0].key — ${SS}:1531,1539; ${PROP}:211-214.`],
  ['Связка · границы правки · 05', `Прокрутка: .sb-list.sb-ss-bound-scroll { flex:1; overflow-y:auto } — ${SS}:1542; ${CSS}:3823-3825,156-160.`],
  ['Связка · границы правки · 06', `Карточка пары: .sb-ss-bound-grp { margin-top:12px } — ${CSS}:3827-3829.`],
  ['Связка · границы правки · 07', `Ряд было→станет: .sb-ss-bound-pair { display:flex; gap:9px; align-items:stretch } — ${CSS}:3831-3835.`],
  ['Связка · границы правки · 08', `Колонка «было»: .sb-ss-bound-col--was { flex:1; padding:10px; border-radius:12px; background:var(--sb-bg); inset border } — ${CSS}:3837-3847; computed row 08 ${TEST}.`],
  ['Связка · границы правки · 09', `Метка «было»: .sb-ss-bound-label--was { font:700 10px/1; letter-spacing:.04em; text-transform:uppercase; color:rgba(var(--ink),.56); margin-bottom:6px } — ${CSS}:3853-3863; ${SS}:1491.`],
  ['Связка · границы правки · 10', `Строки A1… в «было»: .sb-ss-bound-col--was .sb-ss-bound-lines { font:600 11.5px/1.5; color:rgba(var(--ink),.56) } — ${CSS}:3869-3876; memberLines — ${SS}:1492-1495.`],
  ['Связка · границы правки · 11', `Стрелка «→»: .sb-ss-bound-arrow { flex:none; align-items:center; font:700 14px/1; color:rgba(var(--ink),.35) } — ${CSS}:3882-3888; ${SS}:1497; computed row 11 ${TEST}.`],
  ['Связка · границы правки · 12', `Колонка «станет»: .sb-ss-bound-col--will { flex:1; padding:10px; border-radius:12px; background:var(--sb-soft) } — ${CSS}:3849-3851; computed row 12 ${TEST}.`],
  ['Связка · границы правки · 13', `Метка «станет»: .sb-ss-bound-label--will { color:var(--sb-acc) } — ${CSS}:3865-3867; ${SS}:1499.`],
  ['Связка · границы правки · 14', `Строки A1… в «станет»: .sb-ss-bound-col--will .sb-ss-bound-lines { color:var(--sb-tx) } — ${CSS}:3878-3880; computed row 14 ${TEST}.`],
  ['Связка · границы правки · 15', `Сноска про целый блок: .sb-ss-bound-note после пары — текст ${SS}:1506-1507; margin-top:10px ${CSS}:3890-3894.`],
  ['Связка · границы правки · 16', `Ярус «Связка начата»: .sb-ss-bound-tier { margin:20px 0 10px; color:var(--sb-acc); font:700 10px/1; letter-spacing:.16em; text-transform:uppercase } — ${CSS}:3896-3902; ${SS}:1510.`],
  ['Связка · границы правки · 17', `Список заморозки: .sb-ss-bound-list { border-radius:16px; background:var(--sb-card) } — ${CSS}:3904-3908; ${SS}:1511-1520.`],
  ['Связка · границы правки · 18', `Строка без разделителя: .sb-ss-bound-row { padding:12px 14px } без border-bottom — ${CSS}:3910-3916; одна строка в кадре ${TEST}.`],
  ['Связка · границы правки · 19', `«Связка A · раунд 2 из 3»: .sb-ss-bound-row-title { color:var(--sb-tx); font:600 12.5px/1.2 } — ${CSS}:3925-3928; title из currentSupersetRound — ${PROP}:198-206.`],
  ['Связка · границы правки · 20', `«состав заморожен до конца»: .sb-ss-bound-row-sub { font:500 11px/1.3; color:rgba(var(--ink),.56) } — ${CSS}:3930-3933; ${SS}:1516.`],
  ['Связка · границы правки · 21', `Пилюля «закрыта»: .sb-ss-bound-badge { background:var(--sb-okbg); color:var(--sb-okTx) } — ${CSS}:3935-3944; computed row 21 ${TEST}.`],
  ['Связка · границы правки · 22', `Нижняя сноска про начатую связку: .sb-ss-bound-note после списка — текст ${SS}:1522-1523.`],
  ['Связка · границы правки · текст', `Полный текст кадра Д3: шапка, пара было/станет с раундами, две сноски, ярус и замороженная строка — ${SS}:1486-1524; DOM-смоук ${TEST}.`],
  ['вид · замена связки', `Кадр Д3: SupersetBoundariesScreen — .sb-ss-bound-pair с колонками was/will, .sb-ss-bound-tier, .sb-ss-bound-list и badge на --gr-bg/--gr; в разборе правки тот же SupersetBoundariesBody в .sb-proposal-boundaries — ${SS}:1527-1545, ${PROP}:309-315, ${CSS}:3816-3944; геометрия+цвет ${TEST}.`],
];

let changed = 0;
for (const [key, fact] of ITEMS) {
  setVerdictKey('strength-builder', key, { verdict: '=', fact, options: {} }, {
    skipIf: (row) => row.v === '=' && row.f === fact,
  });
  patchZoneRow('strength-builder', key, (row) => {
    delete row.evidence;
  });
  changed += 1;
  console.log(`${key}  → =`);
}
console.log(`updated ${changed} rows`);
