/** Stand · curator-cabinet — из curator-panel-canvas-geometry / curator-panel-sheet-render. */
export default {
  zone: 'curator-cabinet',
  cssFiles: [
    'styles/modules/002-ui-v4-palette-roles.css',
    'styles/modules/734-ui-v4-curator-panel.css',
  ],
  html: `
    <button type="button" class="cur-row">
      <span class="cur-row__avatar">МК</span>
      <span class="cur-row__name">Марина К.</span>
      <span class="cur-row__state">ждёт решения</span>
      <span class="cur-row__dot"></span>
      <span class="cur-row__age is-data">21 день</span>
    </button>
    <div class="cur-sheet">
      <div class="cur-sheet__meta">окно 21 день · −0,6 кг</div>
      <span class="cur-sheet__fact-value is-fact">2 220</span>
      <span class="cur-sheet__fact-hint">факт за окно</span>
      <div class="cur-sheet__save-error" role="alert">Решение не сохранено</div>
      <div class="cur-sheet__actions">
        <button type="button">Открыть дневник</button>
      </div>
    </div>
  `,
  watch: {
    'Строка клиента': '.cur-row',
    'Аватар': '.cur-row__avatar',
    'Имя клиента': '.cur-row__name',
    'Статус строки': '.cur-row__state',
    'Точка строки': '.cur-row__dot',
    'Возраст окна': '.cur-row__age.is-data',
    'Лист поправки': '.cur-sheet',
    'Мета листа': '.cur-sheet__meta',
    'Факт поправки': '.cur-sheet__fact-value.is-fact',
    'Ошибка сохранения': '.cur-sheet__save-error',
  },
};
