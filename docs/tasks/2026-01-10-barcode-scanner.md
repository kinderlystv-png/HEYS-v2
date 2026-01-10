---
template-version: 3.3.0
created: 2026-01-10
purpose: Добавить сканер штрих-кодов в PWA для быстрого добавления продуктов
priority: High
---

# Task: Сканер штрих-кодов для продуктов 📷

## 📌 TL;DR (Краткий бриф)

**Цель**: Реализовать сканирование штрих-кодов (EAN-13/EAN-8/UPC) через камеру
устройства в PWA для мгновенного добавления продуктов без ручного поиска.

**Что делаем** (по приоритету):

1. **Barcode Scanner**: Интеграция библиотеки `html5-qrcode` + нативный
   `BarcodeDetector API` как fallback.
2. **Product Model**: Добавить поле `barcode` в модель Product + localStorage.
3. **Open Food Facts API**: Интеграция для получения данных продукта по
   штрих-коду.
4. **UI/UX**: Кнопка сканера в поиске, overlay камеры, автозаполнение полей.
5. **Offline**: Кэширование результатов для работы без сети.

**Зачем**:

- **Скорость**: Сканирование за 2-3 сек vs 15-30 сек ручного поиска.
- **Точность**: Нет опечаток, точные КБЖУ с упаковки.
- **UX**: Клиент сканирует → продукт сразу добавляется → куратор видит данные.
- **Pro/Pro+ value**: Премиум-фича для тарифов с сопровождением.

**Время**: ~10-12 часов

---

## 🎯 WHY (Бизнес-контекст)

**Problem**: Добавление продуктов занимает много времени:

- Ручной поиск по названию (15-30 сек).
- Часто нет точного совпадения → создание нового продукта.
- Ошибки в КБЖУ при ручном вводе.
- Куратор тратит время на уточнение продуктов по фото.

**Solution**: Сканирование штрих-кода камерой:

- Мгновенный поиск по уникальному идентификатору.
- Автозаполнение КБЖУ из Open Food Facts (2M+ продуктов).
- Сохранение barcode для быстрого повторного добавления.

**User Story**:

> Как клиент HEYS, я хочу сканировать штрих-код на упаковке продукта, чтобы
> мгновенно добавить его в дневник без ручного поиска и ввода данных.

---

## 🛠️ REQUIREMENTS (Технические требования)

### 1. Barcode Scanner Library

**Основной вариант**: `html5-qrcode` (активно поддерживается, ~100KB)

```bash
pnpm add html5-qrcode
```

**Поддерживаемые форматы**:

- EAN-13 (основной для продуктов в РФ)
- EAN-8 (короткий формат)
- UPC-A (американские продукты)

**Нативный fallback**: `BarcodeDetector API` (Chrome/Edge Android — 0KB,
быстрее)

### 2. Обновление модели Product

```javascript
// Новые поля в Product
{
  barcode: string | null,      // EAN-13/EAN-8/UPC
  barcodeSource: 'manual' | 'openfoodfacts' | 'scan',  // откуда данные
  barcodeVerified: boolean,    // подтверждено пользователем
}
```

### 3. Open Food Facts API Integration

**Endpoint**: `https://world.openfoodfacts.org/api/v2/product/{barcode}.json`

**Маппинг полей**:

| Open Food Facts            | HEYS Product      |
| -------------------------- | ----------------- |
| `product_name`             | `name`            |
| `nutriments.energy-kcal`   | `kcal100`         |
| `nutriments.proteins`      | `protein100`      |
| `nutriments.fat`           | `fat100`          |
| `nutriments.carbohydrates` | `carbs100`        |
| `nutriments.fiber`         | `fiber100`        |
| `nutriments.sugars`        | `simple100`       |
| `image_url`                | (показать превью) |

### 4. UI Components

- **ScanButton**: Кнопка 📷 рядом с полем поиска.
- **BarcodeScanner**: Fullscreen overlay с камерой и рамкой.
- **ProductPreview**: Карточка найденного продукта для подтверждения.
- **ManualBarcodeInput**: Ввод штрих-кода вручную (если камера не работает).

### 5. Permissions & Compatibility

| Платформа      | Поддержка    | Примечание                 |
| -------------- | ------------ | -------------------------- |
| Chrome Android | ✅ Полная    | Нативный BarcodeDetector   |
| Safari iOS     | ✅ Полная    | Требует HTTPS + разрешение |
| Chrome Desktop | ⚠️ Частичная | Только с веб-камерой       |
| Firefox        | ✅ Полная    | Через html5-qrcode         |

---

## 📋 KEY FILES (Ключевые файлы)

| Файл                           | Роль     | Изменения                                |
| ------------------------------ | -------- | ---------------------------------------- |
| `apps/web/heys_barcode_v1.js`  | **NEW**  | Модуль сканера + Open Food Facts API     |
| `apps/web/heys_core_v12.js`    | Consumer | Интеграция сканера в поиск продуктов     |
| `apps/web/heys_models_v1.js`   | Model    | Добавить поле `barcode` в Product        |
| `apps/web/heys_day_v12.js`     | Consumer | Кнопка сканера в AddProductStep          |
| `apps/web/index.html`          | Entry    | Подключение библиотеки (если не bundled) |
| `docs/DATA_MODEL_REFERENCE.md` | Docs     | Документация нового поля                 |

---

## 🧗 PLAN (План работ)

### Phase 1: Core Scanner Module

- [ ] Создать `heys_barcode_v1.js` с базовой структурой.
- [ ] Реализовать `initScanner()` с проверкой поддержки камеры.
- [ ] Реализовать `startScan()` / `stopScan()` с html5-qrcode.
- [ ] Добавить fallback на нативный `BarcodeDetector API`.
- [ ] Обработка ошибок (нет камеры, нет разрешения, не распознан).

### Phase 2: Open Food Facts Integration

- [ ] Реализовать `fetchProductByBarcode(barcode)`.
- [ ] Маппинг полей OFF → HEYS Product.
- [ ] Обработка отсутствующих полей (fallback на 0).
- [ ] Кэширование результатов в localStorage.
- [ ] Rate limiting (max 10 req/min для OFF API).

### Phase 3: Product Model Update

- [ ] Добавить поля `barcode`, `barcodeSource`, `barcodeVerified` в Product.
- [ ] Обновить `computeDerived()` если нужно.
- [ ] Миграция существующих продуктов (barcode = null).
- [ ] Индекс для быстрого поиска по barcode.

### Phase 4: UI Components

- [ ] Создать компонент `BarcodeScannerOverlay`.
- [ ] Добавить кнопку 📷 в `SearchProductStep`.
- [ ] Реализовать `ProductPreviewCard` (показ найденного продукта).
- [ ] Добавить `ManualBarcodeInput` (ручной ввод).
- [ ] Анимация сканирования (линия/рамка).
- [ ] Звуковой/вибро feedback при успешном скане.

### Phase 5: Integration & Polish

- [ ] Интегрировать в flow добавления продукта.
- [ ] Добавить в Quick Actions (если есть).
- [ ] Обработка "продукт не найден" → предложить создать.
- [ ] Связать barcode при создании нового продукта.
- [ ] Тестирование на iOS Safari и Android Chrome.

---

## 🧪 TESTING STRATEGY (Как проверять)

### Unit Tests (Manual)

1. **Сканирование работает**:
   - Открыть сканер → навести на штрих-код → продукт найден.
   - Тест с EAN-13: `4600682000013` (молоко).
   - Тест с EAN-8: `46001234`.

2. **Open Food Facts интеграция**:
   - Запрос по barcode → данные получены → поля заполнены.
   - Несуществующий barcode → сообщение "Продукт не найден".

3. **Offline режим**:
   - Отключить сеть → сканировать ранее найденный barcode → данные из кэша.

4. **Permissions**:
   - Отказ от камеры → показать ручной ввод.
   - Повторный запрос разрешения.

### Visual Check

- Overlay камеры занимает весь экран.
- Рамка сканирования видна и анимирована.
- ProductPreview показывает все данные (название, КБЖУ, фото).

### Performance

- Время от нажатия до открытия камеры: <500ms.
- Время распознавания: <2 сек при хорошем освещении.
- Запрос к OFF API: <1 сек.

### Compatibility

- [ ] Chrome Android 80+
- [ ] Safari iOS 14+
- [ ] Firefox Android
- [ ] Chrome Desktop (веб-камера)

---

## 💡 CODE EXAMPLES (Ключевые паттерны)

### 1. Scanner Initialization

```javascript
// heys_barcode_v1.js
(function (global) {
  const HEYS = (global.HEYS = global.HEYS || {});

  const BarcodeScanner = {
    scanner: null,
    isScanning: false,

    // Проверка поддержки
    isSupported() {
      return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    },

    // Проверка нативного API
    hasNativeSupport() {
      return 'BarcodeDetector' in window;
    },

    // Инициализация
    async init(containerId) {
      if (!this.isSupported()) {
        throw new Error('Camera not supported');
      }

      const { Html5Qrcode } = await import('html5-qrcode');
      this.scanner = new Html5Qrcode(containerId);
      return this;
    },

    // Начать сканирование
    async start(onSuccess, onError) {
      if (this.isScanning) return;

      const config = {
        fps: 10,
        qrbox: { width: 250, height: 100 },
        formatsToSupport: [
          0, // QR_CODE (на всякий случай)
          4, // EAN_13
          5, // EAN_8
          11, // UPC_A
        ],
      };

      try {
        await this.scanner.start(
          { facingMode: 'environment' }, // Задняя камера
          config,
          (decodedText) => {
            this.vibrate();
            onSuccess(decodedText);
          },
          (errorMessage) => {
            // Игнорируем ошибки "не найден" — это нормально
            if (!errorMessage.includes('No barcode')) {
              onError?.(errorMessage);
            }
          },
        );
        this.isScanning = true;
      } catch (err) {
        onError?.(err.message);
      }
    },

    // Остановить
    async stop() {
      if (this.scanner && this.isScanning) {
        await this.scanner.stop();
        this.isScanning = false;
      }
    },

    // Вибрация при успехе
    vibrate() {
      if (navigator.vibrate) {
        navigator.vibrate(100);
      }
    },
  };

  HEYS.BarcodeScanner = BarcodeScanner;
})(window);
```

### 2. Open Food Facts API

```javascript
const OpenFoodFacts = {
  BASE_URL: 'https://world.openfoodfacts.org/api/v2/product',
  cache: new Map(),

  async fetchProduct(barcode) {
    // Проверяем кэш
    if (this.cache.has(barcode)) {
      return this.cache.get(barcode);
    }

    try {
      const response = await fetch(`${this.BASE_URL}/${barcode}.json`, {
        headers: { 'User-Agent': 'HEYS-Nutrition-App/1.0' },
      });

      if (!response.ok) {
        throw new Error('Product not found');
      }

      const data = await response.json();

      if (data.status !== 1) {
        return null; // Продукт не найден
      }

      const product = this.mapToHEYS(data.product, barcode);
      this.cache.set(barcode, product);

      // Сохраняем в localStorage для offline
      this.saveToLocalCache(barcode, product);

      return product;
    } catch (error) {
      console.warn('[OFF] Fetch error:', error);
      // Пробуем из localStorage
      return this.loadFromLocalCache(barcode);
    }
  },

  mapToHEYS(offProduct, barcode) {
    const n = offProduct.nutriments || {};

    return {
      id: `off_${barcode}`,
      name:
        offProduct.product_name ||
        offProduct.product_name_ru ||
        'Неизвестный продукт',
      barcode: barcode,
      barcodeSource: 'openfoodfacts',
      barcodeVerified: false,

      // Нутриенты на 100г
      kcal100: n['energy-kcal_100g'] || n['energy-kcal'] || 0,
      protein100: n.proteins_100g || n.proteins || 0,
      fat100: n.fat_100g || n.fat || 0,
      carbs100: n.carbohydrates_100g || n.carbohydrates || 0,
      fiber100: n.fiber_100g || n.fiber || 0,
      simple100: n.sugars_100g || n.sugars || 0,

      // Дополнительно
      gi: null, // OFF не хранит GI
      imageUrl: offProduct.image_url || offProduct.image_front_url,
      brands: offProduct.brands,
      categories: offProduct.categories,
    };
  },

  saveToLocalCache(barcode, product) {
    try {
      const key = `heys_barcode_${barcode}`;
      localStorage.setItem(key, JSON.stringify(product));
    } catch (e) {
      /* ignore */
    }
  },

  loadFromLocalCache(barcode) {
    try {
      const key = `heys_barcode_${barcode}`;
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  },
};

HEYS.OpenFoodFacts = OpenFoodFacts;
```

### 3. React Component (Scanner Overlay)

```javascript
const BarcodeScannerOverlay = ({ isOpen, onClose, onProductFound }) => {
  const scannerRef = React.useRef(null);
  const [status, setStatus] = React.useState('initializing'); // initializing | scanning | found | error
  const [foundProduct, setFoundProduct] = React.useState(null);

  React.useEffect(() => {
    if (!isOpen) return;

    let mounted = true;

    const initScanner = async () => {
      try {
        await HEYS.BarcodeScanner.init('barcode-scanner-container');
        if (!mounted) return;

        setStatus('scanning');

        await HEYS.BarcodeScanner.start(
          async (barcode) => {
            setStatus('found');
            await HEYS.BarcodeScanner.stop();

            // Ищем продукт
            const product = await HEYS.OpenFoodFacts.fetchProduct(barcode);

            if (product) {
              setFoundProduct(product);
            } else {
              // Не найден — предложить создать
              setFoundProduct({ barcode, notFound: true });
            }
          },
          (error) => {
            console.warn('Scan error:', error);
          },
        );
      } catch (err) {
        setStatus('error');
        console.error('Scanner init error:', err);
      }
    };

    initScanner();

    return () => {
      mounted = false;
      HEYS.BarcodeScanner.stop();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return React.createElement(
    'div',
    { className: 'barcode-overlay' },
    // Заголовок
    React.createElement(
      'div',
      { className: 'barcode-header' },
      React.createElement(
        'button',
        { onClick: onClose, className: 'close-btn' },
        '✕',
      ),
      React.createElement('span', null, 'Наведите на штрих-код'),
    ),

    // Камера
    status === 'scanning' &&
      React.createElement('div', {
        id: 'barcode-scanner-container',
        className: 'scanner-container',
      }),

    // Найденный продукт
    foundProduct &&
      !foundProduct.notFound &&
      React.createElement(ProductPreviewCard, {
        product: foundProduct,
        onConfirm: () => {
          onProductFound(foundProduct);
          onClose();
        },
        onRetry: () => {
          setFoundProduct(null);
          setStatus('scanning');
          HEYS.BarcodeScanner.start(/* ... */);
        },
      }),

    // Не найден
    foundProduct?.notFound &&
      React.createElement(
        'div',
        { className: 'not-found' },
        React.createElement(
          'p',
          null,
          `Продукт с кодом ${foundProduct.barcode} не найден`,
        ),
        React.createElement(
          'button',
          {
            onClick: () => {
              // Открыть форму создания с barcode
              onProductFound({ barcode: foundProduct.barcode, create: true });
              onClose();
            },
          },
          'Создать продукт',
        ),
      ),
  );
};
```

### 4. CSS Styles

```css
/* Добавить в heys-components.css */

.barcode-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: #000;
  display: flex;
  flex-direction: column;
}

.barcode-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  background: rgba(0, 0, 0, 0.8);
  color: white;
}

.barcode-header .close-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  font-size: 20px;
}

.scanner-container {
  flex: 1;
  position: relative;
}

/* Рамка сканирования */
.scanner-container::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 280px;
  height: 100px;
  border: 3px solid #22c55e;
  border-radius: 8px;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
  animation: scan-pulse 1.5s ease-in-out infinite;
}

@keyframes scan-pulse {
  0%,
  100% {
    border-color: #22c55e;
  }
  50% {
    border-color: #4ade80;
  }
}

.product-preview-card {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: white;
  border-radius: 16px 16px 0 0;
  padding: 20px;
  animation: slide-up 0.3s ease-out;
}

@keyframes slide-up {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

.not-found {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: white;
  text-align: center;
  padding: 20px;
}
```

---

## 🔗 INTEGRATION POINTS

### 1. Добавление в SearchProductStep

```javascript
// В heys_day_v12.js → SearchProductStep
// Добавить кнопку сканера рядом с полем поиска

const SearchProductStep = ({ onSelect, onClose }) => {
  const [showScanner, setShowScanner] = React.useState(false);

  return React.createElement(
    'div',
    null,
    // Поле поиска + кнопка сканера
    React.createElement(
      'div',
      { className: 'search-header' },
      React.createElement('input', {
        type: 'text',
        placeholder: 'Поиск продукта...',
        // ...
      }),
      React.createElement(
        'button',
        {
          className: 'scan-btn',
          onClick: () => setShowScanner(true),
          title: 'Сканировать штрих-код',
        },
        '📷',
      ),
    ),

    // Overlay сканера
    showScanner &&
      React.createElement(BarcodeScannerOverlay, {
        isOpen: showScanner,
        onClose: () => setShowScanner(false),
        onProductFound: (product) => {
          if (product.create) {
            // Перейти к созданию с barcode
            openCreateProduct({ barcode: product.barcode });
          } else {
            // Выбрать найденный продукт
            onSelect(product);
          }
        },
      }),
  );
};
```

### 2. Сохранение barcode при создании продукта

```javascript
// В CreateProductStep — если пришёл barcode, прикрепить его
const CreateProductStep = ({ initialBarcode, onSave }) => {
  const [product, setProduct] = React.useState({
    name: '',
    kcal100: 0,
    // ...
    barcode: initialBarcode || null,
    barcodeSource: initialBarcode ? 'scan' : null,
  });

  // При сохранении — barcode сохраняется вместе с продуктом
};
```

### 3. Поиск по barcode в локальной базе

```javascript
// В heys_core_v12.js → ProductsManager
ProductsManager.findByBarcode = function (barcode) {
  const products = this.getAll();
  return products.find((p) => p.barcode === barcode);
};

// Использование в сканере:
const localProduct = HEYS.products.findByBarcode(scannedBarcode);
if (localProduct) {
  // Нашли в своей базе — не идём в Open Food Facts
  return localProduct;
}
```

---

## 📚 REFERENCES

1. **html5-qrcode**: https://github.com/mebjas/html5-qrcode
2. **Barcode Detection API**:
   https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API
3. **Open Food Facts API**: https://wiki.openfoodfacts.org/API
4. **getUserMedia API**:
   https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia

---

## ✅ SUCCESS CRITERIA

1. **Функционал**:
   - [ ] Сканирование EAN-13/EAN-8 работает на iOS и Android.
   - [ ] Продукт из Open Food Facts заполняет все поля КБЖУ.
   - [ ] Barcode сохраняется в продукте для повторного использования.

2. **UX**:
   - [ ] Время от нажатия до результата: <5 сек.
   - [ ] Понятный feedback при ошибках.
   - [ ] Работает в условиях плохого освещения (с фонариком).

3. **Надёжность**:
   - [ ] Graceful degradation при отсутствии камеры.
   - [ ] Offline режим с кэшированием.
   - [ ] Rate limiting для Open Food Facts API.
