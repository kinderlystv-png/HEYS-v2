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
      <span class="heys-boot-mark__disc"></span>
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
    'Заголовок': '.heys-boot-mark__title',
    'Подпись': '.heys-boot-mark__text',
    'Экран отказа': '.heys-boot-mark.is-fail',
    'Заголовок отказа': '.heys-boot-mark.is-fail .heys-boot-mark__title',
  },
};
