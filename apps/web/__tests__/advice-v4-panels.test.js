import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const adviceUiSource = fs.readFileSync(
  path.join(process.cwd(), 'day/_advice.js'),
  'utf8'
);

describe('advice v4 panels from canvas', () => {
  it('exposes read/hide/sync/service surfaces', () => {
    expect(adviceUiSource).toContain('renderAdviceReadFeedbackPanel');
    expect(adviceUiSource).toContain('renderAdviceHideUndoPanel');
    expect(adviceUiSource).toContain('renderAdviceSyncBanner');
    expect(adviceUiSource).toContain('renderAdviceServiceScreen');
    expect(adviceUiSource).toContain('AdviceRulesPoolModal');
    expect(adviceUiSource).toContain('advice-list-container--v4');
    expect(adviceUiSource).toContain('advice-v4-detail');
    expect(adviceUiSource).toContain('renderAdviceV4Icon');
    expect(adviceUiSource).toContain("renderAdviceV4Icon(React, 'thumb-up')");
    expect(adviceUiSource).toContain("renderAdviceV4Icon(React, 'thumb-down')");
    expect(adviceUiSource).toContain("renderAdviceV4Icon(React, 'cloud-off')");
    expect(adviceUiSource).toContain("renderAdviceV4Icon(React, 'chevron-left')");
    expect(adviceUiSource).toContain("renderAdviceV4Icon(React, 'chevron-right')");
    expect(adviceUiSource).toContain('advice-v4-icon--check');
    expect(adviceUiSource).toContain('advice-v4-sync-copy');
    expect(adviceUiSource).toContain('Совет скрыт до завтра');
    expect(adviceUiSource).toContain('advice-v4-hide-ring');
    expect(adviceUiSource).toContain('viewBox: \'0 0 36 36\'');
    expect(adviceUiSource).toContain('Понятно');
  });

  it('drawer title matches canvas without inline toggles', () => {
    expect(adviceUiSource).toMatch(/advice-list-title' \}, 'Советы'/);
    expect(adviceUiSource).not.toMatch(/💡 Советы/);
    expect(adviceUiSource).toContain('тап — открыть');
  });

  // Строка «служебные модалки»: техлог, диагностика и технические детали
  // клиенту недоступны. Эта половина держится и проверяется здесь: вход стоит
  // под признаком куратора, клиенту он не рисуется ни при каком состоянии.
  // Вторая половина строки — «их вход живёт в служебной створке настроек» —
  // пока не выполнима: створки в настройках нет. Названное отступление: вход
  // оставлен в шапке шторки, потому что снять его раньше замены значит
  // отобрать инструмент у куратора и ничего не дать клиенту.
  it('вход в служебное закрыт клиенту и стоит под признаком куратора', () => {
    const gate = '_isCurator && (adviceTraceAvailable || adviceDiagnostics)';
    const at = adviceUiSource.indexOf(gate);
    expect(at, 'вход в служебное должен стоять под _isCurator').toBeGreaterThan(-1);
    const entry = adviceUiSource.slice(at, at + 420);
    expect(entry).toContain('onClick: openAdviceService');
    expect(entry).toContain('Служебное');
    // Экран жив и остаётся целью для служебной створки настроек.
    expect(adviceUiSource).toContain('renderAdviceServiceScreen');
  });


  // Строка «служебные модалки» против строки «деталь»: ярус «Научное описание»
  // держит вход в технические детали, но клиенту он недоступен. Обе строки
  // сходятся на гейте по роли, а не на удалении входа.
  it('technical details entry is gated by curator role', () => {
    expect(adviceUiSource).toMatch(
      /hasEvidence && isCuratorReadOnlyMode\(\) && React\.createElement\('button'/,
    );
  });

  // Строка «панель оценки»: свайп влево сужает карточку на 96 px справа, панель
  // «Полезно?» встаёт в освободившемся месте, под карточкой ровно две кнопки.
  it('rating panel matches the «панель оценки» row', () => {
    expect(adviceUiSource).toContain('ADVICE_RATING_PANEL_WIDTH = 96');
    expect(adviceUiSource).toContain('advice-v4-rate-panel');
    expect(adviceUiSource).toContain("'Полезно?'");
    expect(adviceUiSource).toContain("'Помогло'");
    expect(adviceUiSource).toContain("'Не показывать такие'");
    expect(adviceUiSource).toContain(
      'Оба ответа меняют, что вы увидите дальше. Совет остаётся в списке.',
    );
    // Третьей кнопки нет: в ряду оценки ровно две.
    const actions = adviceUiSource.slice(
      adviceUiSource.indexOf("className: 'advice-v4-rate-actions'"),
      adviceUiSource.indexOf("className: 'advice-v4-rate-note'"),
    );
    expect(actions.match(/advice-v4-rate-btn--/g)).toHaveLength(2);
  });

  // Строка «не сохранено»: плашка --tint с новыми текстами и без «Повторить».
  it('offline plate matches the «не сохранено» row', () => {
    expect(adviceUiSource).toContain('Оценка не ушла — нет связи');
    expect(adviceUiSource).toContain(
      'Она сохранена на телефоне и отправится сама. Ничего делать не нужно.',
    );
    expect(adviceUiSource).not.toContain('Попробовать сейчас');
    expect(adviceUiSource).not.toContain('advice-v4-panel__retry');
    // Плашку поднимает очередь оценок, а не отметки прочтения: список советов
    // локальный, «не ушедшей» бывает только оценка (строка «офлайн»).
    expect(adviceUiSource).toContain("ADVICE_RATING_SYNC_KEY = 'heys_advice_outcomes_v1'");
  });

  it('detail screen tokens match ad2a canvas', () => {
    const cssSource = fs.readFileSync(
      path.join(process.cwd(), 'styles/modules/400-water-and-hydration.css'),
      'utf8'
    );
    expect(adviceUiSource).toContain("renderAdviceV4Icon(React, 'close')");
    expect(adviceUiSource).toMatch(/Технические детали',\s*renderAdviceV4Icon\(React,\s*'chevron-right'\)/);
    expect(cssSource).toMatch(/\.advice-v4-detail-overlay[\s\S]*?background:\s*var\(--v4-bg,\s*#fffaf1\)/);
    expect(cssSource).toMatch(/\.advice-v4-detail__close[\s\S]*?background:\s*#f7efe2/);

    // Строка «деталь» (двенадцатая сборка): ярусы разной формы намеренно —
    // герой на второй поверхности --c2 радиусом 22, «Детали» без карточки прямо
    // на фоне, наука на первой поверхности --c1 радиусом 18. Прежняя редакция
    // строки требовала трёх одинаковых карточек --c1 и спорила и с кадром, и с
    // кодом; здесь закреплена новая, и именно различие форм, а не только цвет.
    const hero = cssSource.match(/\.advice-v4-detail__hero \{([^}]*)\}/)[1];
    expect(hero).toMatch(/background:\s*#efe3cf/);
    expect(hero).toMatch(/border-radius:\s*22px/);

    const science = cssSource.match(/\.advice-v4-detail__science-box \{([^}]*)\}/)[1];
    expect(science).toMatch(/background:\s*#f7efe2/);
    expect(science).toMatch(/border-radius:\s*18px/);

    const detailsText = cssSource.match(/\.advice-v4-detail__text \{([^}]*)\}/)[1];
    expect(detailsText).not.toMatch(/background/);
    expect(detailsText).not.toMatch(/border-radius/);
  });

  // Строка «деталь»: экран, а не третий слой над шторкой — «два наложенных
  // листа на 330 px оставляют от содержимого полосу». Шапка экрана: надзаголовок
  // категории, заголовок, крестик.
  it('detail is a full screen with eyebrow, title and close', () => {
    const cssSource = fs.readFileSync(
      path.join(process.cwd(), 'styles/modules/400-water-and-hydration.css'),
      'utf8',
    );
    const overlay = cssSource.match(/\.advice-v4-detail-overlay \{([^}]*)\}/)[1];
    expect(overlay).toMatch(/position:\s*fixed/);
    expect(overlay).toMatch(/inset:\s*0/);
    // Фон непрозрачный: сквозь деталь шторка не просвечивает.
    expect(overlay).toMatch(/background:\s*var\(--v4-bg/);

    expect(adviceUiSource).toContain('advice-v4-detail__eyebrow');
    expect(adviceUiSource).toContain('advice-v4-detail__title');
    expect(adviceUiSource).toContain('advice-v4-detail__close');
  });

  it('exposes canvas overlays: disclaimer, settings, toast, empty, science', () => {
    expect(adviceUiSource).toContain('renderAdviceSharedOverlays');
    expect(adviceUiSource).toContain('AdviceMedicalDisclaimerGate');
    expect(adviceUiSource).toContain('renderAdviceSettingsScreen');
    expect(adviceUiSource).toContain('advice-v4-disclaimer-overlay');
    expect(adviceUiSource).toContain('advice-v4-settings');
    expect(adviceUiSource).toContain('advice-v4-toast-card');
    expect(adviceUiSource).toContain('Пока всё по плану — советов нет');
    expect(adviceUiSource).toContain('Первый совет');
    expect(adviceUiSource).toContain('Научное описание');
    expect(adviceUiSource).toContain('heys:open-advice-settings');
    expect(adviceUiSource).toMatch(/renderMedicalDisclaimer\(\) \{\s*return null;/);
  });
});
