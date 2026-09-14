// Обзор первого входа против канваса first-run.v4: четыре шага, окно
// подсветки, карточка шага, плашка «обзор пройден». Геометрия карточки в
// канвасе лежит в классах его <style> (.tip, .tipk, .tipt, .tipp, .tipr, .tsk,
// .tnx, .spot), тексты шагов — в строках «Первый вход · шаг N · текст». Тест
// читает сам канвас, поэтому расхождение всплывёт при правке любой из сторон.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { requireRule } from './helpers/css-rule.mjs';

const ROOT = path.resolve(__dirname, '../../..');
const CANVAS = fs.readFileSync(
  path.join(
    ROOT,
    'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/first-run.v4.dc.html',
  ),
  'utf8',
);
const TOUR = fs.readFileSync(path.join(ROOT, 'apps/web/heys_ui_onboarding_v1.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'apps/web/styles/heys-components.css'), 'utf8');
const UNDO = fs.readFileSync(path.join(ROOT, 'apps/web/heys_undo_v1.js'), 'utf8');

// Стиль канваса минифицирован, правила разделены `}`. Класс ищется с начала
// селектора, а не подстрокой: иначе `.a .tip{` и `.x.tip{` сошли бы за `.tip`.
// Ненайденное роняет тест с именем класса: пустая строка читалась как «не
// сошлось», а означала «не смотрели».
const canvasRule = (cls) => {
  const m = CANVAS.match(new RegExp(`(?:^|[}\\s;,])\\.${cls}\\{([^}]*)\\}`));
  if (!m) throw new Error(`класса «.${cls}» нет в <style> канваса`);
  return m[1];
};
const productRule = (selector) => requireRule(CSS, selector).text;
const frameText = (label) => {
  const m = CANVAS.match(new RegExp(`<b>${label} · текст</b><span data-v="([^"]*)"`));
  return m ? m[1].split(' › ') : [];
};

describe('обзор первого входа против кадров first-run.v4', () => {
  it('четыре шага с текстами кадров, в порядке кадров', () => {
    const expected = [1, 2, 3, 4].map((n) => {
      const parts = frameText(`Первый вход · шаг ${n}`);
      const at = parts.findIndex((p) => p === `Шаг ${n} из 4`);
      expect(at, `кикер шага ${n} в кадре`).toBeGreaterThan(-1);
      return { title: parts[at + 1], text: parts[at + 2] };
    });
    const titles = [...TOUR.matchAll(/^\s{6}title: '([^']+)',$/gm)].map((m) => m[1]);
    const texts = [...TOUR.matchAll(/^\s{6}text: '([^']+)',$/gm)].map((m) => m[1]);
    expect(titles.slice(0, 4)).toEqual(expected.map((e) => e.title));
    expect(texts.slice(0, 4)).toEqual(expected.map((e) => e.text));
    // Строка «слова на экране»: без эмодзи и восклицаний в шагах обзора.
    for (const t of [...titles.slice(0, 4), ...texts.slice(0, 4)]) {
      expect(t, t).not.toMatch(/[!\u{1F300}-\u{1FAFF}]/u);
    }
  });

  it('кнопки: «Пропустить» и «Далее», на последнем шаге «Всё понятно» без тихой', () => {
    expect(frameText('Первый вход · шаг 1')).toContain('Пропустить');
    expect(frameText('Первый вход · шаг 4')).toContain('Всё понятно');
    expect(frameText('Первый вход · шаг 4')).not.toContain('Пропустить');
    expect(TOUR).toContain("isLast ? '' : '<button type=\"button\" class=\"tour-card__skip\">Пропустить</button>'");
    expect(TOUR).toContain("${isLast ? 'Всё понятно' : 'Далее'}");
    // Полосы прогресса нет — счёт словами в кикере.
    expect(TOUR).toContain('Шаг ${index + 1} из ${total}');
    expect(TOUR).not.toContain('tour-dot');
  });

  it('окно подсветки: радиус 20, обводка 2 --acs, снаружи --scrim; пульсации нет', () => {
    const spot = canvasRule('spot');
    expect(spot).toContain('border-radius:20px');
    expect(spot).toContain('0 0 0 2px var(--acs)');
    expect(spot).toContain('0 0 0 9999px var(--scrim)');
    const rule = productRule('.tour-highlight');
    expect(rule).toContain('border-radius: 20px');
    expect(rule).toContain('0 0 0 2px var(--v4-act');
    expect(rule).toContain('0 0 0 9999px var(--scrim');
    expect(rule).not.toContain('animation');
    expect(CSS).not.toContain('@keyframes tour-pulse');
    // Радиус окна по кадру каждого шага: 2 — круг вокруг кнопки, 4 — 18.
    expect(CANVAS).toMatch(/data-screen-label="Первый вход · шаг 2"[\s\S]*?<span class="spot"[^>]*border-radius:999px/);
    expect(CANVAS).toMatch(/data-screen-label="Первый вход · шаг 4"[\s\S]*?<span class="spot"[^>]*border-radius:18px/);
    expect(TOUR).toMatch(/id: 'step_add',[\s\S]*?radius: 999,/);
    expect(TOUR).toMatch(/id: 'step_reports',[\s\S]*?radius: 18,/);
    expect(TOUR).toContain("el.style.borderRadius = radius + 'px';");
    // Поля окна — цель плюс 4 со всех сторон.
    expect(TOUR).toMatch(/function createHighlight[\s\S]*?const padding = 4;/);
  });

  it('карточка шага: --md, радиус 22, поля 16/16/14, тень 0 18 46 30 %, поля экрана 14', () => {
    const tip = canvasRule('tip');
    expect(tip).toContain('left:14px;right:14px');
    expect(tip).toContain('border-radius:22px;padding:16px 16px 14px');
    expect(tip).toContain('0 18px 46px rgba(var(--shadow),.3)');
    const card = productRule('.tour-card');
    expect(card).toContain('left: 14px');
    expect(card).toContain('right: 14px');
    expect(card).toContain('border-radius: 22px');
    expect(card).toContain('padding: 16px 16px 14px');
    expect(card).toContain('0 18px 46px rgba(var(--dp-shadow-rgb, 80, 50, 20), 0.3)');
    expect(card).toContain('var(--v4-sand-surface-soft');
  });

  it('кикер, заголовок, текст и ряд кнопок — числа кадра', () => {
    expect(canvasRule('tipk')).toContain('700 9.5px/1');
    expect(canvasRule('tipk')).toContain('letter-spacing:.14em');
    expect(productRule('.tour-card__kicker')).toContain('700 9.5px/1');
    expect(productRule('.tour-card__kicker')).toContain('letter-spacing: 0.14em');
    expect(canvasRule('tipt')).toContain('700 16px/1.25');
    expect(canvasRule('tipt')).toContain('margin-top:9px');
    expect(productRule('.tour-card__title')).toContain('700 16px/1.25');
    expect(productRule('.tour-card__title')).toContain('margin: 9px 0 0');
    expect(canvasRule('tipp')).toContain('500 12.5px/1.5');
    expect(canvasRule('tipp')).toContain('margin-top:7px');
    expect(productRule('.tour-card__text')).toContain('500 12.5px/1.5');
    expect(productRule('.tour-card__text')).toContain('margin: 7px 0 0');
    expect(canvasRule('tipr')).toContain('gap:8px;margin-top:15px');
    expect(productRule('.tour-card__actions')).toContain('gap: 8px');
    expect(productRule('.tour-card__actions')).toContain('margin-top: 15px');
    expect(canvasRule('tsk')).toContain('min-height:44px;padding:0 14px');
    expect(productRule('.tour-card__skip')).toContain('min-height: 44px');
    expect(productRule('.tour-card__skip')).toContain('padding: 0 14px');
    expect(canvasRule('tnx')).toContain('flex:1;min-height:44px;border-radius:999px;background:var(--acs)');
    expect(productRule('.tour-card__next')).toContain('flex: 1');
    expect(productRule('.tour-card__next')).toContain('min-height: 44px');
    expect(productRule('.tour-card__next')).toContain('var(--v4-act,');
  });

  it('носик — отступление от кадра по строке контракта «вид · карточка шага»', () => {
    // Кадр носика не рисует; строка контракта задаёт квадрат 14 px тоном --md,
    // повёрнутый на 45°, по центру стороны, что смотрит на окно. Контракт
    // старше кадра — носик есть, и отступление названо здесь.
    expect(CANVAS).toMatch(/<b>вид · карточка шага<\/b><span data-v="[^"]*носик — квадрат 14 px/);
    expect(canvasRule('tip')).not.toContain('rotate');
    expect(productRule('.tour-card__nose')).toContain('width: 14px');
    expect(productRule('.tour-card__nose')).toContain('rotate(45deg)');
  });

  it('обзор поверх Главной, без демо-чисел и своей приветственной модалки', () => {
    expect(TOUR).toContain("HEYS.ui.switchTab('widgets')");
    expect(TOUR).not.toContain("switchTab('stats')");
    expect(TOUR).not.toContain('TOUR_DEMO_DATA');
    expect(TOUR).not.toContain('function showWelcomeModal');
    expect(TOUR).toMatch(/getDemoData\(\) \{[\s\S]*?return null;/);
  });

  it('«обзор пройден» — плашка без кольца и действия на 4 с; из настроек её нет', () => {
    const text = frameText('Первый вход · обзор пройден');
    expect(text).toContain('Обзор пройден. Вернуться к нему — в настройках');
    expect(TOUR).toContain("label: 'Обзор пройден. Вернуться к нему — в настройках', duration: 4000, notice: true");
    expect(TOUR).toContain('if (result.completed && !state.fromSettings)');
    // Строка «возврат к обзору»: из настроек обзор запускается и при
    // выключенном самостоятельном показе.
    expect(TOUR).toContain('if (!ONBOARDING_TOUR_ENABLED && !options.fromSettings) {');
    expect(UNDO).toContain("typeof opts.onUndo !== 'function' && !opts.notice");
    expect(productRule('.heys-undo-bar--notice .heys-undo-bar__ring,\n.heys-undo-bar--notice .heys-undo-bar__btn')).toContain('display: none');
  });
});
