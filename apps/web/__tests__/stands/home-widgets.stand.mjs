/** Stand · home-widgets — из widgets-v4-canvas-geometry / package43-reg-hw-ink-computed. */
export default {
  zone: 'home-widgets',
  cssFiles: [
    'styles/modules/002-ui-v4-palette-roles.css',
    'styles/modules/730-widgets-dashboard.css',
    'styles/heys-components.css',
  ],
  html: `
    <div class="widgets-tab">
      <div class="widgets-grid-container">
        <div class="widgets-grid">
          <article class="widget widget-calories">
            <span class="widget-v4-kicker">Калории</span>
            <span class="widget-calories__hero-bar-num widget-calories__hero-bar-num--ink">1 289</span>
            <span class="widget-v4-unit">ккал</span>
          </article>
          <article class="widget widget-streak">
            <span class="widget-v4-kicker">Серия</span>
            <span class="widget-streak__fire"></span>
          </article>
        </div>
      </div>
      <div class="widget-wd-sheet">
        <div class="widget-wd-sheet__scrim"></div>
        <div class="widget-wd-sheet__title">Вид главной</div>
        <div class="widget-wd-sheet__subtitle">Выберите плитки</div>
        <button type="button" class="widget-wd-sheet__opt is-on">Баланс</button>
      </div>
      <span class="widget-cascade__dot widget-cascade__dot--neutral"></span>
      <span class="pct-badge pct-badge--yellow">42%</span>
    </div>
  
    <!-- Режим расстановки: шапка с двумя кнопками и счётчик бюджета. -->
    <div class="hdr-tab-title-row">
      <button type="button" class="hdr-widgets-edit-btn hdr-widgets-edit-btn--cancel">Отмена</button>
      <span class="hdr-widgets-edit-title">Расстановка</span>
      <button type="button" class="hdr-widgets-edit-btn hdr-widgets-edit-btn--done">Готово</button>
    </div>
    <div class="hdr-widgets-edit-budget n"><span class="hdr-widgets-edit-budget__num">3</span></div>
    <div class="widgets-edit-fab active"></div>
`,
  watch: {
    'Шапка расстановки': '.hdr-tab-title-row',
    'Кнопка «Отмена»': '.hdr-widgets-edit-btn--cancel',
    'Заголовок расстановки': '.hdr-widgets-edit-title',
    'Кнопка «Готово»': '.hdr-widgets-edit-btn--done',
    'Счётчик бюджета': '.hdr-widgets-edit-budget',
    'Число бюджета': '.hdr-widgets-edit-budget__num',
    'Кнопка расстановки': '.widgets-edit-fab.active',
    'вкладка виджетов': '.widgets-tab',
    'контейнер сетки': '.widgets-grid-container',
    'сетка виджетов': '.widgets-grid',
    'виджет серии': '.widget-streak',
    'Плитка калорий': '.widget-calories',
    'Кикер плитки': '.widget-v4-kicker',
    'Число героя': '.widget-calories__hero-bar-num--ink',
    'Единица': '.widget-v4-unit',
    'Серия': '.widget-streak__fire',
    'Лист вида': '.widget-wd-sheet',
    'Затемнение листа': '.widget-wd-sheet__scrim',
    'Заголовок листа': '.widget-wd-sheet__title',
    'Опция листа': '.widget-wd-sheet__opt.is-on',
    'Точка каскада': '.widget-cascade__dot--neutral',
    'Бейдж процента': '.pct-badge--yellow',
  },
};
