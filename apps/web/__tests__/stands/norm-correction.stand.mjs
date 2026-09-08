/** Stand · norm-correction — из norm-correction-curator-kept.test.js. */
export default {
  zone: 'norm-correction',
  cssFiles: [
    'styles/modules/002-ui-v4-palette-roles.css',
    'styles/heys-components.css',
  ],
  html: `
    <section class="norm-correction-screen">
      <header class="norm-correction-screen__header">
        <span class="norm-correction-screen__title">Норма на неделю</span>
        <span class="norm-correction-screen__badge">куратор оставил</span>
      </header>
      <div class="norm-correction-screen__content">
        <div class="weekly-wrap-correction weekly-wrap-correction--curator_kept">
          <div class="weekly-wrap-correction__title is-key">Ваша норма сегодня</div>
          <div class="weekly-wrap-correction__hero">
            <span class="weekly-wrap-correction__hero-value">2&nbsp;112</span>
            <span class="weekly-wrap-correction__hero-caption">без изменений</span>
          </div>
          <div class="weekly-wrap-correction__body">Куратор посмотрел поправку.</div>
          <div class="weekly-wrap-correction__facts">
            <div class="weekly-wrap-correction__fact">
              <span class="weekly-wrap-correction__fact-label">Предложение было</span>
              <span class="weekly-wrap-correction__fact-value is-muted">2&nbsp;049</span>
            </div>
            <div class="weekly-wrap-correction__fact">
              <span class="weekly-wrap-correction__fact-label">Решение</span>
              <span class="weekly-wrap-correction__fact-value is-quiet">оставить 2&nbsp;112</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  `,
  watch: {
    'Экран поправки': '.norm-correction-screen',
    'Заголовок экрана': '.norm-correction-screen__title',
    'Бейдж экрана': '.norm-correction-screen__badge',
    'Ключевой заголовок': '.weekly-wrap-correction__title.is-key',
    'Герой числа': '.weekly-wrap-correction__hero-value',
    'Подпись героя': '.weekly-wrap-correction__hero-caption',
    'Тело карточки': '.weekly-wrap-correction__body',
    'Предложение': '.weekly-wrap-correction__fact-value.is-muted',
    'Решение': '.weekly-wrap-correction__fact-value.is-quiet',
  },
};
