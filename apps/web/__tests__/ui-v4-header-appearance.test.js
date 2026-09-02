// Сведение с канвасом v4: строка «шторка в приложении» (login.v4.dc.html) и
// строка «что в шапке» (tips.v4.dc.html). Тест читает сам контракт, поэтому
// падает и когда правят код, и когда правят канвас.
import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import * as ReactDOM from 'react-dom';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

const CANVAS_DIR = path.resolve(
    __dirname,
    '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4',
);

function readContractRow(canvasFile, label) {
    const source = fs.readFileSync(path.join(CANVAS_DIR, canvasFile), 'utf8');
    const re = new RegExp(
        '<div class="spec"[^>]*><b>' + label + '</b><span data-v="([^"]*)"',
    );
    const match = source.match(re);
    if (!match) throw new Error(`строка контракта «${label}» не найдена в ${canvasFile}`);
    return match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

const shellSource = fs.readFileSync(path.resolve(__dirname, '../heys_app_shell_v1.js'), 'utf8');
const gamificationSource = fs.readFileSync(
    path.resolve(__dirname, '../heys_gamification_bar_v1.js'),
    'utf8',
);
const readingSource = fs.readFileSync(
    path.resolve(__dirname, '../heys_planning_reading_v1.js'),
    'utf8',
);

describe('UI v4 · «что в шапке» (tips) — ровно два адреса', () => {
    it('канвас всё ещё просит два адреса', () => {
        expect(readContractRow('tips.v4.dc.html', 'что в шапке')).toBe(
            'ровно два адреса: лампочка советов и ползунки настроек, прижаты к правому краю без зазора между боксами',
        );
    });

    it('в разметке шапки живут ровно лампочка и ползунки', () => {
        const modifiers = new Set(
            [...(gamificationSource + shellSource).matchAll(/hdr-header-icon-btn--([a-z-]+)/g)]
                .map((match) => match[1])
                // --advice-critical — тон той же лампочки, а не отдельный бокс
                .filter((name) => name !== 'advice-critical'),
        );
        expect([...modifiers].sort()).toEqual(['advice', 'settings']);
    });

    it('тумблер свет/тьма из шапки снят целиком', () => {
        expect(shellSource).not.toContain('hdr-header-icon-btn--theme');
        expect(shellSource).not.toContain('toggleModePreference');
        expect(shellSource).not.toContain('headerDarkMode');
        expect(gamificationSource).not.toContain('hdr-header-icon-btn--theme');
    });

    it('третий бокс — облако синхронизации, и он остаётся', () => {
        // Строка «третий бокс» просит показывать облако только при проблеме, но
        // решением владельца 24 августа покой возвращён приглушённым — примета
        // «данные уходят в облако» полезна. Вид покоя держит CSS и смоук
        // ui-v4-header-cloud-idle; здесь — что сам бокс не потерян вместе с
        // тумблером.
        expect(shellSource).toContain('cloud-sync-indicator');
        expect(shellSource).toContain('cloudSyncHeaderActions');
    });
});

describe('UI v4 · значки шапки не режутся строкой уровня', () => {
    const css = fs.readFileSync(
        path.resolve(__dirname, '../styles/modules/000-base-and-gamification.css'),
        'utf8',
    );
    // Одно правило целиком: от селектора до ближайшей закрывающей скобки.
    const rule = (selector) => {
        // Селектор ищем от начала строки: '.game-bar {' встречается и хвостом
        // составного селектора, и это было бы чужое правило.
        const at = css.indexOf('\n' + selector + ' {');
        if (at < 0) throw new Error('правило «' + selector + '» не найдено');
        const open = css.indexOf('{', at);
        const close = css.indexOf('}', open);
        // Без комментариев: значение, названное в пояснении, — не декларация.
        return css.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, '');
    };

    it('строка уровня по-прежнему обрезает, а значки по-прежнему выходят за неё', () => {
        // Обе половины дефекта: клип у полосы и отрицательные поля у целей 44 pt.
        // Уйдёт любая — компенсация ниже станет лишней, и тест об этом скажет.
        expect(rule('.game-bar')).toMatch(/overflow:\s*hidden/);
        expect(css).toMatch(
            /\.wrap--tab-widgets \.hdr-gamification \.hdr-header-icon-btn--advice[^{]*\{[^}]*margin-block:\s*-\d/,
        );
    });

    it('счётчик советов стоит в углу значка, а не в углу кнопки', () => {
        // Строка «вид бейджа счётчика»: кружок в правом верхнем углу иконки
        // лампочки. Значок 17 стоит по центру бокса 34 × 44, значит угол — это
        // 13,5 сверху и 8,5 справа; сдвиг на половину держит угол и при
        // двузначном счётчике. Отсчёт от угла кнопки сажал бейдж на макушку.
        const badge = rule('.hdr-advice-badge,\n.hdr-header-icon-btn--advice #nav-advice-badge');
        expect(badge).toMatch(/top:\s*13\.5px/);
        expect(badge).toMatch(/right:\s*8\.5px/);
        expect(badge).toMatch(/transform:\s*translate\(50%,\s*-50%\)/);
    });

    it('шапочная полоса поднимает границу отсечения ровно настолько, насколько опускает край', () => {
        // Сверху за строку выходит счётчик: кружок 14 с обводкой 2 в углу
        // значка — 18 px, которые в строку 16 не помещаются по построению.
        // Снизу выходит 0,5 px самой лампочки: её дуга доходит до края квадрата
        // 24, в отличие от ползунков и облака. Поля сдвигают границу отсечения,
        // отрицательные отступы возвращают внешнюю геометрию строки.
        const header = rule('.hdr-top.hdr-gamification .game-bar');
        const decl = (name) => {
            const match = header.match(new RegExp(name + ':\\s*(-?[\\d.]+)px'));
            return match ? Number(match[1]) : null;
        };
        expect(decl('padding-top'), 'нет верхнего поля — счётчик снова режется').toBeGreaterThanOrEqual(8);
        expect(decl('padding-bottom'), 'нет нижнего поля — макушка лампочки снова режется').toBeGreaterThan(0);
        expect(decl('margin-top'), 'верхнее поле не скомпенсировано — строка стала выше').toBe(-decl('padding-top'));
        expect(decl('margin-bottom'), 'нижнее поле не скомпенсировано — строка стала выше').toBe(-decl('padding-bottom'));
    });

    it('подсказка полосы XP в шапке не показывается', () => {
        // Её прятал тот же клип, что резал значки. Клип поднят — подсказку надо
        // снимать явно, иначе при нажатии на полосу она вылезает поверх даты.
        expect(rule('.hdr-top.hdr-gamification .game-progress-tooltip')).toMatch(/display:\s*none/);
    });
});

describe('UI v4 · «шторка в приложении» (login) — один адрес смены оформления', () => {
    it('канвас просит две оси в одной шторке и сам выводит из правила ридер плана', () => {
        const row = readContractRow('login.v4.dc.html', 'шторка в приложении');
        expect(row).toContain('две оси — палитра и режим');
        expect(row).toContain('заменяет оба нынешних тумблера');
        // Шестнадцатая сборка закрыла наш вопрос: тумблер темы в ридере плана
        // красит бумагу самого ридера, data-theme документа не трогает и входа
        // в шторку из ридера нет — под правило он не попадает и остаётся.
        expect(row).toContain('Тумблер темы в ридере плана под это правило не попадает и остаётся');
    });

    it('обе оси лежат в строке «Оформление» шторки настроек', () => {
        expect(shellSource).toContain("label: 'Оформление'");
        // ось «палитра»
        expect(shellSource).toContain("HEYS?.Theme?.setPalette?.(palette.id)");
        expect(shellSource).toContain("'Бежево-зелёная'");
        expect(shellSource).toContain("'Синяя'");
        // ось «режим»
        expect(shellSource).toContain("HEYS?.Theme?.setModePreference?.(mode.id)");
        expect(shellSource).toContain("label: 'Светлый'");
        expect(shellSource).toContain("label: 'Тёмный'");
        expect(shellSource).toContain("label: 'Как в системе'");
    });

    it('шторка открывается тем же входом в шапке, что и раньше стоял тумблер', () => {
        // Тумблер жил в leadingHeaderActions, которые gamification bar кладёт в
        // тот же .hdr-header-actions, что и ползунки настроек: где был тумблер,
        // там же и вход в шторку — ни один экран возможности не теряет.
        const actionsBlock = gamificationSource.slice(
            gamificationSource.indexOf("className: 'hdr-header-actions'"),
            gamificationSource.indexOf('hdr-header-icon-btn--settings') + 400,
        );
        expect(actionsBlock).toContain('leadingHeaderActions');
        expect(actionsBlock).toContain('__heysToggleTabSettingsHandler');
        expect(shellSource).toContain('__heysToggleTabSettingsHandler');
    });
});

describe('UI v4 · тумблер ридера остаётся — шторка оттуда недоступна', () => {
    afterEach(() => {
        cleanup();
        document.body.classList.remove('reading-reader-open');
        localStorage.removeItem('heys_reading_preferences_v1');
        history.replaceState({}, '', '/');
    });

    function loadReading() {
        window.React = React;
        window.ReactDOM = ReactDOM;
        window.HEYS = {};
        const files = [
            '../heys_reading_catalog_v1.js',
            '../reading/books/ray-dalio-principles_v1.js',
            '../heys_planning_reading_v1.js',
        ];
        files.forEach((file) => {
            (0, eval)(fs.readFileSync(path.resolve(__dirname, file), 'utf8'));
        });
        return window.HEYS.PlanningReading;
    }

    it('ридер — свой полноэкранный слой: шапки приложения, а значит и шторки, в нём нет', () => {
        const ui = loadReading();
        render(React.createElement(ui.ReadingScreen));
        fireEvent.click(screen.getByRole('button', { name: /Открыть «Принципы/ }));

        expect(document.querySelector('.reading-reader')).toBeTruthy();
        // Вход в шторку оформления живёт в шапке приложения; в слое ридера его нет.
        expect(document.querySelector('.hdr-header-icon-btn--settings')).toBeNull();
    });

    it('тумблер ридера красит только сам ридер, оформление приложения не трогает', () => {
        document.documentElement.setAttribute('data-theme', 'sand-light');
        const ui = loadReading();
        render(React.createElement(ui.ReadingScreen));
        fireEvent.click(screen.getByRole('button', { name: /Открыть «Принципы/ }));

        const toggle = screen.getByLabelText('Тёмная тема ридера');
        fireEvent.click(toggle);

        expect(document.querySelector('.reading-reader--dark')).toBeTruthy();
        // Ось приложения не сдвинулась: это не второй адрес смены оформления,
        // а бумага ридера. Поэтому строка «шторка в приложении» здесь не
        // применяется без решения владельца — см. отчёт по сведению.
        expect(document.documentElement.getAttribute('data-theme')).toBe('sand-light');
        expect(readingSource).toContain('reading-reader__theme-toggle');
    });
});
