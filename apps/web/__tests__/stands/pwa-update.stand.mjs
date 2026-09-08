/** Stand · pwa-update — heys-update-modal из pwa-update-logic / one-wait-sign-smoke. */
export default {
  zone: 'pwa-update',
  cssFiles: [
    'styles/modules/002-ui-v4-palette-roles.css',
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
  `,
  watch: {
    'Подложка обновления': '.heys-update-modal__backdrop',
    'Карточка обновления': '.heys-update-modal__card',
    'Заголовок': '.heys-update-modal__title',
    'Подпись': '.heys-update-modal__subtitle',
    'Кнопка «Обновить»': '.heys-update-prompt__btn:not(.heys-update-prompt__btn--ghost)',
    'Кнопка «Позже»': '.heys-update-prompt__btn--ghost',
  },
};
