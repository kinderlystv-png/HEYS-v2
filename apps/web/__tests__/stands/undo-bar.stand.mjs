/** Stand · undo-bar — из undo-bar-v4-contract / ui-v4-transient-geometry. */
export default {
  zone: 'undo-bar',
  cssFiles: [
    'styles/modules/002-ui-v4-palette-roles.css',
    'styles/heys-components.css',
  ],
  html: `
    <div style="min-height:812px;position:relative;width:375px">
    <div class="heys-undo-bar heys-undo-bar--visible">
      <div class="heys-undo-bar__content">
        <svg class="heys-undo-bar__ring" aria-hidden="true">
          <circle class="heys-undo-bar__arc" cx="15" cy="15" r="12.5"></circle>
        </svg>
        <span class="heys-undo-bar__count">1</span>
        <span class="heys-undo-bar__label">Удалён приём</span>
        <button type="button" class="heys-undo-bar__btn">Вернуть</button>
      </div>
    </div>
    </div>
  `,
  watch: {
    'Бар отмены': '.heys-undo-bar',
    'Содержимое бара': '.heys-undo-bar__content',
    'Подпись': '.heys-undo-bar__label',
    'Кнопка «Вернуть»': '.heys-undo-bar__btn',
  },
};
