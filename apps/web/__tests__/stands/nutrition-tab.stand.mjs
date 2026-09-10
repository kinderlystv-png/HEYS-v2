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
  
    <!-- Состояния, у которых свой цвет: полоса за нормой, оценки, качество. -->
    <div class="nutrition-v4-hero">
      <div class="nutrition-v4-hero__fill is-over"></div>
    </div>
    <div class="nutrition-v4-block">
      <span class="nutrition-v4-block__meta is-ok">в норме</span>
      <span class="nutrition-v4-block__meta is-warn">много</span>
      <span class="nutrition-v4-block__source--confirm">подтверждено</span>
    </div>
    <div class="nutrition-v4-quality">
      <div class="nutrition-v4-quality__card is-ok">Состав ровный</div>
      <div class="nutrition-v4-quality__hint is-bad">Белка мало</div>
    </div>
    <div class="nutrition-v4-meal-row nutrition-v4-meal-row--empty">Ничего не записано</div>

    <!-- Лист: выбранная, недоступная и обычная строки. -->
    <div class="nutrition-v4-sheet">
      <div class="nutrition-v4-sheet__row is-selected">Выбрано</div>
      <div class="nutrition-v4-sheet__row is-disabled">Недоступно</div>
      <div class="nutrition-v4-sheet__row nutrition-v4-sheet__row--product">Продукт</div>
      <button type="button" class="nutrition-v4-sheet__action is-disabled">Нельзя</button>
      <div class="nutrition-v4-sheet__why-head is-open">Почему так</div>
    </div>

    <!-- Добавки: включённая, устаревшая, курсовая, свёрнутая и закрытая группа. -->
    <div class="nutrition-v4-supplements">
      <span class="nutrition-v4-supplements__chip is-on">Магний</span>
      <span class="nutrition-v4-supplements__chip is-stale">Омега</span>
      <span class="nutrition-v4-supplements__chip is-more">ещё 3</span>
      <span class="nutrition-v4-supplements__pill is-course">курс</span>
      <span class="nutrition-v4-supplements__group-pill is-done">готово</span>
    </div>

    <!-- День цикла и раскрытый блок. -->
    <span class="nutrition-v4-cycle-day is-on">4</span>
    <div class="nutrition-v4-disclose is-open">Подробнее</div>
`,
  watch: {
    'Блок нутриента': '.nutrition-v4-block',
    'Блок качества': '.nutrition-v4-quality',
    'Блок добавок': '.nutrition-v4-supplements',
    'Полоса за нормой': '.nutrition-v4-hero__fill.is-over',
    'Оценка · в норме': '.nutrition-v4-block__meta.is-ok',
    'Оценка · много': '.nutrition-v4-block__meta.is-warn',
    'Источник подтверждён': '.nutrition-v4-block__source--confirm',
    'Качество · хорошо': '.nutrition-v4-quality__card.is-ok',
    'Качество · плохо': '.nutrition-v4-quality__hint.is-bad',
    'Пустая строка приёма': '.nutrition-v4-meal-row--empty',
    'Строка листа · выбрана': '.nutrition-v4-sheet__row.is-selected',
    'Строка листа · недоступна': '.nutrition-v4-sheet__row.is-disabled',
    'Строка листа · продукт': '.nutrition-v4-sheet__row--product',
    'Действие недоступно': '.nutrition-v4-sheet__action.is-disabled',
    'Раскрытое «почему»': '.nutrition-v4-sheet__why-head.is-open',
    'Добавка включена': '.nutrition-v4-supplements__chip.is-on',
    'Добавка устарела': '.nutrition-v4-supplements__chip.is-stale',
    'Добавок ещё': '.nutrition-v4-supplements__chip.is-more',
    'Пилюля курса': '.nutrition-v4-supplements__pill.is-course',
    'Группа готова': '.nutrition-v4-supplements__group-pill.is-done',
    'День цикла включён': '.nutrition-v4-cycle-day.is-on',
    'Раскрытый блок': '.nutrition-v4-disclose.is-open',
    'корень питания': '.nutrition-v4',
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
