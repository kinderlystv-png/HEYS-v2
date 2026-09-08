/** Stand · curator-edits — из curator-sheet-canvas-smoke / curator-edits-canvas-razbor. */
export default {
  zone: 'curator-edits',
  cssFiles: [
    'styles/modules/002-ui-v4-palette-roles.css',
    'styles/modules/500-pwa-and-offline.css',
  ],
  html: `
    <div class="ca-modal-backdrop ca-modal-backdrop--visible"></div>
    <div class="ca-modal">
      <div class="ca-modal__header">
        <div class="ca-modal__header-title">Куратор обновил дневник</div>
        <div class="ca-modal__header-subtitle">Проверьте, что изменилось</div>
        <button type="button" class="ca-modal__close"><span class="ca-modal__close-svg"></span></button>
      </div>
      <div class="ca-modal__content">
        <div class="ca-modal__group">
          <div class="ca-modal__date-label">5 июля</div>
          <div class="ca-modal__date-kcal">1 240 → 1 937 ккал</div>
        </div>
        <div class="ca-modal__meal-card">
          <div class="ca-modal__item">
            <span class="ca-modal__item-title">Ужин</span>
            <span class="ca-modal__item-sub">697 ккал</span>
          </div>
          <div class="ca-modal__meal-product">Люля куриные · 70 г</div>
          <button type="button" class="ca-modal__more-products">и ещё 4 продукта</button>
        </div>
        <div class="ca-modal__item ca-modal__item--repeat">
          <span class="ca-modal__type-title">Повтор</span>
          <span class="ca-modal__type-count">2</span>
        </div>
      </div>
      <button type="button" class="ca-modal__later-btn">Позже</button>
      <button type="button" class="ca-modal__ack-btn">Понятно</button>
    </div>
  `,
  watch: {
    'Подложка': '.ca-modal-backdrop--visible',
    'Модалка': '.ca-modal',
    'Заголовок': '.ca-modal__header-title',
    'Подзаголовок': '.ca-modal__header-subtitle',
    'Дата группы': '.ca-modal__date-label',
    'Ккал дня': '.ca-modal__date-kcal',
    'Карточка приёма': '.ca-modal__meal-card',
    'Название приёма': '.ca-modal__item-title',
    'Подпись приёма': '.ca-modal__item-sub',
    'Ещё продукты': '.ca-modal__more-products',
    'Кнопка «Позже»': '.ca-modal__later-btn',
    'Кнопка «Понятно»': '.ca-modal__ack-btn',
  },
};
