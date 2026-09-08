/** Stand · app-splash — heys-boot-mark из boot-spinner-mark / ui-v4-transient-geometry. */
export default {
  zone: 'app-splash',
  cssFiles: [
    'styles/modules/002-ui-v4-palette-roles.css',
    'styles/heys-boot-mark.css',
  ],
  html: `
    <div style="min-height:812px;position:relative;width:375px">
    <div class="heys-boot-mark">
      <span class="heys-boot-mark__disc" aria-hidden="true">
        <span class="heys-boot-mark__spin animate-always" aria-hidden="true">
          <svg width="50" height="50" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9.2" stroke="var(--v4-ink-30, rgba(0,0,0,0.3))" stroke-width="2.6" fill="none"></circle>
            <path d="M12 2.8a9.2 9.2 0 019.2 9.2" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"></path>
          </svg>
        </span>
      </span>
      <span class="heys-boot-mark__title">Загрузка</span>
      <span class="heys-boot-mark__text">Подождите</span>
    </div>
    <div class="heys-boot-mark is-fail">
      <span class="heys-boot-mark__disc"></span>
      <span class="heys-boot-mark__warn"></span>
      <span class="heys-boot-mark__title">Не удалось запустить</span>
      <span class="heys-boot-mark__text">Проверьте сеть</span>
    </div>
    </div>
  `,
  watch: {
    'Маркер загрузки': '.heys-boot-mark',
    'Диск сплэша': '.heys-boot-mark__disc',
    'SVG-спиннер': '.heys-boot-mark__spin svg',
    'Заголовок': '.heys-boot-mark__title',
    'Подпись': '.heys-boot-mark__text',
    'Экран отказа': '.heys-boot-mark.is-fail',
    'Заголовок отказа': '.heys-boot-mark.is-fail .heys-boot-mark__title',
  },
};
