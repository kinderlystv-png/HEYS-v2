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
  
    <!-- Разворот продуктов внутри приёма. -->
    <div class="ca-modal__meal-card">
      <div class="ca-modal__meal-head">Обед · 640 ккал</div>
      <div class="ca-modal__meal-products">
        <div class="ca-modal__meal-product">Гречка<span class="ca-modal__item-grams">120 г</span></div>
        <div class="ca-modal__meal-divider"></div>
        <div class="ca-modal__meal-product">Куриное филе<span class="ca-modal__item-grams">150 г</span></div>
      </div>
      <span class="ca-modal__chevron"></span>
    </div>

    <!-- Повторы: бейдж и участники группы. -->
    <div class="ca-modal__repeat-group">
      <span class="ca-modal__repeat-badge">повтор ×3</span>
      <span class="ca-modal__repeat-kcal">1 920 ккал</span>
      <div class="ca-modal__repeat-members">
        <div class="ca-modal__repeat-member">8 сентября</div>
        <div class="ca-modal__repeat-member">9 сентября</div>
      </div>
    </div>
    <div class="ca-modal__item ca-modal__item--repeat">
      <span class="ca-modal__item-sub ca-modal__item-sub--nowrap">Повтор вчерашнего</span>
    </div>

    <!-- Несколько дней сразу: группа по типу и записи дней. -->
    <div class="ca-modal__group">
      <div class="ca-modal__type-group">
        <div class="ca-modal__type-title">Приёмы еды</div>
        <span class="ca-modal__type-count">4</span>
        <div class="ca-modal__type-members">
          <div class="ca-day-entry">
            <div class="ca-day-entry__copy">
              <div class="ca-day-entry__title">9 сентября</div>
              <div class="ca-day-entry__sub">Изменён обед</div>
            </div>
          </div>
        </div>
        <div class="ca-modal__type-more"><span class="ca-modal__type-more-title">ещё 2 дня</span></div>
      </div>
    </div>
`,
  watch: {
    'Шапка приёма': '.ca-modal__meal-head',
    'Список продуктов': '.ca-modal__meal-products',
    'Продукт приёма': '.ca-modal__meal-product',
    'Граммы продукта': '.ca-modal__item-grams',
    'Разделитель продуктов': '.ca-modal__meal-divider',
    'Шеврон': '.ca-modal__chevron',
    'Группа повтора': '.ca-modal__repeat-group',
    'Бейдж повтора': '.ca-modal__repeat-badge',
    'Ккал повтора': '.ca-modal__repeat-kcal',
    'Участник повтора': '.ca-modal__repeat-member',
    'Строка-повтор': '.ca-modal__item--repeat',
    'Подпись без переноса': '.ca-modal__item-sub--nowrap',
    'Группа дней': '.ca-modal__group',
    'Группа по типу': '.ca-modal__type-group',
    'Заголовок типа': '.ca-modal__type-title',
    'Счётчик типа': '.ca-modal__type-count',
    'Запись дня': '.ca-day-entry',
    'Заголовок дня': '.ca-day-entry__title',
    'Подпись дня': '.ca-day-entry__sub',
    'Ещё дни': '.ca-modal__type-more-title',
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
