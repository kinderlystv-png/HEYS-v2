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
  
    <!-- Подробности уведомлений: капсула времени и два переключателя. -->
    <div class="notify-detail__card">
      <div class="notify-detail__capsule">
        <span class="notify-detail__capsule-value">09:00</span>
        <select class="notify-detail__capsule-select"><option>09:00</option></select>
      </div>
      <div class="notify-detail__row">
        <span class="notify-detail__row-label">Утренний чек-ин</span>
        <span class="notify-detail__switch is-on"><span class="notify-detail__knob"></span></span>
      </div>
      <div class="notify-detail__row">
        <span class="notify-detail__row-label">Советы</span>
        <span class="notify-detail__switch"><span class="notify-detail__knob"></span></span>
      </div>
    </div>

    <!-- Диагностика: свёрнутый переключатель и раскрытая панель с кнопками. -->
    <button type="button" class="hdr-settings-sheet__diag-toggle">Диагностика</button>
    <div class="hdr-settings-sheet__diag-panel">
      <div class="hdr-settings-sheet__diag-copy">Отправить журнал, если что-то пошло не так</div>
      <button type="button" class="hdr-settings-sheet__diag-btn">Скопировать журнал</button>
    </div>
`,
  watch: {
    'Карточка уведомлений': '.notify-detail__card',
    'Капсула времени': '.notify-detail__capsule',
    'Значение капсулы': '.notify-detail__capsule-value',
    'Строка уведомления': '.notify-detail__row',
    'Подпись строки': '.notify-detail__row-label',
    'Переключатель включён': '.notify-detail__switch.is-on',
    'Переключатель выключен': '.notify-detail__switch:not(.is-on)',
    'Бегунок включённого': '.notify-detail__switch.is-on .notify-detail__knob',
    'Переключатель диагностики': '.hdr-settings-sheet__diag-toggle',
    'Панель диагностики': '.hdr-settings-sheet__diag-panel',
    'Текст диагностики': '.hdr-settings-sheet__diag-copy',
    'Кнопка диагностики': '.hdr-settings-sheet__diag-btn',
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
