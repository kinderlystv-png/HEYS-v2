/** Stand · settings-system — hdr-settings-sheet из settings-cycle-v4-canvas-razbor. */
export default {
  zone: 'settings-system',
  cssFiles: [
    'styles/modules/002-ui-v4-palette-roles.css',
    'styles/modules/000-base-and-gamification.css',
    'styles/modules/500-pwa-and-offline.css',
  ],
  html: `
    <div style="min-height:812px;position:relative;width:375px">
    <div class="tab-settings-menu tab-settings-menu--v4-sheet">
      <div class="hdr-settings-sheet__head">
        <div class="hdr-settings-sheet__title">Настройки</div>
        <button type="button" class="hdr-settings-sheet__close" aria-label="Закрыть"></button>
      </div>
      <div class="hdr-settings-sheet__group">
        <div class="hdr-settings-sheet__row">
          <span class="hdr-settings-sheet__label">Уведомления</span>
          <span class="hdr-settings-sheet__meta">Вкл</span>
        </div>
      </div>
      <div class="hdr-settings-sheet__fab-card">
        <div class="hdr-settings-sheet__fab-lead">Быстрые действия</div>
        <div class="hdr-settings-sheet__chips hdr-settings-sheet__chips--fab">
          <button type="button" class="hdr-settings-sheet__fab-chip is-on">Вода</button>
        </div>
      </div>
    </div>
    </div>
  `,
  watch: {
    'лист настроек': '.tab-settings-menu--v4-sheet',
    'группа листа': '.hdr-settings-sheet__group',
    'Шапка шторки': '.hdr-settings-sheet__head',
    'Заголовок': '.hdr-settings-sheet__title',
    'Крестик': '.hdr-settings-sheet__close',
    'Строка списка': '.hdr-settings-sheet__row',
    'Подпись строки': '.hdr-settings-sheet__label',
    'Значение справа': '.hdr-settings-sheet__meta',
    'Карточка FAB': '.hdr-settings-sheet__fab-card',
    'Чип FAB': '.hdr-settings-sheet__fab-chip',
  },
};
