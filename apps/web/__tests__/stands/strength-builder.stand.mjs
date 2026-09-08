/** Stand · strength-builder — из strength-builder-empty-v4-canvas-contract. */
export default {
  zone: 'strength-builder',
  cssFiles: [
    'styles/modules/002-ui-v4-palette-roles.css',
    'styles/modules/000-base-and-gamification.css',
    'styles/modules/750-strength-builder.css',
  ],
  html: `
    <div class="sb-root sb-head is-empty">
      <div class="sb-empty-scroll">
        <div class="sb-empty-card">
          <b>Пустая тренировка</b>
          <p>План на сегодня готов</p>
        </div>
        <button type="button" class="sb-empty-action is-primary">Начать по плану</button>
        <button type="button" class="sb-empty-action">Собрать свою</button>
        <div class="sb-empty-options">
          <button type="button" class="sb-empty-action">Повторить вчера</button>
        </div>
        <p class="sb-empty-note">Можно начать по плану куратора или собрать свою.</p>
      </div>
    </div>
  `,
  watch: {
    'Корень builder': '.sb-root',
    'Пустая шапка': '.sb-head.is-empty',
    'Карточка пустого': '.sb-empty-card',
    'Заголовок пустого': '.sb-empty-card b',
    'Главное действие': '.sb-empty-action.is-primary',
    'Вторичное действие': '.sb-empty-action:not(.is-primary)',
    'Блок опций': '.sb-empty-options',
    'Сноска': '.sb-empty-note',
  },
};
