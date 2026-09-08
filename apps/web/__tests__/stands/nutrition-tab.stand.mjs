/** Stand · nutrition-tab — из nutrition-tab-v4-states / polosa4-task53-bare-literals. */
export default {
  zone: 'nutrition-tab',
  cssFiles: [
    'styles/modules/002-ui-v4-palette-roles.css',
    'styles/modules/732-ui-v4-nutrition.css',
  ],
  html: `
    <div class="nutrition-v4">
      <section class="nutrition-v4-hero" data-zone="calm">
        <div class="nutrition-v4-hero__label">Осталось</div>
        <div class="nutrition-v4-hero__value-row">
          <span class="nutrition-v4-hero__value">642</span>
          <span class="nutrition-v4-hero__unit">ккал</span>
        </div>
      </section>
      <button type="button" class="nutrition-v4-meal-row">
        <span class="nutrition-v4-meal-row__num">1</span>
        <span class="nutrition-v4-meal-row__title">Завтрак</span>
        <span class="nutrition-v4-meal-row__kcal">418</span>
        <span class="nutrition-v4-meal-row__chevron"></span>
      </button>
      <button type="button" class="nutrition-v4-chip is-off">Белки</button>
      <div class="nutrition-v4-sheet">
        <div class="nutrition-v4-sheet-backdrop"></div>
        <p class="nutrition-v4-verdict"><span>состав</span></p>
        <button type="button" class="nutrition-v4-sheet__row-remove">Удалить</button>
      </div>
    </div>
  `,
  watch: {
    'Герой': '.nutrition-v4-hero',
    'Подпись героя': '.nutrition-v4-hero__label',
    'Число героя': '.nutrition-v4-hero__value',
    'Строка приёма': '.nutrition-v4-meal-row',
    'Название приёма': '.nutrition-v4-meal-row__title',
    'Ккал приёма': '.nutrition-v4-meal-row__kcal',
    'Чип выкл': '.nutrition-v4-chip.is-off',
    'Лист приёма': '.nutrition-v4-sheet',
    'Подложка листа': '.nutrition-v4-sheet-backdrop',
    'Вердикт состава': '.nutrition-v4-verdict span',
  },
};
