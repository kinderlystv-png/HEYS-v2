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

    it('покой приглушён: тон ролью и не в полную силу', () => {
        const cloud = buildHeader('idle');
        const opacity = computedOpacity(cloud);
        expect(opacity).toBeLessThan(1);
        expect(opacity).toBeGreaterThanOrEqual(0.6); // видимая примета, а не призрак

        // Тон — ролью набора, а не литералом: покой на ступень бледнее чернил
        // активных иконок шапки (ink-3 против ink-2).
        const toneRule = idleRules().find((body) => /(^|;|\s)color:/.test(body)) || '';
        expect(toneRule).toMatch(/color:\s*var\(--v4-ink-3/);
        expect(baseCss).toMatch(
            /\[data-theme\$="dark"\] \.cloud-sync-indicator\.idle \{[^}]*color:\s*var\(--v4-ink-3/,
        );

        const actionRule = baseCss.match(/\.hdr-header-icon-btn \{[^}]*\}/)?.[0] || '';
        expect(actionRule).toMatch(/color:\s*var\(--v4-ink-2/);
    });

    it('синхронизация и проблема заметнее покоя', () => {
        const tone = {};
        const weight = {};
        for (const state of STATES) {
            const cloud = buildHeader(state);
            tone[state] = getComputedStyle(cloud).color;
            weight[state] = computedOpacity(cloud);
        }

        // Сила: покой единственный приглушён.
        expect(weight.idle).toBeLessThan(weight.syncing);
        expect(weight.idle).toBeLessThan(weight.problem);

        // Тон: три разных состояния — три разных цвета, покой не путается ни с
        // работой, ни с ошибкой.
        expect(tone.idle).not.toBe(tone.syncing);
        expect(tone.idle).not.toBe(tone.problem);
        expect(tone.syncing).not.toBe(tone.problem);

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
        expect(computedOpacity(cloud)).toBeLessThan(1);
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

    it('канвас всё ещё просит обратное — отступление названо вслух', () => {
        // Когда пакет дизайнера пересоберут, строка изменится и тест упадёт:
        // это сигнал перечитать решение владельца, а не «починить» покой.
        expect(readContractRow('tips.v4.dc.html', 'третий бокс')).toBe(
            'индикатор синхронизации, появляется слева от группы только при проблеме: '
                + 'не сохранилось, нет сети, идёт отправка',
        );
        // Отступление зафиксировано там же, где живёт правило.
        expect(baseCss).toMatch(/Решение владельца 24 августа[\s\S]{0,400}третий бокс/);
    });
});
