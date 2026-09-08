/** Stand · service-curator — advice-service из service-curator-v4-canvas-razbor. */
export default {
  zone: 'service-curator',
  cssFiles: [
    'styles/modules/002-ui-v4-palette-roles.css',
    'styles/modules/400-water-and-hydration.css',
  ],
  html: `
    <div class="advice-service-header">
      <div class="advice-service-title">Служебное</div>
    </div>
    <div class="advice-service-note">Раздел виден только по входу куратора</div>
    <div class="advice-service-section-label">Диагностика</div>
    <div class="advice-service-list">
      <div class="advice-service-row">
        <div class="advice-service-row__title">Техлог</div>
        <div class="advice-service-row__hint">Что и почему сработало за день</div>
      </div>
    </div>
    <div class="advice-service-footer-note">служебный раздел</div>
    <div class="advice-service-footer-tag">куратор</div>
  `,
  watch: {
    'Шапка раздела': '.advice-service-header',
    'Заголовок': '.advice-service-title',
    'Примечание': '.advice-service-note',
    'Метка секции': '.advice-service-section-label',
    'Список': '.advice-service-list',
    'Строка действия': '.advice-service-row__title',
    'Подсказка строки': '.advice-service-row__hint',
    'Сноска внизу': '.advice-service-footer-note',
    'Тег внизу': '.advice-service-footer-tag',
  },
};
