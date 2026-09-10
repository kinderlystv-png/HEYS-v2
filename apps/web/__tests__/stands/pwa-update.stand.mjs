/** Stand · pwa-update — heys-update-modal из pwa-update-logic / one-wait-sign-smoke. */
export default {
  zone: 'pwa-update',
  cssFiles: [
    'styles/modules/002-ui-v4-palette-roles.css',
    'styles/modules/000-base-and-gamification.css',
    'styles/heys-components.css',
  ],
  html: `
    <div style="min-height:812px;position:relative;width:375px">
    <div class="heys-update-modal">
      <div class="heys-update-modal__backdrop"></div>
      <div class="heys-update-modal__card">
        <div class="heys-update-modal__icon">
          <svg class="heys-update-modal__spinner" width="26" height="26"></svg>
        </div>
        <div class="heys-update-modal__title">Обновление</div>
        <div class="heys-update-modal__subtitle">Загрузка новой версии</div>
        <button type="button" class="heys-update-prompt__btn">Обновить</button>
        <button type="button" class="heys-update-prompt__btn heys-update-prompt__btn--ghost">Позже</button>
      </div>
    </div>
    </div>
    <div class="heys-update-prompt">
      <div class="heys-update-prompt__backdrop"></div>
      <div class="heys-update-prompt__card">
        <div class="heys-update-prompt__title">Обновление</div>
        <p class="heys-update-prompt__text">Подождите</p>
      </div>
    </div>
    <div class="heys-system-banner heys-system-banner--offline" role="status">
      <span class="heys-system-banner__icon" aria-hidden="true">!</span>
      <span>Нет сети</span>
    </div>
    <div class="offline-banner offline-banner-enhanced" role="status">
      <span class="offline-banner-icon pulse">📡</span>
      <div class="offline-banner-content">
        <span class="offline-banner-text">Нет сети — работаете с сохранёнными данными</span>
        <span class="offline-banner-duration">Офлайн 42 сек</span>
      </div>
    </div>
  
    <!-- Баннер восстановленной сети: живёт 2 секунды, но цвет у него свой. -->
    <div class="online-banner">
      <span class="online-banner-icon">✓</span>
      <span class="online-banner-text">Сеть восстановлена</span>
    </div>
`,
  watch: {
    'Баннер сети': '.online-banner',
    'Значок баннера': '.online-banner-icon',
    'Текст баннера': '.online-banner-text',
    'модалка обновления': '.heys-update-modal',
    'Подложка обновления': '.heys-update-modal__backdrop',
    'Карточка обновления': '.heys-update-modal__card',
    'Заголовок': '.heys-update-modal__title',
    'Подпись': '.heys-update-modal__subtitle',
    'Кнопка «Обновить»': '.heys-update-prompt__btn:not(.heys-update-prompt__btn--ghost)',
    'Кнопка «Позже»': '.heys-update-prompt__btn--ghost',
    'Промпт обновления': '.heys-update-prompt',
    'Карточка промпта': '.heys-update-prompt__card',
    'Баннер offline': '.heys-system-banner--offline',
    'Баннер offline enhanced': '.offline-banner-enhanced',
    'Текст enhanced-баннера': '.offline-banner-text',
    'Длительность offline': '.offline-banner-duration',
  },
};
