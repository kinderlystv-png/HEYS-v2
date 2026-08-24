import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { readKeyframes, readReducedMotionBlock, readRule } from './boot-mark-css-helpers.js';

const webRoot = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(webRoot, 'index.html'), 'utf8');
const loading = fs.readFileSync(path.join(webRoot, 'heys_loading_progress_v1.js'), 'utf8');
const init = fs.readFileSync(path.join(webRoot, 'heys_app_initialize_v1.js'), 'utf8');
const css = fs.readFileSync(path.join(webRoot, 'styles/heys-boot-mark.css'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(webRoot, 'public/manifest.json'), 'utf8'));
const iconSvg = fs.readFileSync(path.join(webRoot, 'public/icon-v4.svg'), 'utf8');
const appleSvg = fs.readFileSync(path.join(webRoot, 'public/icon-v4-apple.svg'), 'utf8');

describe('cold-start spinner mark', () => {
  it('puts the 56 mark in #root instead of a chrome skeleton', () => {
    expect(html).toContain('data-heys-boot-mark="true"');
    expect(html).toContain('heys-boot-mark__spin');
    // Раньше здесь стояли svg 50 и r="9.2" — геометрия кадра «Стык · загрузчик»
    // (58/2,6 на диске 64). Строка контракта «вид знака» задаёт дугу 26 px
    // обводкой 2,75 с хвостом .22, и контракт старше кадра: проверка
    // переписана под неё, а не снята.
    expect(html).toMatch(/heys-boot-mark__spin[\s\S]*?<svg width="26" height="26"/);
    expect(html).toMatch(/heys-boot-mark__spin[\s\S]*?stroke-width="2\.75"/);
    expect(html).toMatch(/heys-boot-mark__spin[\s\S]*?opacity="\.22"/);
    expect(html).not.toMatch(/heys-boot-mark__spin[\s\S]*?<svg width="50"/);
    expect(html).toContain('role="status"');
    expect(html).toContain('Загружаем');
    expect(html).not.toMatch(/id="root"[\s\S]*heys-skeleton/);
    expect(html).not.toContain('Bottom tab bar');
  });

  it('hides the mark when there is no session', () => {
    expect(html).toContain("document.documentElement.setAttribute('data-heys-session'");
    expect(css).toContain('html[data-heys-session="0"] .heys-boot-mark');
  });

  it('uses byte stall and a 15s silent wait, not heartbeat', () => {
    expect(loading).toContain('const SLOW_MS = 15000');
    expect(loading).toContain('const STALL_MS = 60000');
    expect(loading).toContain('transferSize');
    expect(loading).toContain('location.reload()');
    expect(loading).not.toContain('__heysLoadingHeartbeat');
    expect(html).toContain('No boot-byte progress');
    expect(html).not.toContain('autoHeartbeat');
  });

  it('keeps curator contact on the second fail as an external bot link', () => {
    expect(loading).toContain('https://t.me/heyslab_support_bot');
    expect(html).toContain('https://t.me/heyslab_support_bot');
    expect(html).toContain('Написать куратору');
  });

  it('lets the visual guard clone the boot mark and fail with canvas copy', () => {
    expect(init).toContain('[data-heys-boot-mark], .heys-boot-mark, .heys-skeleton');
    expect(init).not.toContain('background:transparent');
    expect(init).toContain("overlay.className = 'heys-boot-visual-guard'");
    expect(css).toContain('#heys-boot-visual-guard');
    expect(css).toContain('overflow: hidden');
    expect(css).toContain('display: block');
    expect(css).toContain('#heys-boot-visual-guard .heys-boot-mark');
    expect(init).toContain('timeoutMs = Number(opts.timeoutMs) || 60000');
    expect(init).toContain('Не удалось загрузить приложение');
    expect(init).not.toContain('Экран не загрузился');
  });

  it('exposes WaitMark for in-app wait: embedded, screen, and button', () => {
    expect(loading).toContain('HEYS.WaitMark');
    expect(loading).toContain("mode === 'button'");
    expect(loading).toContain("opts && opts.idle");
    expect(css).toContain('.heys-wait-mark--embedded');
    expect(css).toContain('.heys-wait-mark--screen');
    expect(css).toContain('.heys-wait-mark--button');
    expect(css).toContain('.heys-wait-mark-overlay');
    expect(css).not.toMatch(/\.heys-wait-mark\s*\{[^}]*min-height:\s*100dvh/);
  });

  it('uses the same mark for cloud tabs and the four server actions', () => {
    const messenger = fs.readFileSync(path.join(webRoot, 'heys_messenger_v1.js'), 'utf8');
    const board = fs.readFileSync(path.join(webRoot, 'heys_board_tab_v1.js'), 'utf8');
    const stepModal = fs.readFileSync(path.join(webRoot, 'heys_step_modal_v1.js'), 'utf8');
    const consents = fs.readFileSync(path.join(webRoot, 'heys_consents_v1.js'), 'utf8');
    const intake = fs.readFileSync(path.join(webRoot, 'heys_trial_intake_v1.js'), 'utf8');
    const userTab = fs.readFileSync(path.join(webRoot, 'heys_user_tab_impl_v1.js'), 'utf8');

    expect(messenger).toContain("mode: 'embedded'");
    expect(messenger).not.toContain('messenger-skeleton__bubble');
    expect(board).toContain("mode: 'embedded'");
    expect(board).toContain('firstCloudWait');
    expect(stepModal).toContain('heys-wait-mark-overlay');
    expect(stepModal).toContain('Сохраняем профиль');
    expect(stepModal).toContain('Не удалось сохранить');
    expect(consents).toContain('WaitMark?.button');
    expect(consents).toContain("busyLabel: 'Подписываем'");
    expect(intake).toContain("title: 'Загружаем анкету'");
    expect(intake).toContain("idle: step === STEPS.length - 1 ? 'Отправить куратору'");
    expect(userTab).toContain('WaitMark?.button');
    expect(userTab).toContain("kind === 'pending'");
  });

  it('keys palettes off data-theme-id so blue is not sand', () => {
    expect(css).toContain('html[data-theme-id="blue"] .heys-boot-mark');
    expect(css).toContain('html[data-theme-id="blue-dark"] .heys-boot-mark');
    expect(css).toContain('html[data-theme-id="sand-dark"] .heys-boot-mark');
    expect(css).not.toMatch(/html\[data-theme="dark"\] #heys-boot-visual-guard/);
    expect(css).toContain('html[data-theme-id="blue"] .heys-boot-visual-guard');
  });

  it('anchors boot disc and fail state on shared splash coordinates', () => {
    expect(css).toContain('--heys-splash-anchor-y: max(148px, 45dvh)');
    expect(css).toContain('--heys-splash-disc-size: 56px');
    expect(css).toMatch(/\.heys-boot-mark__disc[\s\S]*top:\s*var\(--heys-splash-anchor-y\)/);
    expect(css).toMatch(/\.heys-boot-mark__disc[\s\S]*transform:\s*translate\(-50%, -50%\)/);
    expect(css).toMatch(/\.heys-boot-mark\.is-fail[\s\S]*\.heys-boot-mark__disc[\s\S]*top:\s*var\(--heys-splash-anchor-y\)|\.heys-boot-mark__disc[\s\S]*top:\s*var\(--heys-splash-anchor-y\)/);
  });

  it('keeps boot disc outside sign so fixed anchor survives state changes', () => {
    const boot = html.match(/<div class="heys-boot-mark" data-heys-boot-mark="true"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
    expect(boot).not.toBeNull();
    expect(boot[0]).toMatch(
      /<span class="heys-boot-mark__disc"[\s\S]*?<\/span>\s*<div class="heys-boot-mark__sign">/,
    );
    expect(boot[0]).not.toMatch(/<div class="heys-boot-mark__sign"[\s\S]*?<span class="heys-boot-mark__disc"/);
  });

  it('shows Repeat on the slow boot step, not only on second fail', () => {
    // Кнопка была ghost-текстом .heys-boot-mark__retry--ghost (44 px, акцент) —
    // так её рисует кадр «Спиннер · долгий старт». Строка контракта «вид ступеней
    // холодного старта» задаёт одну кнопку на фоне --c2, 13/700 чернилами 58 %,
    // высотой 48 и радиусом 999, поэтому ghost-варианта больше нет: ступень
    // держит тот же .heys-boot-mark__btn, что и отказ.
    expect(html).toMatch(
      /heys-boot-mark__slow"[\s\S]*?heys-boot-mark__btn heys-boot-mark__retry[\s\S]*?Повторить/,
    );
    expect(css).not.toContain('heys-boot-mark__retry--ghost');
  });

  it('draws cold-start steps by the contract, not by the frames', () => {
    // Кнопка ступени: фон --c2 (--boot-disc), чернила 58 %, 13/700, 48, r999, mt 22.
    expect(css).toMatch(
      /\.heys-boot-mark__btn \{[\s\S]*?margin-top: 22px;[\s\S]*?min-height: 48px;[\s\S]*?border-radius: 999px;[\s\S]*?background: var\(--boot-disc\);[\s\S]*?color: var\(--boot-ink-58\);[\s\S]*?font: 700 13px/,
    );
    // Строка про куратора — под кнопкой, 11,5/500 вторичным, только на второй неудаче.
    expect(css).toMatch(/\.heys-boot-mark__curator \{[\s\S]*?font: 500 11\.5px/);
    expect(css).toContain('.heys-boot-mark.is-fail-again .heys-boot-mark__curator { display: block; }');
    expect(html).toMatch(
      /heys-boot-mark__btn heys-boot-mark__retry">Повторить<\/button>\s*<a class="heys-boot-mark__curator"/,
    );
  });

  it('keeps the sign palettes on the canvas --c2 / --acs values', () => {
    // Синие наборы расходились с v4-canvas.css: #e2edf7 против --c2 #e2ecf6,
    // #2e7cc0 против --acs #1d5e96, #13222f против --c2 #1e3448.
    expect(css).toContain('--boot-disc: #e2ecf6;');
    expect(css).toContain('--boot-stroke: #1d5e96;');
    expect(css).toContain('--boot-disc: #1e3448;');
    expect(css).not.toContain('--boot-disc: #e2edf7;');
    expect(css).not.toContain('--boot-stroke: #2e7cc0;');
    expect(css).not.toContain('--boot-disc: #13222f;');
  });

  it('captions the sign at 15/7/12 with ink 50 percent', () => {
    // Контракт «вид подписи»: 18 px до заголовка 15/700 чернилами, 7 px до
    // причины 12/500 тоном чернил 50 %. Кадры «не удалось запустить» и
    // «долгий старт» набирали 17/9/12,5 и вторичные 12,5/600 — контракт старше.
    expect(css).toMatch(/\.heys-wait-mark__title \{[\s\S]*?margin-top: 18px;[\s\S]*?font: 700 15px/);
    expect(css).toMatch(/\.heys-boot-mark__title \{[\s\S]*?font: 700 15px/);
    expect(css).toMatch(/\.heys-boot-mark__slow-text \{[\s\S]*?font: 700 15px/);
    expect(css).toMatch(/\.heys-wait-mark__text \{[\s\S]*?margin-top: 7px;[\s\S]*?font: 500 12px[\s\S]*?--boot-ink-50/);
    expect(css).toMatch(/\.heys-boot-mark__text \{[\s\S]*?margin-top: 7px;[\s\S]*?font: 500 12px[\s\S]*?--boot-ink-50/);
    expect(css).not.toMatch(/font: 700 1[67]px/);
  });

  it('puts the loader letter under the wait sign, Caprasimo on --ac', () => {
    // Контракт app-splash «вид диска»: в загрузчике буква H тоном --ac,
    // набранная Caprasimo. Кадр «Стык · загрузчик» рисует на её месте сразу
    // дугу — контракт старше кадра, буква живёт до порога 300 мс.
    expect(html).toContain('<span class="heys-boot-mark__letter" aria-hidden="true">H</span>');
    expect(css).toContain("font-family: Caprasimo;");
    expect(css).toMatch(/\.heys-boot-mark__letter \{[\s\S]*?Caprasimo[\s\S]*?var\(--boot-letter\)/);
    expect(css).toContain('--boot-letter: #8a4a20;');
    expect(css).toMatch(/heys-boot-letter-out 1ms linear 300ms forwards/);
    // Знака ожидания до 300 мс нет вовсе.
    expect(css).toMatch(
      /\.heys-boot-mark__disc \.heys-boot-mark__spin > svg \{[\s\S]*?opacity: 0;[\s\S]*?heys-boot-fadein 150ms ease-out 300ms/,
    );
  });

  it('splits the caption threshold from the reason threshold', () => {
    // «дольше 2 с: с подписью; ещё позже добавляется причина задержки» —
    // раньше заголовок и причина приезжали одним порогом WAIT_LABEL_MS.
    expect(loading).toContain('const WAIT_REASON_MS = 5000');
    expect(loading).toContain("setTimeout(() => setPhase('reasoned'), WAIT_REASON_MS)");
    expect(loading).toContain('title: hasTitle(phase) ? props.title : null');
    expect(loading).toContain('text: hasReason(phase) ? props.text : null');
  });

  it('draws the in-button arc at 18 by 2.5', () => {
    expect(loading).toContain('const WAIT_GLYPH_BUTTON_PX = 18');
    expect(loading).toContain('const WAIT_GLYPH_PX = 26');
    expect(loading).toContain("return size <= WAIT_GLYPH_BUTTON_PX ? '2.5' : '2.75'");
    expect(loading).not.toContain("size <= 16 ? '3'");
  });

  it('morphs wait into a check on the same glyph in 200ms', () => {
    expect(loading).toContain("className: 'heys-wait-mark__close'");
    expect(loading).toContain("className: 'heys-wait-mark__check'");
    expect(loading).not.toContain("setTimeout(() => setFrame(1), 100)");
    expect(loading).not.toContain("icon === 'morph'");
    expect(css).toContain('@keyframes heys-wait-close');
    expect(css).toContain('@keyframes heys-wait-check');
    expect(css).toContain('animation: heys-wait-check 100ms ease-out 100ms forwards');
  });

  it('morph paths mount only for ok glyph', () => {
    expect(loading).toContain("if (phase === 'ok')");
    expect(loading).toContain("className: 'heys-wait-mark__close'");
    expect(loading).toContain("className: 'heys-wait-mark__spin animate-always'");
  });

  it('spinner rotates via html wrapper span', () => {
    expect(css).toMatch(/\.heys-boot-mark__spin[\s\S]*?display:\s*inline-flex/);
    expect(css).toContain('transform-origin: center center');
    // Вращение без !important. Флаг animate-always уже выводит дугу из-под
    // глобального гашения, а лишний !important тут только заставлял бы
    // правило дыхания перекрикивать вращение (контракт «без анимации»).
    expect(css).toContain('animation: heys-boot-spin 1.1s linear infinite;');
    expect(css).not.toContain('heys-boot-spin 1.1s linear infinite !important');
    // Флаг остаётся и проверяется дальше: он и выводит дугу из-под
    // глобального *:not(.animate-always), и входит в селектор дыхания
    // (0,3,0). Снять его — значит разом погасить дугу и промахнуться
    // мимо правила, которое возвращает ей движение.
    expect(html).toContain('heys-boot-mark__spin animate-always');
    expect(loading).toContain("className: 'heys-wait-mark__spin animate-always'");
    expect(loading).toContain("return h('span', { className: 'heys-wait-mark__spin animate-always'");
  });

  // Раньше на этом месте стоял not.toMatch(/prefers-reduced-motion: reduce
  // [\s\S]*heys-boot-breathe[\s\S]*heys-boot-mark__spin/) — он был зелёным
  // вхолостую: в удалённом коммитом e68e327c коде селектор шёл ПЕРЕД именем
  // кадров, а выражение требовало обратный порядок, так что не находило даже
  // то, что якобы запрещало. Ниже — проверка, которая читает сам блок
  // @media и падает, если дыхание убрать или подменить.
  it('breathes the arc instead of spinning under reduced motion', () => {
    const reduced = readReducedMotionBlock(css);
    const rule = readRule(reduced, '.heys-boot-mark__spin');

    expect(rule.selector).toContain('.heys-boot-mark .heys-boot-mark__spin.animate-always');
    expect(rule.selector).toContain('.heys-wait-mark .heys-wait-mark__spin.animate-always');
    expect(rule.body).toMatch(
      /animation:\s*heys-boot-breathe\s+1\.6s\s+ease-in-out\s+infinite\s*!important/,
    );
    expect(rule.body).not.toContain('heys-boot-spin');

    // Кадры дыхания живые, а не мёртвый код: гоняют только прозрачность.
    const breathe = readKeyframes(css, 'heys-boot-breathe');
    expect(breathe).toContain('opacity');
    expect(breathe).not.toContain('transform');
  });

  it('applies canvas wait thresholds for user actions', () => {
    expect(loading).toContain('const WAIT_SHOW_MS = 300');
    expect(loading).toContain('const WAIT_LABEL_MS = 2000');
    expect(loading).toContain('const WAIT_MIN_VISIBLE_MS = 400');
    expect(loading).toContain('WaitMarkButton');
    expect(loading).toContain('WaitMarkScreen');
    expect(loading).toContain('thresholds:');
  });

  it('matches app icon handoff: large H on #fffaf1, boot spinner on cold start', () => {
    expect(manifest.name).toBe('HEYS');
    expect(manifest.short_name).toBe('HEYS');
    expect(manifest.background_color).toBe('#fffaf1');
    expect(manifest.theme_color).toBe('#fffaf1');
    expect(manifest.description).toContain('Nutrition Tracker');
    expect(iconSvg).toContain('fill="#fffaf1"');
    expect(iconSvg).toContain('Figtree');
    expect(iconSvg).toContain('font-size="72"');
    // Строка контракта app-splash «что в круге» (девятая сборка): H в Figtree
    // весом 800. Тест писался под сборку иконки коммитами 9ac24876/fcd0a106,
    // когда вес был 700; остальные его утверждения — Figtree, размер 72,
    // отсутствие Caprasimo — совпадают с той же строкой, разошёлся только вес.
    expect(iconSvg).toContain('font-weight="800"');
    expect(iconSvg).not.toContain('Caprasimo');
    expect(iconSvg).not.toContain('fill="#efe3cf"');
    expect(iconSvg).not.toContain('cy="44"');
    expect(appleSvg).toContain('fill="#fffaf1"');
    expect(appleSvg).toContain('Figtree');
    expect(appleSvg).toContain('font-size="72"');
    expect(fs.existsSync(path.join(webRoot, 'public/apple-touch-icon.png'))).toBe(true);
    expect(html).toContain('rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180"');
    expect(html).toContain('apple-mobile-web-app-capable" content="yes"');
    expect(html).toContain('apple-mobile-web-app-status-bar-style" content="default"');
    expect(html).toContain('apple-mobile-web-app-title" content="HEYS"');
    expect(html).toContain('theme-color" content="#fffaf1"');
  });
});
