/** Stand · food-meal — из polosa4-task63-food-meal / meal-time-v4-structure. */
export default {
  zone: 'food-meal',
  cssFiles: [
    'styles/modules/002-ui-v4-palette-roles.css',
    'styles/modules/600-steps-and-aps.css',
    'styles/modules/610-aps-meal-flow.css',
    'styles/heys-components.css',
  ],
  html: `
    <button type="button" class="nutrition-v4-meal-row nutrition-v4-meal-row--empty">
      <span class="nutrition-v4-meal-row__num">2</span>
      <span class="nutrition-v4-meal-row__title">Обед</span>
      <span class="nutrition-v4-meal-row__add">Добавить</span>
    </button>
    <div class="aps-v4-grams-hero">
      <div class="aps-v4-grams-hero__label">Граммы</div>
      <div class="aps-v4-grams-hero__controls">
        <button type="button" class="aps-v4-grams-hero__step">−</button>
        <input class="aps-v4-grams-hero__input" type="number" value="180" />
        <button type="button" class="aps-v4-grams-hero__step">+</button>
      </div>
    </div>
    <div class="nutrition-v4-sheet">
      <button type="button" class="nutrition-v4-sheet__action"><b>Сохранить</b></button>
      <button type="button" class="nutrition-v4-sheet__delete">Удалить приём</button>
    </div>
  `,
  watch: {
    'Пустая строка приёма': '.nutrition-v4-meal-row--empty',
    'Номер приёма': '.nutrition-v4-meal-row__num',
    'Кнопка «Добавить»': '.nutrition-v4-meal-row__add',
    'Герой граммов': '.aps-v4-grams-hero',
    'Подпись граммов': '.aps-v4-grams-hero__label',
    'Степпер минус': '.aps-v4-grams-hero__step',
    'Поле граммов': '.aps-v4-grams-hero__input',
    'Действие листа': '.nutrition-v4-sheet__action b',
    'Удаление приёма': '.nutrition-v4-sheet__delete',
  },
};
