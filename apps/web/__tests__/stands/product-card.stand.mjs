/** Stand · product-card — из product-card-v4-current-contract / polosa4-task63. */
export default {
  zone: 'product-card',
  cssFiles: [
    'styles/modules/002-ui-v4-palette-roles.css',
    'styles/modules/611-aps-product-card.css',
    'styles/modules/600-steps-and-aps.css',
    'styles/heys-components.css',
  ],
  html: `
    <div class="aps-create-step">
      <span class="aps-v4-header-count">3</span>
      <span class="aps-create-format">100 г</span>
      <span class="aps-create-barcode-note">Штрихкод не найден</span>
    </div>
    <div class="aps-v4-harm-breakdown__formula">расчёт по формуле</div>
    <div class="pe-field pe-field--inline">
      <span class="pe-label">Название</span>
      <input class="pe-input" type="text" value="">
    </div>
    <div class="aps-preview-macros">Б 12 · Ж 8 · У 45</div>
    <div class="aps-product-card">
      <span class="aps-product-card__name">Молоко</span>
    </div>
    <div class="aps-barcode-manual">
      <input class="aps-barcode-input" type="text" value="460123">
      <button type="button" class="aps-barcode-submit">→</button>
    </div>
    <div class="aps-v4-harm-compare">
      <div class="aps-v4-harm-compare__card aps-v4-harm-compare__card--own">
        <span class="aps-v4-harm-compare__label">Ваш продукт</span>
      </div>
    </div>
  `,
  watch: {
    'Счётчик шага': '.aps-v4-header-count',
    'Формат порции': '.aps-create-format',
    'Примечание штрихкода': '.aps-create-barcode-note',
    'Формула вреда': '.aps-v4-harm-breakdown__formula',
    'Подпись поля': '.pe-label',
    'Поле ввода': '.pe-input',
    'Макросы превью': '.aps-preview-macros',
    'Карточка продукта': '.aps-product-card',
    'Название продукта': '.aps-product-card__name',
    'Поле штрихкода': '.aps-barcode-input',
    'Кнопка штрихкода': '.aps-barcode-submit',
    'Сравнение вреда': '.aps-v4-harm-compare__card--own',
  },
};
