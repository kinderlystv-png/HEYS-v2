/** Stand · reports-insights — из reports-insights-v4-canvas-geometry / polosa4-task53. */
export default {
  zone: 'reports-insights',
  cssFiles: [
    'styles/modules/002-ui-v4-palette-roles.css',
    'styles/modules/734-ui-v4-insights.css',
    'styles/modules/733-ui-v4-reports.css',
    'styles/modules/740-cascade-card.css',
  ],
  html: `
    <section class="insights-v4-nutrition">
      <div class="insights-v4-nutrition__card">
        <div class="insights-v4-nutrition__head">БЖУ</div>
        <div class="insights-v4-nutrition__bzhu-row">
          <span class="insights-v4-nutrition__bzhu-name">Белки</span>
          <span class="insights-v4-nutrition__bzhu-kcal">128 г</span>
        </div>
      </div>
      <span class="insights-v4-maturity">данных мало</span>
      <span class="insights-v4-window__chip">7 дней</span>
    </section>
    <section class="reports-v4-tier reports-v4-tier--discipline">
      <span class="reports-v4-tier__note">Дисциплина за неделю</span>
      <div class="reports-v4-discipline__row">
        <span class="reports-v4-discipline__name">Питание</span>
        <span class="reports-v4-discipline__score">82</span>
        <span class="reports-v4-discipline__delta is-up">+4</span>
      </div>
    </section>
    <span class="cascade-dot cascade-dot--neutral"></span>
    <span class="cascade-dot cascade-dot--household"></span>
  `,
  watch: {
    'Карточка БЖУ': '.insights-v4-nutrition__card',
    'Заголовок БЖУ': '.insights-v4-nutrition__head',
    'Название макро': '.insights-v4-nutrition__bzhu-name',
    'Значение макро': '.insights-v4-nutrition__bzhu-kcal',
    'Зрелость данных': '.insights-v4-maturity',
    'Чип окна': '.insights-v4-window__chip',
    'Тир отчёта': '.reports-v4-tier',
    'Подпись тира': '.reports-v4-tier__note',
    'Строка дисциплины': '.reports-v4-discipline__row',
    'Оценка дисциплины': '.reports-v4-discipline__score',
    'Точка каскада': '.cascade-dot--neutral',
  },
};
