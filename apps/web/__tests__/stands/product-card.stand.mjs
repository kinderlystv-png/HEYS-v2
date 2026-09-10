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
  
    <!-- Исход проверки: три вида, имя класса код собирает из kind. -->
    <div class="aps-v4-outcome aps-v4-outcome--ok"><span class="aps-v4-outcome__icon"></span><span class="aps-v4-outcome__text">Всё в порядке</span></div>
    <div class="aps-v4-outcome aps-v4-outcome--neutral"><span class="aps-v4-outcome__text">Нейтрально</span></div>
    <div class="aps-v4-outcome aps-v4-outcome--warn">
      <div class="aps-v4-outcome__warn-title">Похожий продукт уже есть</div>
      <div class="aps-v4-outcome__warn-body">Проверьте, не дубль ли это</div>
    </div>

    <!-- Порция: чипы граммов и единицы, выбранные и обычные. -->
    <div class="aps-v4-grams-chips--portions">
      <button type="button" class="aps-v4-grams-chip is-active">100 г</button>
      <button type="button" class="aps-v4-grams-chip">50 г</button>
      <button type="button" class="aps-v4-grams-chip--portion is-active">порция</button>
      <button type="button" class="aps-v4-grams-unit is-active">г</button>
    </div>
    <div class="aps-v4-grams-impact__bar-add is-over"></div>
    <div class="aps-v4-portions-row aps-v4-portions-row--readonly">
      <input class="aps-v4-portions-row__input--grams" value="100" readonly />
    </div>

    <!-- Поиск: вкладки и два состояния выдачи. -->
    <button type="button" class="aps-v4-search-tab is-active">Мои</button>
    <button type="button" class="aps-v4-search-tab">Общие</button>
    <div class="aps-v4-search-state--start">Начните вводить название</div>
    <div class="aps-v4-search-state--warn">Ничего не нашли</div>
    <span class="aps-v4-shared-filter is-on">Общие</span>

    <!-- Строка продукта: недоступная и с отметкой избранного. -->
    <div class="aps-v4-product-row aps-v4-product-row--disabled">
      <span class="aps-v4-product-row__fav is-active"></span>
    </div>

    <!-- Разбор вреда: карточки сравнения и подзаголовки разделов. -->
    <div class="aps-v4-harm-compare__card aps-v4-harm-compare__card--own is-active">Ваш</div>
    <div class="aps-v4-harm-breakdown">
      <div class="aps-v4-harm-breakdown__section-title--good">Хорошее</div>
      <div class="aps-v4-harm-breakdown__section-title--bad">Плохое</div>
    </div>

    <!-- Создание: точка шага и подтверждение пресета. -->
    <span class="aps-v4-create-dot is-active"></span>
    <div class="aps-v4-preset-confirm__row is-last">Готово</div>
`,
  watch: {
    'Ряд чипов порции': '.aps-v4-grams-chips--portions',
    'Разбор вреда': '.aps-v4-harm-breakdown',
    'Исход · хорошо': '.aps-v4-outcome--ok',
    'Исход · нейтрально': '.aps-v4-outcome--neutral',
    'Исход · тревога': '.aps-v4-outcome--warn',
    'Заголовок тревоги': '.aps-v4-outcome__warn-title',
    'Текст тревоги': '.aps-v4-outcome__warn-body',
    'Чип граммов выбран': '.aps-v4-grams-chip.is-active',
    'Чип граммов обычный': '.aps-v4-grams-chip:not(.is-active):not(.aps-v4-grams-chip--portion)',
    'Чип порции выбран': '.aps-v4-grams-chip--portion.is-active',
    'Единица выбрана': '.aps-v4-grams-unit.is-active',
    'Полоса добавки за нормой': '.aps-v4-grams-impact__bar-add.is-over',
    'Строка порций только чтение': '.aps-v4-portions-row--readonly',
    'Поле граммов': '.aps-v4-portions-row__input--grams',
    'Вкладка поиска выбрана': '.aps-v4-search-tab.is-active',
    'Вкладка поиска обычная': '.aps-v4-search-tab:not(.is-active)',
    'Выдача · начните ввод': '.aps-v4-search-state--start',
    'Выдача · ничего нет': '.aps-v4-search-state--warn',
    'Фильтр общих включён': '.aps-v4-shared-filter.is-on',
    'Строка продукта недоступна': '.aps-v4-product-row--disabled',
    'Отметка избранного': '.aps-v4-product-row__fav.is-active',
    'Карточка сравнения · своя': '.aps-v4-harm-compare__card--own',
    'Раздел · хорошее': '.aps-v4-harm-breakdown__section-title--good',
    'Раздел · плохое': '.aps-v4-harm-breakdown__section-title--bad',
    'Точка шага создания': '.aps-v4-create-dot.is-active',
    'Последняя строка пресета': '.aps-v4-preset-confirm__row.is-last',
    'шаг создания': '.aps-create-step',
    'поле в строку': '.pe-field--inline',
    'ручной ввод штрихкода': '.aps-barcode-manual',
    'сравнение вреда': '.aps-v4-harm-compare',
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
