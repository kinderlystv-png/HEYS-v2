import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const uiSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_ui_v1.js'), 'utf8');
const handlersSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_day_day_handlers.js'), 'utf8');
const widgetsCss = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/730-widgets-dashboard.css'), 'utf8');
const waterCss = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/400-water-and-hydration.css'), 'utf8');
const waterReviewSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_day_water_v1.js'), 'utf8');

describe('добавление воды — канвас water-add v4, ветка В₃', () => {
  it('полноэкранной заливки и летящей капли больше нет', () => {
    expect(handlersSrc).not.toContain('water-screen-fill');
    expect(handlersSrc).not.toContain('showScreenFill');
    expect(handlersSrc).not.toContain('showSourceBadge');
    expect(handlersSrc).not.toContain('showSourceDrop');
    expect(handlersSrc).not.toContain('pulseWaterWidget');
    expect(widgetsCss).not.toContain('.water-screen-fill');
    expect(widgetsCss).not.toContain('.widget--water-pulse');
    expect(uiSrc).not.toContain('showScreenFill');
  });

  it('плитка отвечает сама, когда её видно не меньше чем наполовину', () => {
    expect(uiSrc).toContain('WATER_TILE_VISIBLE_RATIO = 0.5');
    expect(uiSrc).toContain('function isWaterTileVisible');
    expect(uiSrc).toContain('function useWaterAddPulse');
    expect(handlersSrc).toContain('WATER_TILE_VISIBLE_RATIO = 0.5');
    expect(handlersSrc).toContain('function waterTileIsVisible');
    expect(handlersSrc).toContain('function waterCardIsVisible');
    // Один ответ на одно действие: плитка или карточка видны — столбик молчит.
    expect(handlersSrc).toMatch(/if \(waterTileIsVisible\(\) \|\| waterCardIsVisible\(\)\) return;/);
  });

  it('капля, круг, уровень и число — параметры из спецификации', () => {
    expect(uiSrc).toContain('widget-water__numV');
    expect(widgetsCss).toContain('.widget-water__numV');
    expect(uiSrc).toContain("className: 'widget-water__drop animate-always'");
    expect(uiSrc).toContain("className: 'widget-water__ripple animate-always'");
    expect(uiSrc).toContain('--water-drop-travel');
    // капля 6×6, падение 220 мс ease-in, вытяжение до 1,4
    expect(widgetsCss).toMatch(/\.widget-water__drop \{[\s\S]*?width: 6px;[\s\S]*?animation: widgetWaterDrop 220ms ease-in/);
    expect(widgetsCss).toContain('scaleY(1.4)');
    // круг: обводка 1,5 px белым 75 %, рост 0,3 → 3,2 за 420 мс, старт по касанию
    expect(widgetsCss).toContain('border: 1.5px solid rgba(255, 255, 255, 0.75)');
    expect(widgetsCss).toContain('animation: widgetWaterRipple 420ms ease-out 240ms');
    expect(widgetsCss).toContain('transform: scale(3.2)');
    // уровень: смена дня / intro — --widget-motion-ms; добавление — 320 мс + 240 мс задержка
    expect(uiSrc).toContain('function useWaterFillDisplayPct');
    expect(uiSrc).toContain('height: `${displayFillPct}%`');
    expect(widgetsCss).toMatch(/\.widget-water__fill \{[\s\S]*?transition:[\s\S]*?height var\(--widget-motion-ms/);
    expect(widgetsCss).toMatch(/\.widget-water--adding \.widget-water__fill \{[\s\S]*?320ms[^;]*240ms/);
    // число — кроссфейд 160 мс со сдвигом 5 px, старт через 240 мс
    expect(widgetsCss).toContain('animation: widgetWaterNumOut 160ms ease-in-out 240ms');
    expect(widgetsCss).toContain('animation: widgetWaterNumIn 160ms ease-in-out 240ms');
    // блики живут всегда, независимо от добавления
    expect(widgetsCss).toContain('animation: widgetWaterShine 3.4s linear infinite');
    // Вода заливает карточку от края до края и обрезается её скруглением.
    // Если контейнеру вернуть position: relative, заливка снова зажмётся
    // отступами карточки и перестанет доходить до краёв.
    // Заливка и подписи — внутри .widget-water--v4 (position:relative, height:100%).
    const waterRootRule = widgetsCss.match(/\.widget-water--v4 \{[^}]*\}/)[0];
    expect(waterRootRule).toContain('position: relative');
    expect(waterRootRule).toContain('height: 100%');
    expect(widgetsCss).toMatch(/\.widget-water--v4 \.widget-water__fill \{[^}]*position: absolute/);
    // nrmB: норма сверху, подпись и факт снизу — абсолют от карточки, 8 px от края.
    expect(uiSrc).toContain("className: 'widget-water__norm'");
    expect(uiSrc).toContain("className: 'widget-water__label'");
    expect(uiSrc).toContain('formatWaterNormTopLabel');
    expect(uiSrc).toContain('WATER_TILE_LINES_CREAM_PCT = 31');
    expect(uiSrc).toContain('WATER_TILE_NORM_CREAM_PCT = 89');
    expect(uiSrc).toContain('widget-water--lines-on-water');
    expect(uiSrc).toContain('widget-water--norm-on-water');
    expect(widgetsCss).toMatch(/\.widget-water--v4 \.widget-water__norm \{[^}]*right: 8px/);
    expect(widgetsCss).toMatch(/\.widget-water--v4 \.widget-water__label \{[^}]*bottom: 8px/);
    expect(widgetsCss).toMatch(/\.widget-water--v4 \{[^}]*position: relative/);
    expect(widgetsCss).toMatch(/\.widget-water--v4 \{[^}]*height: 100%/);
    const numRule = widgetsCss.match(/\.widget-water--v4 \.widget-water__numV \{[^}]*\}/)[0];
    expect(numRule).toContain('position: absolute');
    expect(numRule).toContain('bottom: 8px');
    expect(numRule).toContain('right: 8px');
    expect(widgetsCss).toMatch(/\.widget-water--v4\.widget-water--lines-on-water \.widget-water__numV[\s\S]*?var\(--water-cream-text\)/);
    expect(widgetsCss).toMatch(/\.widget-water--v4\.widget-water--norm-on-water \.widget-water__norm[\s\S]*?var\(--water-cream-text\)/);

    // Кромка заливки: два слоя пунктира, шагом 16 px и 11 px. Строка
    // контракта «блики» просит сдвиг ровно на шаг у обоих слоёв. Прежде
    // мелкий уезжал на два своих шага (22 px) ради «вдвое быстрее» — в
    // контракте такого нет, а шва на стыке петли не видно и при 11: это
    // тоже целый шаг своего слоя.
    expect(widgetsCss).toContain('background-size: 16px 100%, 11px 100%');
    expect(widgetsCss).toMatch(/@keyframes widgetWaterShine \{[^}]*background-position: 16px 0, 11px 0/);
    expect(widgetsCss).toContain('animation: widgetWaterShine 3.4s linear infinite');
    // Тот же дрейф по кромке столбика, но шагом 5 px.
    expect(waterCss).toContain('background-size: 5px 100%');
    expect(waterCss).toMatch(/@keyframes waterColumnShine \{[^}]*background-position: 5px 0/);
    expect(uiSrc).toContain('function waterTileCard');
    expect(uiSrc).toContain("closest('.widget')");
  });

  it('функциональная анимация — animate-always, политика в MOTION_POLICY', () => {
    expect(uiSrc).toContain("className: 'widget-water__fill animate-always'");
    expect(uiSrc).toContain("className: 'widget-water__drop animate-always'");
    // Контракт 26 канваса гасил при reduced-motion каплю и круг. В продукте
    // это рекомендация макета, а не контракт рантайма: вода — функциональный
    // ярус и живёт на animate-always вместе с кольцами БЖУ
    // (docs/implementation/MOTION_POLICY.md), поэтому kill-правил в reduce-блоках
    // не должно быть на функциональных элементах плитки воды.
    //
    // Блики под этот запрет попали ошибочно. Проверка была написана по имени
    // `.widget-water__shine` — класса, которого в продукте нет: блики живут на
    // псевдоэлементе `.widget-water__fill::before`, и запрет на `.widget-water__fill`
    // накрывал их заодно. Решения оставить блики нет ни в одном коммите: автор
    // ac25bb47 (19.08) писал «блики останавливаются», а 38c2f763 снёс блок
    // гашения воды целиком, не упомянув их. Бесконечная петля украшения —
    // ровно то, что настройка «уменьшить движение» и должна останавливать.
    const blocks = widgetsCss.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g) || [];
    // Смотрим правило целиком, а не «где-то в блоке»: иначе гашение соседнего
    // селектора засчитывается тому, кто просто оказался в том же блоке.
    // Обёртку `@media … {` снимаем: иначе она сама читается как первый
    // селектор и все пары «селектор → тело» съезжают на одну.
    const rules = blocks.flatMap((block) =>
      [
        ...block
          .slice(block.indexOf('{') + 1, block.lastIndexOf('}'))
          .matchAll(/([^{}]+)\{([^}]*)\}/g),
      ].map(([, selector, body]) => ({ selector: selector.trim(), body })),
    );
    const killsWater = (selector) =>
      rules.some(
        ({ selector: sel, body }) =>
          new RegExp(`${selector}\\s*(,|$)`, 'm').test(sel) &&
          (/display:\s*none/.test(body) || /animation:\s*none/.test(body)),
      );
    expect(killsWater('\\.widget-water--v4 \\.widget-water__fill')).toBe(false);
    expect(killsWater('\\.widget-water__drop')).toBe(false);
    expect(killsWater('\\.widget-water__ripple')).toBe(false);
    // А декоративная петля бликов — гасится, и адресно по псевдоэлементу:
    // снятие флага с родителя обнулило бы вместе с ними подъём уровня.
    expect(killsWater('\\.widget-water__fill::before')).toBe(true);
  });

  it('тон воды один на все палитры, новых оттенков нет', () => {
    expect(widgetsCss).toContain('--water-tone: #7d98a6');
    expect(widgetsCss).toContain('--water-tone: #8fb3c2');
    expect(widgetsCss).toContain('--water-tone: #3d7f9e');
    expect(widgetsCss).toContain('--water-tone: #7fb6d0');
  });

  it('вне Главной отвечает мерный столбик, и он не кнопка', () => {
    expect(handlersSrc).toContain('water-column__delta');
    expect(handlersSrc).toContain('water-column__total');
    expect(handlersSrc).toContain('water-column__target');
    // держится 1,4 с после последнего тапа, уходит за 160 мс
    expect(handlersSrc).toContain('WATER_COLUMN_HOLD_MS = 1400');
    expect(handlersSrc).toContain('WATER_COLUMN_OUT_MS = 160');
    // частые тапы не выводят второй столбик
    expect(handlersSrc).toContain('if (col._hideTimer) clearTimeout(col._hideTimer)');
    // столбик 7×62 и сквозные касания
    expect(waterCss).toMatch(/\.water-column__bar \{[\s\S]*?width: 7px;[\s\S]*?height: 62px/);
    expect(waterCss).toMatch(/\.water-column \{[\s\S]*?pointer-events: none/);
    expect(waterCss).toContain('transition: opacity 180ms ease-out');
    expect(waterCss).toMatch(/\.water-column__fill \{[\s\S]*?transition: height 320ms/);
    // Канvас: подписи слева от столбика, столбик вплотную к FAB.
    expect(handlersSrc).toMatch(/water-column__text[\s\S]*?water-column__bar/);
    expect(handlersSrc).toMatch(/fab-slot--off/);
    expect(handlersSrc).toContain('function resolveWaterColumnAnchor');
    expect(handlersSrc).toMatch(/resolveWaterColumnAnchor[\s\S]*?querySelectorAll\('\.water-fab'\)/);
    expect(handlersSrc).not.toContain('water-card-anim-above');
    expect(handlersSrc).toContain("col.className = 'water-column animate-always'");
  });

  it('перекраска nrmB и ramp тона — контракт 2026-08-20', () => {
    expect(uiSrc).toContain('function waterToneMixPct');
    expect(uiSrc).not.toContain('widget-water--submerged');
    expect(uiSrc).toContain("'--water-tone-mix'");
    expect(widgetsCss).toContain('--water-tone-deep: #4e6d7a');
    expect(widgetsCss).toContain('--water-tone-deep: #3f6c7e');
    expect(widgetsCss).toContain('--water-tone-deep: #2c5f76');
    expect(widgetsCss).toContain('--water-tone-deep: #35657d');
    expect(widgetsCss).toMatch(/color-mix\([\s\S]*?var\(--water-tone\)[\s\S]*?var\(--water-tone-deep\)/);
    expect(widgetsCss).toMatch(/\.widget-water--v4\.widget-water--lines-on-water \.widget-water__label[\s\S]*?color: var\(--water-cream-text\)/);
    expect(widgetsCss).toContain('transition: color 220ms ease-out');
    expect(widgetsCss).not.toContain('.widget-water--submerged');
    // Контракт 19: на светлых палитрах вторичный тон сплошной (альфа по кремовой
    // подложке обманчива), на тёмных остаётся кремовая альфа .62.
    expect(widgetsCss).toContain('--water-dim-text: #6b5f4f');
    expect(widgetsCss).toContain('--water-dim-text: #5a6474');
    expect(widgetsCss).toContain('--water-dim-text: rgba(242, 237, 230, 0.62)');
    expect(widgetsCss).toContain('--water-dim-text: rgba(238, 243, 248, 0.62)');
    // сетка 64 px на мобиле — пороги nrmB считаются от плитки 64 px
    expect(widgetsCss).toMatch(/@media \(max-width: 480px\)[\s\S]*?--widget-row-height: 64px/);
  });

  it('анти-спам звука — более 4 тапов за 2 с', () => {
    const audioSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_audio_v1.js'), 'utf8');
    expect(audioSrc).toContain('function isWaterSoundFlooded');
    expect(audioSrc).toContain('>4 taps / 2s');
    // Тик `impactLight` (8 мс на тапе) снят вместе с остальными откликами на
    // обычные нажатия — строка «вибрация · правило продукта». Отклик глотка
    // (10 мс) выдаёт политика: см. feedback-policy-contract.test.js.
  });

  it('звук капли: синтез WebAudio с вариацией +30¢', () => {
    const audioSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_audio_v1.js'), 'utf8');
    expect(handlersSrc).toContain("HEYS.feedback?.emit?.('water.sip')");
    expect(handlersSrc).toMatch(/waterTileIsVisible\(\)\) \{[\s\S]*?setTimeout\(playSound, 240\)/);
    expect(handlersSrc).toContain('HEYS.dayWater?.applyOptimistic?.');
    expect(audioSrc).toContain('function nextWaterToneCents');
    expect(audioSrc).toContain('(_waterToneStep % 4) * 30');
  });

  it('быстрые объёмы FAB — столбик после ухода чипов, якорь не трогаем', () => {
    const dayShellSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_day_page_shell.js'), 'utf8');
    const customSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_water_custom_volume_v1.js'), 'utf8');
    expect(dayShellSrc).toContain('function WaterFabButton');
    expect(dayShellSrc).toContain('WaterFabVolButton');
    expect(dayShellSrc).toContain('HEYS.WaterCustomVolume?.open');
    expect(customSrc).toMatch(/const LONG_PRESS_MS = (?:HEYS\.longPress\?\.MS \?\? )?350/);
    expect(customSrc).toContain('PRESETS_ML = [330, 500, 750, 1000]');
    expect(customSrc).toContain('heys:water-custom-volume-open');
    expect(dayShellSrc).toContain('water-fab-vol');
    // Строка «объёмы человека и чипы стопки»: в стопке два самых частых объёма
    // за месяц; −200 / +200 / +500 остаются значениями по умолчанию, пока
    // журнал воды своих объёмов не набрал.
    expect(dayShellSrc).toContain('WATER_FAB_DEFAULT_VOLUMES = [200, 500]');
    expect(dayShellSrc).toContain('HEYS.dayWater?.getFrequentVolumes?.()');
    expect(dayShellSrc).toContain('pickVolume(volumes[0])');
    expect(dayShellSrc).toContain('pickVolume(volumes[1])');
    expect(dayShellSrc).toContain('pickRemove(volumes[0])');
    expect(dayShellSrc).toContain('water-fab-vol--minus');
    expect(dayShellSrc).toContain('disabled: waterMl <= 0');
    expect(dayShellSrc).toContain("'−' + volumes[0]");
    expect(dayShellSrc).toContain('markVolumeChipsClosing');
    expect(handlersSrc).toContain('setVolumeChipsOpen');
    expect(handlersSrc).toContain('markVolumeChipsClosing');
    expect(handlersSrc).toContain('isVolumeChipsBlockingColumn');
    expect(handlersSrc).toContain('pendingColumnDetail');
    expect(handlersSrc).toMatch(/if \(isVolumeChipsBlockingColumn\(\)\) \{[\s\S]*?pendingColumnDetail = detail/);
    expect(waterCss).toContain('.water-fab-vol');
    expect(waterCss).toContain('height: 30px');
    expect(waterCss).toContain('font: 700 11.5px/1');
    expect(waterCss).toContain('border: 2px solid var(--water-fab-outline)');
    expect(waterCss).toContain('waterFabVolInDim');
    expect(waterCss).toMatch(/@keyframes waterFabVolIn[\s\S]*?translateX\(10px\)/);
    expect(waterCss).toContain('--water-fab-text: #0d1a26');
    expect(waterCss).toContain('[data-theme$="dark"] .water-column__total');
  });

  it('отнять воду — плитка и столбик видят изменение', () => {
    expect(handlersSrc).toMatch(/ml: -ml[\s\S]*?heysWaterAdded/);
    expect(handlersSrc).toContain('isRemove = detail.ml < 0');
    expect(handlersSrc).toMatch(/deltaMl < 0[\s\S]*?−/);
    expect(uiSrc).toMatch(/detail\.ml < 0\) return/);
    expect(uiSrc).toContain('handleRemoveWater');
  });

  it('врезка столбика: без своего env(), позиция целиком идёт от rect кнопки', () => {
    // Контракт «safe-area и кнопка назад» (water-add.v4.dc.html): «столбик
    // объёмов у кнопки вне Главной поднимается от нижней врезки». Столбик не
    // читает env(safe-area-inset-bottom) сам — он наследует врезку через
    // getBoundingClientRect() кнопки, а .fab-group уже отсчитывает bottom от
    // env(safe-area-inset-bottom). Если это когда-нибудь разойдётся —
    // добавлять свой env() в JS не нужно, чинить нужно позицию .fab-group.
    expect(handlersSrc).not.toContain('safe-area-inset-bottom');
    expect(handlersSrc).toMatch(/showWaterColumn[\s\S]*?anchor\.getBoundingClientRect\(\)/);
    expect(waterCss).toMatch(/\.fab-group \{[\s\S]*?bottom: calc\(76px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  });

  it('выделение и копирование: карточка воды не выделяется — весь текст служебный', () => {
    // Контракт «язык, выделение, часовой пояс» (water-add.v4.dc.html):
    // местная строка «выделять нечего» неточна буквально (на карточке есть
    // текст — «осталось …», «за день не отмечено», подсказка пустого дня),
    // но по общему правилу (home-widgets.v4.dc.html) весь этот текст —
    // служебные подписи и числа, не написанное человеком, поэтому вывод
    // контракта верен: выделения на карточке нет.
    const idx = waterCss.indexOf('.water-review {\n  display: block;');
    expect(idx).toBeGreaterThan(-1);
    const block = waterCss.slice(idx, idx + 400);
    expect(block).toContain('user-select: none;');
  });

  it('повторный тап: контракт явно исключает чипы объёмов воды — guard на них не заводим', () => {
    // Контракт «повторный тап и поворот» (water-add.v4.dc.html) и общее
    // правило (home-widgets.v4.dc.html, строка «повторный тап · правило
    // продукта») прямо называют чипы объёмов воды исключением: «Защита не
    // ставится на аддитивный ввод, где повтор осмыслен по замыслу — чипы
    // объёмов воды…». Роль защиты у чипов выполняет перезапуск анимации
    // (столбик/плитка не встают в очередь), а частый тап отдельно гасится
    // только по звуку (isWaterSoundFlooded, >4 тапов/2с) — это другая защита,
    // от заливания звуком, не от дублирования записи, и её мы не трогаем.
    expect(waterReviewSrc).toMatch(/onShortClick: \(event\) => onPick\(ml, event\)/);
    expect(waterReviewSrc).not.toMatch(/passRepeatTapGuard|REPEAT_TAP_GUARD_MS|guardEntityQuickAction/);
    // Долгое нажатие (открытие листа «свой объём») уже не даёт дублей другим
    // путём: onClick листа при триггере long-press глотает клик (stopEvent),
    // а после подтверждения лист уходит в состояние `closing` на 400 мс —
    // это дольше 350 мс контракта и перекрывает кнопку/сцену блокером.
    const customSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_water_custom_volume_v1.js'), 'utf8');
    expect(customSrc).toContain('const SHEET_CLOSE_MS = 400;');
    expect(customSrc).toMatch(/dismiss\(\);\s*\n\s*onAddRef\.current\?\.\(volume\);/);
    expect(customSrc).toMatch(/className: 'water-custom-sheet__blocker',[\s\S]*?onPointerDown: stopEvent,[\s\S]*?onPointerUp: stopEvent,[\s\S]*?onClick: stopEvent/);
  });
});
