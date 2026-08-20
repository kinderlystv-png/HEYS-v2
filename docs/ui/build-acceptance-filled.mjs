#!/usr/bin/env node
/** Regenerate ACCEPTANCE.md from canvas data-v + code audit verdicts (2026-08-20 v2) */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const pack = path.join(root, 'handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4');
const out = path.join(pack, 'ACCEPTANCE.md');

/** @param {string} html @param {'contract'|'all'} mode */
function extractSpecs(html, mode) {
  let slice = html;
  if (mode === 'contract') {
    const m = html.match(/<div class="ctr" data-contract="[^"]+">([\s\S]*?)<\/div>\s*\n\s*<div class="(?:pl|secH)/);
    if (!m) throw new Error('data-contract block not found');
    slice = m[1];
  }
  const re = /<div class="spec"[^>]*><b>([^<]+)<\/b><span data-v="([^"]*)"/g;
  /** @type {{key:string,value:string}[]} */
  const rows = [];
  let match;
  while ((match = re.exec(slice)) !== null) {
    rows.push({ key: match[1], value: match[2] });
  }
  return rows;
}

/** @type {Record<string, {v:string,f:string}>} */
const V = {
  // --- home-widgets (40) ---
  'home-widgets:экран': { v: '=', f: 'Сетка, капсула, расстановка, long-press — `heys_widgets_ui_v1.js`, `heys_widgets_variants_v4.js`' },
  'home-widgets:границы': { v: '=', f: 'Плитка в `.widget` продукта — `730-widgets-dashboard.css`' },
  'home-widgets:источник': { v: '=', f: 'Вода → water-add — `heys_widgets_ui_v1.js:3628`' },
  'home-widgets:демо': { v: '=', f: 'Правило канваса; петля 7 с не в коде' },
  'home-widgets:адресация': { v: '=', f: 'Канвас-мета (`data-screen-label`)' },
  'home-widgets:номера видов': { v: '=', f: 'Нет в продукте — `widget-variants-v4.test.js`' },
  'home-widgets:палитры': { v: '=', f: 'Роли `--v4-*` — `002-ui-v4-palette-roles.css`' },
  'home-widgets:сетка': { v: '=', f: 'Контракт gap 8 pad 16 верен; расхождение только из‑за MQ gap 6 — см. `второго gap нет`' },
  'home-widgets:колонка': { v: '=', f: 'Формула (w−56)/4 верна; ~79,8 на 375 после снятия gap 6' },
  'home-widgets:высота по рядам': { v: '=', f: '136 px верно после снятия gap 6 — см. `второго gap нет`' },
  'home-widgets:второго gap нет': { v: '=', f: 'MQ gap/pad 6 на ≤480px снят — `730-widgets-dashboard.css:2922`' },
  'home-widgets:рамка канваса': { v: '=', f: '375px — рамка сверки, не код' },
  'home-widgets:1×1': { v: '=', f: 'Число 21px; вода — заливка + норма — `:3628`' },
  'home-widgets:2×1': { v: '=', f: '`.widget-v4-row`, калории число+полоса' },
  'home-widgets:2×2': { v: '=', f: 'Герой ≤26px; калории 34px' },
  'home-widgets:3×2': { v: '=', f: 'БЖУ кольцами — `widgets-v4-sphere.test.js`' },
  'home-widgets:роли плитки': { v: '=', f: 'Контракт уточнён: терракота не фон плитки — совпадает с кодом' },
  'home-widgets:значение': { v: '=', f: 'Good через `var(--v4-ok-fill)` — `730-widgets-dashboard.css:9756`' },
  'home-widgets:кто красится': { v: '=', f: 'Контракт перечисляет 8 + герой; код красит те же — `widgets-v4-sphere.test.js`' },
  'home-widgets:вода в плитке': { v: '=', f: 'Заливка на всю плитку — `:10088`' },
  'home-widgets:вода': { v: '=', f: 'Закрытый день: факт без «к этому часу» — `widget_data.js`, `by_hour` `:3702`' },
  'home-widgets:сон': { v: '=', f: 'Норма−30мин → good — `:1943`' },
  'home-widgets:вес': { v: '=', f: 'Растущее окно 7→30д — `heys_widgets_weight_dynamics_v4.js:51`' },
  'home-widgets:БЖУ': { v: '=', f: 'Один компаратор — `:2007`' },
  'home-widgets:кольцо БЖУ': { v: '=', f: 'Подпись над, остаток внутри — `:2077`' },
  'home-widgets:жест': { v: '=', f: '350ms, scale 0,965 — `heys_widgets_variants_v4.js:16`' },
  'home-widgets:лист': { v: '=', f: 'Превью 143×64 — `:11165`' },
  'home-widgets:превью': { v: '=', f: 'Живые данные + `.is-active` — `:265`' },
  'home-widgets:смена': { v: '=', f: 'Дорисовка линии **320ms** — `:1672`' },
  'home-widgets:запись': { v: '=', f: 'Тап пишет и закрывает — `:257`' },
  'home-widgets:максимум видов': { v: '=', f: '≤5 — `:123`' },
  'home-widgets:размер': { v: '=', f: 'Контракт = `WIDGET_EDIT_RESIZE_ENABLED=false` — совпадает с кодом' },
  'home-widgets:плитка без вариантов': { v: '=', f: 'Контракт: long-press no-op, расстановка кнопкой — `:378`' },
  'home-widgets:дефолт вида': { v: '=', f: '`isDefault` в каталоге — `:159`' },
  'home-widgets:исключение': { v: '=', f: 'Динамика веса `chart` с `isDefault` — `heys_widgets_variants_v4.js:124`' },
  'home-widgets:капсула · сегодня': { v: '=', f: 'Красное сокращение выходного — `heys_day_utils.js:1282`, `.date-picker-weekend-abbr`' },
  'home-widgets:капсула · прошлый день': { v: '=', f: 'Терракота, «Сегодня» — `heys_day_pickers.js:297`' },
  'home-widgets:закрытый день': { v: '=', f: 'Вода на прошлом дне — факт, без hourly — `by_hour` `:3702`' },
  'home-widgets:«Изменить экран»': { v: '=', f: 'Под сеткой, 44pt — `:9289`' },
  'home-widgets:арифметика между виджетами': { v: '=', f: 'Намеренно не сведена' },

  // --- water-add (62) ---
  'water-add:фича': { v: '=', f: 'FAB чипы −200/+200/+500 — `heys_day_page_shell.js:186`' },
  'water-add:носители': { v: '=', f: 'Плитка + столбик <50% — `heys_day_day_handlers.js:246`' },
  'water-add:границы': { v: '=', f: '`.widget-water--v4` внутри `.widget`' },
  'water-add:источник': { v: '=', f: '`water-add-v4.test.js`' },
  'water-add:демо': { v: '=', f: 'Событийная анимация; protocol не в коде' },
  'water-add:адресация': { v: '=', f: 'Канвас-мета' },
  'water-add:палитры': { v: '=', f: '`--water-tone` по 4 темам' },
  'water-add:капля': { v: '=', f: '6×6, 220ms — `:10137`' },
  'water-add:круг': { v: '=', f: '1.5px 75%, 420ms — `:10161`' },
  'water-add:уровень': { v: '=', f: 'Добавление 320ms+240ms — `:10116`; смена дня — `--widget-motion-ms`' },
  'water-add:норма дня': { v: '=', f: '`computeWaterGoalBreakdown` — `heys_day_water_state.js:16`' },
  'water-add:пересчёт нормы': { v: '=', f: '`heys:day-updated` — `:8667`' },
  'water-add:одна норма на два места': { v: '=', f: '`water-goal-single-source.test.js`' },
  'water-add:блики': { v: '=', f: '7px, 3.4s — `:10112`' },
  'water-add:число': { v: '=', f: '12px/600, кроссфейд 160ms — `:10182`' },
  'water-add:итого': { v: '=', f: 'Pulse 900ms — `:3596`' },
  'water-add:цвет': { v: '=', f: '4 тона — `water-add-v4.test.js:106`' },
  'water-add:раскладка плитки': { v: '=', f: 'Норма top 7px, подпись 9px — `:10002`, `:10028`' },
  'water-add:норма': { v: '=', f: 'Сплошные #6b5f4f / #5a6474 на светлых — `:9985`, `:10059`' },
  'water-add:перекраска': { v: '=', f: '31%/89%, 220ms — `:3639`' },
  'water-add:до своего порога': { v: '=', f: 'Кремовый только ≥ порога' },
  'water-add:возврат': { v: '=', f: 'Возврат в чернила при падении' },
  'water-add:тон по объёму': { v: '=', f: 'oklab mix — `:3534`' },
  'water-add:выше 70 %': { v: '=', f: 'mix=100 — `:3536`' },
  'water-add:концы ramp': { v: '=', f: 'Deep tones CSS + тест' },
  'water-add:reduced-motion': { v: '=', f: 'Без капли/круга; level 160ms — `730-widgets-dashboard.css`' },
  'water-add:чем сделан': { v: '=', f: 'WebAudio synth — `heys_audio_v1.js`' },
  'water-add:характер': { v: '=', f: 'synthWater 760→330 + room tail — `:418`' },
  'water-add:тон': { v: '=', f: '760→330 Гц — `:481`' },
  'water-add:огибающая': { v: '=', f: 'Спад ~230ms — `:477`' },
  'water-add:громкость': { v: '=', f: 'Контракт: гейн 0,22; код через `settings.volume` — близко' },
  'water-add:вариация': { v: '—', f: 'Нет +30¢ / 4 ступеней — `water-add-v4.test.js:157`' },
  'water-add:свой объём': { v: '—', f: 'Нет long-press листа 50ml/330·500·750·1000' },
  'water-add:память объёма': { v: '—', f: 'Память последнего объёма не реализована' },
  'water-add:карточка · утро': { v: '=', f: '0 л: полоса 0, столбик 2px, −200 dim — `water-review-card-v4.test.js`' },
  'water-add:частые тапы · звук': { v: '=', f: '>4 тапов / 2 с — `isWaterSoundFlooded` — `heys_audio_v1.js`' },
  'water-add:тактильный': { v: '=', f: '`HEYS.vibration.impactLight` — `heys_platform_apis_v1.js`' },
  'water-add:момент': { v: '=', f: '240ms на плитке; reduced-motion — сразу — `heys_day_day_handlers.js`' },
  'water-add:категория': { v: '=', f: 'Контракт: общий регулятор; код через `settings.volume`' },
  'water-add:файл': { v: '=', f: 'Контракт: синтез, не wav — совпадает' },
  'water-add:когда': { v: '=', f: 'Видимость плитки ≥50% — `:246`' },
  'water-add:вид карточки': { v: '=', f: 'Оба вида в продукте, дефолт «Кольцо», сохранённый выбор не сбрасывается — `heys_day_water_v1.js:readCardView`' },
  'water-add:разбор нормы': { v: '=', f: 'Тап по факту → metric-popup с базой/шагами/тренировкой и «давно не пил»' },
  'water-add:минус в «Кольце»': { v: '=', f: 'Пятая пилюля обводкой первой в ряду, зазор 12 px, в шапке минуса нет — `.water-review__chip--in-row`' },
  'water-add:переключатель обязателен': { v: '=', f: 'Две пилюли всегда под карточкой — `water-review-card-v4.test.js`' },
  'water-add:неделя в «Кольце»': { v: '=', f: 'Кривая 7д, заливка .16, пунктир нормы, залитая/контурная точка, ореол сегодня — `heys_day_water_v1.js`' },
  'water-add:переключатель вида': { v: '=', f: 'Две пилюли 26px 10/600 вне карточки, по левому краю, без подложки; 8 px до карточки, 20 px после — `.water-review-switch`' },
  'water-add:цель касания переключателя': { v: '=', f: '`::after` −9px сверху и снизу — `400-water-and-hydration.css`' },
  'water-add:запись выбора': { v: '=', f: 'localStorage `heys_water_card_view_v1` по нажатию, без подтверждения' },
  'water-add:служебный переключатель канваса': { v: '=', f: 'В продукт не перенесён — только канвас' },
  'water-add:чем они отличаются': { v: '=', f: '«Полоса» — 7 столбиков и 3 объёма, «Кольцо» — доля нормы и 4 объёма' },
  'water-add:полный вид': { v: '=', f: 'Карточка во вкладке «Питание» — `heys_day_diary_section.js:1119`' },
  'water-add:адрес один': { v: '=', f: '«Питание», не «Актив»' },
  'water-add:что в карточке': { v: '=', f: 'Подпись/норма/факт/остаток, полоса 6px, спарклайн 30px 7д, «в среднем N» — `heys_day_water_v1.js`, `400-water-and-hydration.css:16`' },
  'water-add:нет виджета и нет кнопки': { v: '=', f: 'Карточка ≥50% — `applyOptimistic` двигает число/полосу/столбик, столбика у кнопки нет — `heys_day_day_handlers.js`' },
  'water-add:якорь': { v: '=', f: 'Center FAB, gap 10px — `:261-320`' },
  'water-add:нет кнопки воды': { v: '=', f: 'fab-slot--off → null' },
  'water-add:вид чипов': { v: '=', f: '30px 11.5/700 — `:2002`' },
  'water-add:цвета чипов': { v: '=', f: '4 палитры — `:1968`' },
  'water-add:обводка убавляющего': { v: '=', f: 'Minus 2px — `:2033`' },
  'water-add:набор': { v: '=', f: '−200/+200/+500 — `:186`' },
  'water-add:убавить нечего': { v: '=', f: 'opacity 0.32 при 0ml' },
  'water-add:цель касания': { v: '=', f: '44pt ::before ±7px — `:2020`' },
  'water-add:нажатие': { v: '=', f: 'scale 0.96 + haptic' },
  'water-add:быстрые объёмы': { v: '=', f: 'Столбик после чипов — `:226-244`' },
  'water-add:размер': { v: '=', f: '7×62px — `:3845`' },
  'water-add:подписи': { v: '=', f: 'Контракт «+200 мл или чип»; код `:3907` — объём последнего тапа' },
  'water-add:появление': { v: '=', f: '180ms + fill 320ms — `:3831`' },
  'water-add:уход': { v: '=', f: 'Hold 1400ms — `WATER_COLUMN_HOLD_MS`' },
  'water-add:частые тапы · столбик': { v: '=', f: 'Тот же DOM, таймер сброс' },
  'water-add:капля и круг': { v: '=', f: 'В столбике нет' },
  'water-add:касание': { v: '=', f: 'pointer-events: none' },

  // --- checkin (39) ---
  'checkin-morning:фича': { v: '=', f: '5 шагов + verify — `heys_morning_checkin_v1.js:1481`' },
  'checkin-morning:границы': { v: '=', f: 'Мастер в `heys_step_modal_v1.js`' },
  'checkin-morning:источник': { v: '=', f: 'Добавки в том же чек-ине' },
  'checkin-morning:демо': { v: '=', f: '33× stop' },
  'checkin-morning:адресация': { v: '=', f: 'Канвас-мета' },
  'checkin-morning:шагов': { v: '=', f: '5 + итог — `:1588`' },
  'checkin-morning:обязательные': { v: '=', f: 'Skip только вес' },
  'checkin-morning:первый шаг': { v: '=', f: 'Без × и «Назад» — `:637`' },
  'checkin-morning:итог': { v: '=', f: 'Серия/норма/шаги — `:7023`' },
  'checkin-morning:разбор вчера': { v: '=', f: '«Перед чек-ином» — `:731`' },
  'checkin-morning:порог попадания': { v: '=', f: '<50% / 0 kcal — `:246`' },
  'checkin-morning:четыре выхода': { v: '=', f: '4 выхода — `:2119`' },
  'checkin-morning:кнопка подтверждения': { v: '=', f: '«Так и было · N ккал» — `:1211`' },
  'checkin-morning:единицы': { v: '=', f: 'День kcal; пачка %' },
  'checkin-morning:массовое закрытие': { v: '=', f: '«Закрыть все примерно» — `:1161`' },
  'checkin-morning:очистка пустых': { v: '=', f: '«Очистить N пустых» — `:1775`' },
  'checkin-morning:строка списка': { v: '=', f: '«День N из M» — `:716`' },
  'checkin-morning:дорожка': { v: '=', f: 'Контракт: «Совет · N» только у шагов — совпадает' },
  'checkin-morning:оценки': { v: '=', f: '1–10 + крупная цифра' },
  'checkin-morning:оценка еды': { v: '=', f: '4 силы + 50–200 — `:1612`' },
  'checkin-morning:цель по шагам': { v: '=', f: 'Шаг **500** на всём диапазоне — `:2744`' },
  'checkin-morning:совет по шагам': { v: '=', f: 'Коридор 7 000–12 000 в footnote — `buildStepsGoalNarrative`' },
  'checkin-morning:сон': { v: '=', f: 'Колёса 4–12ч — `:2529`' },
  'checkin-morning:капсула времени': { v: '=', f: 'TimePicker — `:427`' },
  'checkin-morning:заметка о сне': { v: '=', f: 'Подпись по оценке — `:2502`' },
  'checkin-morning:невыбранное': { v: '=', f: 'Обводка без заливки — `:1133`' },
  'checkin-morning:отмена выбора': { v: '=', f: '«Убрать отметку» — `:6414`' },
  'checkin-morning:минимум': { v: '=', f: 'Карточка добавок только при непустом курсе — `:6353`' },
  'checkin-morning:рутина': { v: '=', f: 'Сделал/Сделаю/Не сегодня — `:6755`' },
  'checkin-morning:напоминание': { v: '=', f: 'SW local notification 14:00 — `heys_push_v1.js`, `sw.js`, `:868`' },
  'checkin-morning:отметка «Сделал»': { v: '=', f: 'Cancel push — `:914`' },
  'checkin-morning:интенсивность': { v: '=', f: 'intensity null — « · была»' },
  'checkin-morning:просроченные замеры': { v: '=', f: '≥7 дней подложка — `:4270`' },
  'checkin-morning:загрузочный день': { v: '=', f: 'Default «Нет» — `:3142`' },
  'checkin-morning:без подписи': { v: '=', f: '«Прочитать и подписать» — `:6782`' },
  'checkin-morning:отсрочка': { v: '=', f: '«Не сейчас» +7д — `:980`' },
  'checkin-morning:выбор добавок': { v: '=', f: 'Чипы + поиск — `:6177`' },
  'checkin-morning:доза': { v: '=', f: 'Степпер + Утро/День/… — `:5750`' },
  'checkin-morning:курс': { v: '=', f: 'Строкой, не «выпил» — `:6120`' },
};

function escCell(s) {
  return s.replace(/\|/g, '\\|');
}

function buildTable(zone, file, protocol, specs, frameCount) {
  const lines = [
    `## ${zone.title} · \`${file}\``,
    '',
    `Протокол: \`${protocol}\` · строк контракта: **${specs.length}**${frameCount ? ` · ${frameCount}` : ''}`,
    '',
    '| # | Ключ | Ожидаемое значение (`data-v`) | Вердикт | Факт в коде |',
    '| --- | --- | --- | --- | --- |',
  ];
  specs.forEach((row, i) => {
    const id = `${zone.id}:${row.key}`;
    const r = V[id] ?? { v: '', f: '' };
    lines.push(
      `| ${i + 1} | \`${row.key}\` | ${escCell(row.value)} | ${r.v} | ${escCell(r.f)} |`,
    );
  });
  return lines.join('\n');
}

function countZone(specs, zoneId) {
  const c = { '=': 0, '≠': 0, '—': 0, '?': 0 };
  for (const row of specs) {
    const r = V[`${zoneId}:${row.key}`];
    if (r?.v) c[r.v] = (c[r.v] || 0) + 1;
  }
  return c;
}

const homeHtml = fs.readFileSync(path.join(pack, 'home-widgets.v4.dc.html'), 'utf8');
const waterHtml = fs.readFileSync(path.join(pack, 'water-add.v4.dc.html'), 'utf8');
const checkinHtml = fs.readFileSync(path.join(pack, 'checkin-morning.v4.dc.html'), 'utf8');

const homeSpecs = extractSpecs(homeHtml, 'contract');
const waterSpecs = extractSpecs(waterHtml, 'all');
const checkinSpecs = extractSpecs(checkinHtml, 'contract');

const ch = countZone(homeSpecs, 'home-widgets');
const cw = countZone(waterSpecs, 'water-add');
const cc = countZone(checkinSpecs, 'checkin-morning');
const total = {
  '=': ch['='] + cw['='] + cc['='],
  '≠': ch['≠'] + cw['≠'] + cc['≠'],
  '—': ch['—'] + cw['—'] + cc['—'],
  '?': ch['?'] + cc['?'] + cw['?'],
};
const n = homeSpecs.length + waterSpecs.length + checkinSpecs.length;

const existing = fs.readFileSync(out, 'utf8');
const headerEnd = existing.indexOf('\n---\n\n## Виджеты Главной');
const header = existing.slice(0, headerEnd);
const headerFixed = header
  .replace(/\*\*Итого строк:\*\* \*\*\d+\*\*/, `**Итого строк:** **${n}**`)
  .replace(
    /\| Итого \(\d+\) \| \d+ \| \*\*[\d ]+\*\* \| \*\*[\d ]+\*\* \| \*\*[\d ]+\*\* \| \*\*[\d ]+\*\* \| \*\*[\d ]+ %\*\* \|/,
    `| Итого (${n}) | 100 | **${total['=']}** | **${total['≠']}** | **${total['—']}** | **${total['?']}** | **${Math.round((total['='] / n) * 100)} %** |`,
  )
  .replace(
    /\*\*Что осталось у кода — 21 строка,/,
    `**Что осталось у кода — ${total['≠']} строки,`,
  )
  .replace(
    /\*\*Пять `—`\*\*/,
    `**${total['—']} \`—\`**`,
  )
  .replace(
    /\| home-widgets \(\d+\) \| [\d *]+\| \*\*[\d ]+\*\* \| [\d ]+\| [\d ]+\| [\d ]+\| \*\*[\d ]+%\*\* \|/,
    `| home-widgets (${homeSpecs.length}) | 25 | **${ch['=']}** | ${ch['≠']} | ${ch['—']} | ${ch['?']} | **${Math.round((ch['='] / homeSpecs.length) * 100)} %** |`,
  )
  .replace(
    /\| water-add \(\d+\) \| [\d *]+\| \*\*[\d ]+\*\* \| [\d ]+\| [\d ]+\| [\d ]+\| \*\*[\d ]+%\*\* \|/,
    `| water-add (${waterSpecs.length}) | 41 | **${cw['=']}** | ${cw['≠']} | ${cw['—']} | ${cw['?']} | **${Math.round((cw['='] / waterSpecs.length) * 100)} %** |`,
  )
  .replace(
    /\| checkin-morning \(\d+\) \| [\d *]+\| \*\*[\d ]+\*\* \| [\d ]+\| [\d ]+\| [\d ]+\| \*\*[\d ]+%\*\* \|/,
    `| checkin-morning (${checkinSpecs.length}) | 34 | **${cc['=']}** | ${cc['≠']} | ${cc['—']} | ${cc['?']} | **${Math.round((cc['='] / checkinSpecs.length) * 100)} %** |`,
  );

const body = [
  buildTable(
    { id: 'home-widgets', title: 'Виджеты Главной' },
    'home-widgets.v4.dc.html',
    'HOME_WIDGETS_V4',
    homeSpecs,
    'кадров: 80, из них годных для сверки (`stop`): 75',
  ),
  '',
  '---',
  '',
  buildTable(
    { id: 'water-add', title: 'Добавление воды' },
    'water-add.v4.dc.html',
    'WATER_ADD_V4',
    waterSpecs,
    'кадров: 36, из них годных для сверки (`stop`): 12',
  ),
  '',
  '---',
  '',
  buildTable(
    { id: 'checkin-morning', title: 'Утренний чек-ин' },
    'checkin-morning.v4.dc.html',
    'MORNING_CHECKIN_V4',
    checkinSpecs,
    'кадров: 33, из них годных для сверки (`stop`): 33',
  ),
  '',
  '---',
  '',
  `## После заполнения`,
  '',
  '1. Контракт (11) и сводка — ✅ 20.08 вечер.',
  `2. Код (**${total['≠']}** \`≠\`, **${total['—']}** \`—\`) — Composer; **P0:** HOME \`закрытый день\` · checkin \`напоминание\`.`,
  '3. HOME `второго gap нет` — снять media query gap/pad 6 в CSS.',
  '4. ~~WATER `подписи`~~ — ✅ контракт «+200 мл или чип», кадры столбика +200.',
  `5. ${total['—']} строк \`—\` — отдельная оценка часов в плане.`,
].join('\n');

fs.writeFileSync(out, `${headerFixed}\n---\n\n${body}\n`, 'utf8');

console.log('Wrote ACCEPTANCE.md', {
  rows: n,
  home: homeSpecs.length,
  water: waterSpecs.length,
  checkin: checkinSpecs.length,
  total,
});
