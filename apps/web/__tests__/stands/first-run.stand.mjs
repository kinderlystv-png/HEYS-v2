/** Stand · first-run — tour-overlay + desktop-gate из ui-v4-visual-fixture / polosa4-task104. */
export default {
  zone: 'first-run',
  cssFiles: [
    'styles/modules/002-ui-v4-palette-roles.css',
    'styles/heys-components.css',
    'styles/modules/500-pwa-and-offline.css',
  ],
  html: `
    <div class="tour-overlay">
      <div class="tour-tooltip">
        <div class="tour-title">Первый шаг</div>
        <div class="tour-text">Подсказка тура</div>
        <div class="tour-footer">
          <button type="button" class="tour-btn tour-btn-next">Дальше</button>
        </div>
      </div>
    </div>
    <div class="desktop-gate">
      <div class="desktop-gate__url-row">
        <span class="desktop-gate__url">https://app.heyslab.ru</span>
        <button type="button" class="desktop-gate__copy-btn">Скопировать</button>
      </div>
      <button type="button" class="desktop-gate__logout-btn">Выйти</button>
    </div>
  `,
  watch: {
    'Подсказка тура': '.tour-tooltip',
    'Заголовок тура': '.tour-title',
    'Текст тура': '.tour-text',
    'Кнопка «Дальше»': '.tour-btn-next',
    'Экран с компьютера': '.desktop-gate',
    'Пилюля «Скопировать»': '.desktop-gate__copy-btn',
  },
};
