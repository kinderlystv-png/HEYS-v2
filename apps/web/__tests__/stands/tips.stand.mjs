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
  
    <!-- Экран настроек советов: тумблеры включённый и выключенный. -->
    <div class="advice-v4-settings-overlay">
      <div class="advice-v4-settings">
        <div class="advice-v4-settings__header">
          <button type="button" class="advice-v4-settings__back" aria-label="Назад"></button>
          <span class="advice-v4-settings__title">Советы</span>
        </div>
        <div class="advice-v4-settings__body">
          <div class="advice-v4-settings__intro">Советы приходят, когда есть что сказать по вашим записям</div>
          <div class="advice-v4-settings__section-label">Как приходят</div>
          <div class="advice-v4-settings__group">
            <div class="advice-v4-settings__row">
              <div class="advice-v4-settings__row-copy">
                <div class="advice-v4-settings__row-title">Всплывающие</div>
                <div class="advice-v4-settings__row-hint">Показывать поверх экрана</div>
              </div>
              <button type="button" class="advice-v4-settings__toggle is-on" aria-pressed="true">
                <span class="advice-v4-settings__toggle-thumb"></span>
              </button>
            </div>
            <div class="advice-v4-settings__row">
              <div class="advice-v4-settings__row-copy">
                <div class="advice-v4-settings__row-title">Звук</div>
                <div class="advice-v4-settings__row-hint">Короткий сигнал</div>
              </div>
              <button type="button" class="advice-v4-settings__toggle" aria-pressed="false">
                <span class="advice-v4-settings__toggle-thumb"></span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- «Пропустить» в панели совета. -->
    <button type="button" class="advice-v4-panel__skip">Пропустить</button>
`,
  watch: {
    'Оверлей настроек': '.advice-v4-settings-overlay',
    'Экран настроек': '.advice-v4-settings',
    'Шапка настроек': '.advice-v4-settings__header',
    'Заголовок настроек': '.advice-v4-settings__title',
    'Вступление': '.advice-v4-settings__intro',
    'Метка раздела': '.advice-v4-settings__section-label',
    'Группа настроек': '.advice-v4-settings__group',
    'Заголовок строки': '.advice-v4-settings__row-title',
    'Подсказка строки': '.advice-v4-settings__row-hint',
    'Тумблер включён': '.advice-v4-settings__toggle.is-on',
    'Тумблер выключен': '.advice-v4-settings__toggle:not(.is-on)',
    'Бегунок тумблера': '.advice-v4-settings__toggle.is-on .advice-v4-settings__toggle-thumb',
    'Кнопка «Пропустить»': '.advice-v4-panel__skip',
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
