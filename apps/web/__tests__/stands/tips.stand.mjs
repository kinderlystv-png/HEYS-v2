/** Stand · tips — из tips-v4-canvas-razbor / advice-list-container--v4. */
export default {
  zone: 'tips',
  cssFiles: [
    'styles/modules/002-ui-v4-palette-roles.css',
    'styles/modules/400-water-and-hydration.css',
  ],
  html: `
    <div class="advice-list-overlay">
      <div class="advice-list-container advice-list-container--v4">
        <div class="advice-list-handle"></div>
        <div class="advice-list-header-top">
          <div class="advice-list-title">Советы <span class="advice-list-title__count">3</span></div>
          <button type="button" class="advice-list-header-link advice-list-header-link--read-all">Прочитать все</button>
        </div>
        <div class="advice-group-header">Сегодня</div>
        <div class="advice-list-item-wrapper">
          <div class="advice-list-item-v4 advice-list-item-success">
            <div class="advice-list-text">Добавьте белок к завтраку</div>
          </div>
        </div>
        <div class="advice-v4-rate-panel">
          <div class="advice-v4-rate-panel__label">Это помогло?</div>
          <div class="advice-v4-rate-actions">
            <button type="button" class="advice-v4-rate-btn advice-v4-rate-btn--helped">Да</button>
            <button type="button" class="advice-v4-rate-btn advice-v4-rate-btn--mute">Не то</button>
          </div>
          <p class="advice-v4-rate-note">Ответ виден только вам</p>
        </div>
        <div class="advice-v4-panel advice-v4-panel--sync">
          <div class="advice-v4-panel__title">Советы синхронизируются</div>
          <div class="advice-v4-panel__hint advice-v4-panel__hint--sync">Подождите несколько секунд</div>
        </div>
      </div>
    </div>
  `,
  watch: {
    'Оверлей': '.advice-list-overlay',
    'Лист v4': '.advice-list-container--v4',
    'Ручка листа': '.advice-list-handle',
    'Заголовок': '.advice-list-title',
    'Ссылка «Прочитать все»': '.advice-list-header-link--read-all',
    'Группа': '.advice-group-header',
    'Текст совета': '.advice-list-text',
    'Панель оценки': '.advice-v4-rate-panel',
    'Кнопка «Да»': '.advice-v4-rate-btn--helped',
    'Кнопка «Не то»': '.advice-v4-rate-btn--mute',
    'Панель синка': '.advice-v4-panel--sync',
  },
};
