/** Stand · spinners — heys-wait-mark из spinners-pwa-v4-canvas-razbor / one-wait-sign-smoke. */
export default {
  zone: 'spinners',
  cssFiles: [
    'styles/modules/002-ui-v4-palette-roles.css',
    'styles/heys-boot-mark.css',
    'styles/heys-components.css',
  ],
  html: `
    <div class="heys-wait-mark heys-wait-mark--screen">
      <span class="heys-wait-mark__disc"></span>
      <div class="heys-wait-mark__title">Загрузка</div>
      <div class="heys-wait-mark__text">Подождите</div>
    </div>
    <div class="heys-wait-mark is-ok">
      <span class="heys-wait-mark__disc"></span>
    </div>
    <div class="heys-wait-mark heys-wait-mark--embedded">
      <span class="heys-wait-mark__disc"></span>
    </div>
    <button type="button" class="heys-wait-mark heys-wait-mark--button">
      <span class="heys-wait-mark__disc"></span>
    </button>
    <div class="heys-boot-mark is-fail">
      <span class="heys-boot-mark__disc"></span>
      <span class="heys-boot-mark__title">Не удалось запустить</span>
      <span class="heys-boot-mark__text">Проверьте сеть</span>
    </div>
  `,
  watch: {
    'Знак ожидания': '.heys-wait-mark--screen',
    'Знак «готово»': '.heys-wait-mark.is-ok',
    'Встроенный знак': '.heys-wait-mark--embedded',
    'Кнопка-знак': '.heys-wait-mark--button',
    'Диск знака': '.heys-wait-mark__disc',
    'Заголовок знака': '.heys-wait-mark__title',
    'Текст знака': '.heys-wait-mark__text',
    'Экран отказа': '.heys-boot-mark.is-fail',
    'Заголовок отказа': '.heys-boot-mark.is-fail .heys-boot-mark__title',
  },
};
