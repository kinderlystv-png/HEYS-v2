// Облако синхронизации в шапке: в покое оно видно, но приглушено.
//
// Решение владельца 24 августа: постоянная примета «данные уходят в облако»
// возвращена. Это осознанное ОТСТУПЛЕНИЕ от строки контракта «третий бокс»
// (tips.v4.dc.html), которая просит показывать индикатор только при проблеме;
// правки дизайнера в пакет на диске ещё не приехали. Тест держит обе стороны:
// сторожит и возврат в коде, и текущий текст контракта — когда пакет обновят,
// он упадёт и заставит перечитать решение, а не молча «починить» обратно.
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const WEB = path.resolve(__dirname, '..');
const CANVAS_DIR = path.resolve(
    WEB,
    '../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4',
);

const baseCss = fs.readFileSync(
    path.join(WEB, 'styles/modules/000-base-and-gamification.css'),
    'utf8',
);
const paletteCss = fs.readFileSync(
    path.join(WEB, 'styles/modules/002-ui-v4-palette-roles.css'),
    'utf8',
);
const shellSource = fs.readFileSync(path.join(WEB, 'heys_app_shell_v1.js'), 'utf8');
const gamificationSource = fs.readFileSync(
    path.join(WEB, 'heys_gamification_bar_v1.js'),
    'utf8',
);

function readContractRow(canvasFile, label) {
    const source = fs.readFileSync(path.join(CANVAS_DIR, canvasFile), 'utf8');
    const re = new RegExp('<div class="spec"[^>]*><b>' + label + '</b><span data-v="([^"]*)"');
    const match = source.match(re);
    if (!match) throw new Error(`строка контракта «${label}» не найдена в ${canvasFile}`);
    return match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

// Боксы шапки берём из самих исходников, а не из фантазии теста: если группа
// сменит состав, разметка смоука сменится вместе с ней.
function headerIconModifiers() {
    return [
        ...new Set(
            [...(gamificationSource + shellSource).matchAll(/hdr-header-icon-btn--([a-z-]+)/g)]
                .map((m) => m[1])
                // --advice-critical — тон той же лампочки, а не отдельный бокс
                .filter((name) => name !== 'advice-critical'),
        ),
    ].sort();
}

// Правил `.cloud-sync-indicator.idle` в файле несколько (плавный переход из
// «сохранено» живёт отдельно от тона), поэтому берём все и ищем нужное.
function idleRules() {
    return [...baseCss.matchAll(/(^|\})\s*\.cloud-sync-indicator\.idle\s*\{([^}]*)\}/gm)].map(
        (m) => m[2],
    );
}

// Класс состояния облака считает сам shell (cloudIndicatorClass): syncing,
// problem или idle. Смоук гоняет ровно эти три.
const STATES = ['idle', 'syncing', 'problem'];

function buildHeader(state) {
    const modifiers = headerIconModifiers();
    document.body.innerHTML = `
<div class="hdr-top hdr-gamification">
  <div class="game-bar-slots game-bar-slots--compact">
    <div class="hdr-header-actions">
      <div class="hdr-header-actions__debug">
        <div class="cloud-sync-indicator ${state}${state === 'idle' ? ' cloud-sync-indicator--clickable' : ''}" data-cloud>
          <svg class="cloud-icon ${state}" viewBox="0 0 24 24" width="16" height="16"><path d="M0 0h24v24H0z"/></svg>
        </div>
      </div>
      ${modifiers
          .map(
              (mod) =>
                  `<button class="hdr-header-icon-btn hdr-header-icon-btn--${mod}" data-action="${mod}"></button>`,
          )
          .join('\n      ')}
    </div>
  </div>
</div>`;
    return document.querySelector('[data-cloud]');
}

function computedOpacity(el) {
    const raw = getComputedStyle(el).opacity;
    return raw === '' ? 1 : Number(raw);
}

// Сила тона роли — из самого набора палитр. Считать по элементу нельзя:
// jsdom не разворачивает var() внутри rgba(), и computed color возвращает
// пустую строку — ровно поэтому прежняя редакция теста мерила opacity
// элемента. Но opacity гасила заодно рамку и фон пилюли, а контракт просит
// приглушить именно знак, поэтому теперь сила живёт в альфе роли.
function roleAlpha(role) {
    // Первый блок палитры — песочный набор по умолчанию; для тёмных наборов
    // значение проверяется отдельным сопоставлением по тексту.
    const decl = new RegExp('--' + role + ':\\s*([^;]+);').exec(paletteCss);
    if (!decl) return null;
    const rgba = /rgba\([^)]*,\s*([\d.]+)\s*\)/.exec(decl[1]);
    return rgba ? Number(rgba[1]) : 1;
}

describe('UI v4 · облако синхронизации в шапке', () => {
    beforeEach(() => {
        const style = document.createElement('style');
        style.id = 'cloud-idle-smoke';
        style.textContent = `${paletteCss}\n${baseCss}`;
        document.head.appendChild(style);
        document.documentElement.setAttribute('data-theme', 'sand');
        document.documentElement.setAttribute('data-theme-id', 'sand');
    });

    afterEach(() => {
        document.getElementById('cloud-idle-smoke')?.remove();
        document.body.innerHTML = '';
        document.documentElement.removeAttribute('data-theme');
        document.documentElement.removeAttribute('data-theme-id');
    });

    it('в покое индикатор есть в разметке и не скрыт', () => {
        const cloud = buildHeader('idle');
        expect(cloud).toBeTruthy();

        const style = getComputedStyle(cloud);
        expect(style.display).not.toBe('none');
        expect(style.visibility).not.toBe('hidden');
        expect(computedOpacity(cloud)).toBeGreaterThan(0);

        // Сам знак тоже виден: спрятать глиф — то же самое, что спрятать бокс.
        const glyph = cloud.querySelector('svg.cloud-icon');
        expect(getComputedStyle(glyph).display).toBe('block');

        // И правило скрытия покоя не вернулось окольным путём.
        expect(baseCss).not.toMatch(/\.cloud-sync-indicator\.idle\s*\{[^}]*display:\s*none/);
    });

    it('покой приглушён: ровно 30 % чернил, ролью', () => {
        const cloud = buildHeader('idle');
        // Контракт «третий бокс»: в покое приглушённым тоном чернил 30 %.
        // Приглушает тон, а не opacity: та гасила бы и рамку, и фон пилюли.
        expect(getComputedStyle(cloud).display).not.toBe("none");
        expect(computedOpacity(cloud)).toBe(1);
        expect(roleAlpha("v4-ink-30")).toBeCloseTo(0.3, 2);

        // Тон — ролью набора, а не литералом.
        const toneRule = idleRules().find((body) => /(^|;|\s)color:/.test(body)) || '';
        expect(toneRule).toMatch(/color:\s*var\(--v4-ink-30/);
        expect(baseCss).toMatch(
            /\[data-theme\$="dark"\] \.cloud-sync-indicator\.idle \{[^}]*color:\s*var\(--v4-ink-30/,
        );

        const actionRule = baseCss.match(/\.hdr-header-icon-btn \{[^}]*\}/)?.[0] || '';
        expect(actionRule).toMatch(/color:\s*var\(--v4-ink-2/);
    });

    it('синхронизация и проблема заметнее покоя', () => {
        // Сила: покой бледнее работы. Сравниваем объявленные альфы ролей —
        // computed color в jsdom пуст (см. roleAlpha выше).
        expect(roleAlpha("v4-ink-30")).toBeLessThan(roleAlpha("v4-ink-2"));

        // Тон: три состояния — три разные роли, покой не путается ни с
        // работой, ни с ошибкой, а ошибка красная, а не акцентная.
        const ruleOf = (state) => {
            const re = new RegExp(
                "\\.cloud-sync-indicator\\." + state + "\\s*\\{([^}]*--v4-[^}]*)\\}",
                "g",
            );
            return [...baseCss.matchAll(re)].map((m) => m[1]).join(" ");
        };
        expect(ruleOf("idle")).toContain("--v4-ink-30");
        expect(ruleOf("syncing")).toContain("--v4-ink-2");
        expect(ruleOf("problem")).toContain("--v4-bad-text");
        expect(ruleOf("problem")).not.toContain("--v4-warn-2");

        // Движение есть только у работы: покой стоит молча.
        expect(baseCss).toMatch(
            /\.cloud-sync-indicator\.syncing \.cloud-icon\.syncing \{[^}]*animation:/,
        );
        for (const body of idleRules()) expect(body).not.toMatch(/animation:/);
    });

    it('тёмные наборы: покой тоже виден и тоже приглушён', () => {
        document.documentElement.setAttribute('data-theme', 'sand-dark');
        document.documentElement.setAttribute('data-theme-id', 'sand-dark');
        const cloud = buildHeader('idle');
        expect(getComputedStyle(cloud).display).not.toBe('none');
        // Приглушает роль, а не opacity элемента: в тёмных наборах
        // --v4-ink-30 объявлена своими чернилами той же силы.
        expect(computedOpacity(cloud)).toBe(1);
        expect(paletteCss).toMatch(/--v4-ink-30:\s*rgba\(242, 237, 230, 0\.3\)/);
    });

    it('в шапке ровно ожидаемый состав: два действия и пассивная примета', () => {
        buildHeader('idle');
        const row = document.querySelector('.hdr-header-actions');
        const boxes = [...row.querySelectorAll('.hdr-header-icon-btn, .cloud-sync-indicator')];
        expect(boxes).toHaveLength(3);

        // Два адреса нажатия — лампочка советов и ползунки настроек.
        expect([...row.querySelectorAll('.hdr-header-icon-btn')].map((b) => b.dataset.action)).toEqual([
            'advice',
            'settings',
        ]);
        // Тумблера свет/тьма в шапке нет — оформление живёт в шторке настроек.
        expect(row.querySelector('.hdr-header-icon-btn--theme')).toBeNull();

        // Индикатор — не третья кнопка: он не входит в группу иконок-действий и
        // стоит слева от неё.
        const cloud = row.querySelector('.cloud-sync-indicator');
        expect(cloud.tagName).not.toBe('BUTTON');
        expect(cloud.classList.contains('hdr-header-icon-btn')).toBe(false);
        expect(boxes[0]).toBe(cloud);
    });

    // Сторож сработал по назначению: строка контракта переписана под решение
    // владельца от 24 августа, отступление снялось. Раньше здесь сверялся
    // текст прежней редакции («появляется только при проблеме») — теперь
    // проверяется согласие кода с новой строкой.
    it('облако из шапки не исчезает: в покое 30 % чернил, при проблеме --red с точкой', () => {
        const row = readContractRow('tips.v4.dc.html', 'третий бокс');
        expect(row).toContain('стоит в шапке всегда');
        expect(row).toContain('Скрытым в покое не бывает');

        // Тело правила читаем от селектора до ближайшей закрывающей скобки.
        const bodyOf = (selector) => {
            const at = baseCss.lastIndexOf(selector + " {");
            expect(at, selector + " должен существовать").toBeGreaterThan(-1);
            return baseCss.slice(at, baseCss.indexOf("}", at));
        };

        // Покой — ровно 30 % чернил своей ролью, а не ink-3 под opacity:
        // прежняя пара давала около 34 % и приглушала заодно рамку и фон,
        // потому что opacity действует на весь элемент.
        const idle = bodyOf(".cloud-sync-indicator.idle");
        expect(idle).toContain("--v4-ink-30");
        expect(idle).not.toMatch(/opacity:\s*0\.75/);
        expect(paletteCss).toMatch(/--v4-ink-30:\s*rgba\([^)]*0\.3\)/);

        // Проблема — тон --red из набора, а не --v4-warn-2: в песочном наборе
        // тот равен тону обычного акцента, и красный не читался вовсе.
        const problem = bodyOf(".cloud-sync-indicator.problem");
        expect(problem).toContain("--v4-bad-text");
        expect(problem).not.toContain("--v4-warn-2");

        // Точка 6 px рядом — вторая примета проблемы, кроме тона.
        const dot = bodyOf(".cloud-sync-indicator.problem::after");
        expect(dot).toMatch(/width:\s*6px/);
        expect(dot).toMatch(/height:\s*6px/);
        expect(dot).toContain("--v4-bad-text");
    });
});
