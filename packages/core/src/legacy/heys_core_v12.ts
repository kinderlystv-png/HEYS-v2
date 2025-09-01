/*
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ 🗺️ НАВИГАЦИОННАЯ КАРТА ФАЙЛА heys_core_v12.ts (523 строки)                              │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ 📋 СТРУКТУРА ФАЙЛА:                                                                       │
│                                                                                           │
│ 📘 ТИПЫ И ИНТЕРФЕЙСЫ (строки 1-100):                                                     │
│    ├── Импорты и типы (3-4)                                                             │
│    ├── Global interface (6-12)                                                          │
│    ├── CoreUtils interface (14-22)                                                      │
│    ├── ParsedRow interface (24-29)                                                      │
│    ├── ProductDraft interface (31-42)                                                   │
│    └── Props interfaces (44-48)                                                         │
│                                                                                           │
│ 🛠️ ОСНОВНЫЕ УТИЛИТЫ (строки 101-200):                                                   │
│    ├── Константы и регулярные выражения (49-52)                                         │
│    ├── Базовые функции: round1, uuid, toNum (53-58)                                     │
│    ├── computeDerived() - производные расчеты (59-70)                                   │
│    ├── lsGet, lsSet - localStorage (71-85)                                              │
│    └── Текстовые утилиты (86-95)                                                        │
│                                                                                           │
│ 📄 ПАРСИНГ ДАННЫХ (строки 201-350):                                                      │
│    ├── isHeaderLine() - определение заголовков (96-100)                                 │
│    ├── normalizeLine() - нормализация строк (101-110)                                   │
│    ├── findTokenPositions() - поиск позиций (111-120)                                   │
│    ├── extractRow() - извлечение строки (121-140)                                       │
│    ├── Web Worker интеграция (141-180)                                                  │
│    └── parsePastedSync() - синхронный парсинг (181-200)                                 │
│                                                                                           │
│ 📊 УПРАВЛЕНИЕ ПРОДУКТАМИ (строки 351-450):                                               │
│    ├── getAllProducts() - получение списка (201-220)                                    │
│    ├── addProduct() - добавление продукта (221-250)                                     │
│    ├── saveProduct() - сохранение изменений (251-280)                                   │
│    ├── deleteProduct() - удаление (281-300)                                             │
│    └── searchProducts() - поиск и фильтрация (301-320)                                  │
│                                                                                           │
│ ⚛️ REACT КОМПОНЕНТ RationTab (строки 451-523):                                           │
│    ├── Класс и конструктор (321-340)                                                    │
│    ├── State management с типами (341-360)                                              │
│    ├── Event handlers с типизацией (361-420):                                           │
│    │   ├── handleAddProduct() (361-380)                                                 │
│    │   ├── handleEditProduct() (381-400)                                                │
│    │   ├── handleDeleteProduct() (401-410)                                              │
│    │   └── handlePasteData() (411-420)                                                  │
│    ├── Render методы (421-480):                                                          │
│    │   ├── renderProductForm() (421-450)                                                │
│    │   ├── renderProductList() (451-470)                                                │
│    │   └── renderPasteArea() (471-480)                                                  │
│    └── Main render() method (481-500)                                                    │
│                                                                                           │
│ 🔗 ЭКСПОРТ И ИНИЦИАЛИЗАЦИЯ (строки 501-523):                                             │
│    ├── TypeScript экспорты (501-515)                                                    │
│    ├── HEYS namespace расширение (516-520)                                              │
│    └── Утилиты экспорт (521-523)                                                        │
│                                                                                           │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ 🎯 БЫСТРЫЙ ПОИСК:                                                                        │
│    • Типы: CoreUtils (14), ProductDraft (31), RationTabProps (44)                      │
│    • Утилиты: computeDerived() (59), lsGet/lsSet (71-85)                               │
│    • Парсинг: extractRow() (121), parsePastedSync() (181)                              │
│    • React: RationTab class (321), render() (481)                                       │
└─────────────────────────────────────────────────────────────────────────────────────────┘
*/

// heys_core_v12.ts — ядро + вкладка «Рацион» (TypeScript version)

import React from 'react';
import type { HEYSGlobal, Product } from './types/heys';

// Declare global types for React UMD
declare global {
  interface Window {
    React: typeof React;
    HEYS: HEYSGlobal;
  }
}

// Core utilities interface
interface CoreUtils {
  lsGet: (key: string, def: any) => any;
  lsSet: (key: string, val: any) => void;
  toNum: (x: any) => number;
  toNumInput: (v: any) => number;
  round1: (v: number) => number;
  uuid: () => string;
  computeDerived: (p: Partial<Product>) => { carbs100: number; fat100: number; kcal100: number };
}

// Parsed product row interface
interface ParsedRow {
  readonly id: string;
  readonly name: string;
  readonly nums: readonly number[];
}

// Product draft for editing
interface ProductDraft {
  name: string;
  simple100: number;
  complex100: number;
  protein100: number;
  badFat100: number;
  goodFat100: number;
  trans100: number;
  fiber100: number;
  gi: number;
  harmScore: number;
}

// Props interfaces
interface RationTabProps {
  products: Product[];
  setProducts: (products: Product[]) => void;
}

interface ProductModalProps {
  show: boolean;
  onHide: () => void;
  draft: ProductDraft;
  setDraft: (draft: ProductDraft) => void;
  onSave: () => void;
  derived: { carbs100: number; fat100: number; kcal100: number };
}

interface ProductListProps {
  products: Product[];
  filteredProducts: Product[];
  onDelete: (id: string | number) => void;
  onEdit: (product: Product) => void;
}

interface ParseModalProps {
  show: boolean;
  onHide: () => void;
  paste: string;
  setPaste: (paste: string) => void;
  onParse: () => void;
}

// Module implementation
(function (global: Window & typeof globalThis): void {
  const HEYS = (global.HEYS = global.HEYS || ({} as HEYSGlobal));
  const React = global.React;
  const Store = HEYS.store || ({} as any);

  // ===== Utils =====
  const INVIS = /[\u00A0\u1680\u180E\u2000-\u200A\u200B-\u200F\u202F\u205F\u3000\uFEFF]/g;
  const NUM_RE = /[-+]?\d+(?:[\.,]\d+)?/g;

  const round1 = (v: number): number => Math.round(v * 10) / 10;
  const uuid = (): string => Math.random().toString(36).slice(2, 10);

  const toNum = (x: any): number => {
    if (x === undefined || x === null) return 0;
    if (typeof x === 'number') return x;
    const s = String(x).trim().replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  };

  const toNumInput = (v: any): number => {
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };

  function computeDerived(p: Partial<Product>): {
    carbs100: number;
    fat100: number;
    kcal100: number;
  } {
    const carbs100 = toNum(p.simple100) + toNum(p.complex100);
    const fat100 = toNum(p.badFat100) + toNum(p.goodFat100) + toNum(p.trans100);
    const kcal100 = 4 * (toNum(p.protein100) + carbs100) + 8 * fat100;
    return {
      carbs100: round1(carbs100),
      fat100: round1(fat100),
      kcal100: round1(kcal100),
    };
  }

  function lsGet(key: string, def: any): any {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : def;
    } catch (e) {
      return def;
    }
  }

  function lsSet(key: string, val: any): void {
    try {
      window.HEYS.saveClientKey(key, val);
    } catch (e) {
      // Silent fail
    }
  }

  function isHeaderLine(line: string): boolean {
    const l = line.toLowerCase();
    return (
      l.includes('название') &&
      (l.includes('ккал') || l.includes('калори') || l.includes('углевод'))
    );
  }

  function normalizeLine(raw: string): string {
    let s = raw.replace(INVIS, ' ');
    s = s
      .replace(/\u060C/g, ',')
      .replace(/\u066B/g, ',')
      .replace(/\u066C/g, ',')
      .replace(/\u201A/g, ',');
    s = s
      .replace(/\u00B7/g, '.')
      .replace(/[–—−]/g, '-')
      .replace(/%/g, '');
    s = s.replace(/\t+/g, ' ').replace(/\s+/g, ' ').trim();
    return s;
  }

  function findTokenPositions(s: string, tokens: string[]): (number | null)[] {
    const positions: (number | null)[] = [];
    let start = 0;
    for (const tok of tokens) {
      const idx = s.indexOf(tok, start);
      positions.push(idx === -1 ? null : idx);
      if (idx !== -1) start = idx + tok.length;
    }
    return positions;
  }

  function extractRow(raw: string): ParsedRow | null {
    const clean = normalizeLine(raw);
    const tokens = clean.match(NUM_RE) || [];
    if (!tokens.length) return null;

    let last = tokens.slice(-12);
    if (last.length < 12)
      last = Array(12 - last.length)
        .fill('0')
        .concat(last);

    const positions = findTokenPositions(clean, last);
    const firstPos = positions[0] ?? clean.length;
    const name = clean.slice(0, firstPos).trim() || 'Без названия';
    const nums = last.map(toNum);

    return { id: uuid(), name, nums };
  }

  // Web Worker proxy for heavy parsePasted
  let _parseWorker: Worker | null = null;

  function getParseWorker(): Worker {
    if (!_parseWorker) {
      _parseWorker = new Worker('parse_worker.js');
    }
    return _parseWorker;
  }

  function parsePasted(text: string): Promise<Product[]> {
    // fallback sync for environments without Worker
    if (typeof Worker === 'undefined') return Promise.resolve(parsePastedSync(text));

    return new Promise((resolve, reject) => {
      const worker = getParseWorker();
      const handler = (e: MessageEvent) => {
        worker.removeEventListener('message', handler);
        resolve(e.data.result && e.data.result.rows ? e.data.result.rows : []);
      };
      worker.addEventListener('message', handler);
      worker.postMessage({ text });
      setTimeout(() => {
        worker.removeEventListener('message', handler);
        reject(new Error('parse timeout'));
      }, 10000);
    });
  }

  // Синхронная версия (используется внутри воркера и как fallback)
  function parsePastedSync(text: string): Product[] {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !isHeaderLine(l));
    const rows: Product[] = [];

    for (const raw of lines) {
      const st = extractRow(raw);
      if (!st) continue;

      const [kcal, carbs, simple, complex, protein, fat, bad, good, trans, fiber, gi, harm] =
        st.nums;
      const base = {
        id: uuid(),
        name: st.name,
        simple100: simple,
        complex100: complex,
        protein100: protein,
        badFat100: bad,
        goodFat100: good,
        trans100: trans,
        fiber100: fiber,
        gi: gi,
        harmScore: harm,
      };
      const d = computeDerived(base);

      rows.push({
        ...base,
        carbs100: d.carbs100,
        fat100: d.fat100,
        kcal100: d.kcal100,
      } as Product);
    }
    return rows;
  }

  // React Components
  function RationTab(props: RationTabProps): React.ReactElement {
    const { setProducts } = props;
    const products = Array.isArray(props.products) ? props.products : [];

    // Сохранять продукты в облако и localStorage при каждом изменении
    React.useEffect(() => {
      // Не сохраняем пустой массив если это первичная инициализация и возможно есть данные в облаке
      if (products.length === 0) {
        // Проверяем, есть ли данные в localStorage или облаке
        const existingProducts =
          window.HEYS?.store?.get?.('heys_products', null) ||
          window.HEYS?.utils?.lsGet?.('heys_products', null);
        if (existingProducts && Array.isArray(existingProducts) && existingProducts.length > 0) {
          // Есть продукты в storage, не затираем их пустым массивом
          return;
        }
      }

      if (Array.isArray(products) && window.HEYS?.store?.set) {
        window.HEYS.store.set('heys_products', products);
      } else if (window.HEYS?.utils?.lsSet) {
        // fallback
        window.HEYS.utils.lsSet('heys_products', products);
      }
    }, [products]);

    const [query, setQuery] = React.useState('');
    const [paste, setPaste] = React.useState('');
    const [showModal, setShowModal] = React.useState(false);
    const [showParseModal, setShowParseModal] = React.useState(false);
    const [draft, setDraft] = React.useState<ProductDraft>({
      name: '',
      simple100: 0,
      complex100: 0,
      protein100: 0,
      badFat100: 0,
      goodFat100: 0,
      trans100: 0,
      fiber100: 0,
      gi: 0,
      harmScore: 0,
    });

    const derived = computeDerived(draft);

    // Оптимизированный поиск с индексацией
    const searchIndex = React.useMemo(() => {
      const index = new Map<string, number[]>();
      products.forEach((product, idx) => {
        const name = (product.name || '').toLowerCase();
        // Индексируем по первым буквам для быстрого поиска
        for (let i = 1; i <= Math.min(name.length, 3); i++) {
          const prefix = name.substring(0, i);
          if (!index.has(prefix)) index.set(prefix, []);
          index.get(prefix)!.push(idx);
        }
      });
      return index;
    }, [products]);

    const filteredProducts = React.useMemo(() => {
      if (!query.trim()) return products;
      const q = query.toLowerCase().trim();

      // Используем индекс для быстрого поиска
      const candidates = new Set<number>();
      for (let i = 1; i <= Math.min(q.length, 3); i++) {
        const prefix = q.substring(0, i);
        const indices = searchIndex.get(prefix);
        if (indices) {
          indices.forEach((idx) => candidates.add(idx));
        }
      }

      // Фильтруем кандидатов
      return Array.from(candidates)
        .map((idx) => products[idx])
        .filter((product) => product && product.name.toLowerCase().includes(q))
        .slice(0, 100); // Ограничиваем результаты
    }, [products, query, searchIndex]);

    const handleSave = (): void => {
      const newProduct: Product = {
        id: uuid(),
        name: draft.name || 'Новый продукт',
        simple100: draft.simple100,
        complex100: draft.complex100,
        protein100: draft.protein100,
        badFat100: draft.badFat100,
        goodFat100: draft.goodFat100,
        trans100: draft.trans100,
        fiber100: draft.fiber100,
        gi: draft.gi,
        harmScore: draft.harmScore,
        carbs100: derived.carbs100,
        fat100: derived.fat100,
        kcal100: derived.kcal100,
      };

      setProducts([...products, newProduct]);
      setShowModal(false);
      setDraft({
        name: '',
        simple100: 0,
        complex100: 0,
        protein100: 0,
        badFat100: 0,
        goodFat100: 0,
        trans100: 0,
        fiber100: 0,
        gi: 0,
        harmScore: 0,
      });
    };

    const handleDelete = (id: string | number): void => {
      setProducts(products.filter((p) => p.id !== id));
    };

    const handleEdit = (product: Product): void => {
      setDraft({
        name: product.name,
        simple100: product.simple100,
        complex100: product.complex100,
        protein100: product.protein100,
        badFat100: product.badFat100,
        goodFat100: product.goodFat100,
        trans100: product.trans100,
        fiber100: product.fiber100,
        gi: product.gi || 0,
        harmScore: product.harmScore || 0,
      });
      setShowModal(true);
    };

    const handleParse = async (): Promise<void> => {
      try {
        const parsed = await parsePasted(paste);
        setProducts([...products, ...parsed]);
        setShowParseModal(false);
        setPaste('');
      } catch (error) {
        console.error('Parse error:', error);
      }
    };

    return React.createElement(
      'div',
      { className: 'ration-tab' },
      React.createElement(
        'div',
        { className: 'ration-controls' },
        React.createElement('input', {
          type: 'text',
          placeholder: 'Поиск продуктов...',
          value: query,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value),
          className: 'search-input',
        }),
        React.createElement(
          'button',
          {
            onClick: () => setShowModal(true),
            className: 'btn btn-primary',
          },
          'Добавить продукт',
        ),
        React.createElement(
          'button',
          {
            onClick: () => setShowParseModal(true),
            className: 'btn btn-secondary',
          },
          'Импорт из таблицы',
        ),
      ),
      React.createElement(ProductList, {
        products,
        filteredProducts,
        onDelete: handleDelete,
        onEdit: handleEdit,
      }),
      React.createElement(ProductModal, {
        show: showModal,
        onHide: () => setShowModal(false),
        draft,
        setDraft,
        onSave: handleSave,
        derived,
      }),
      React.createElement(ParseModal, {
        show: showParseModal,
        onHide: () => setShowParseModal(false),
        paste,
        setPaste,
        onParse: handleParse,
      }),
    );
  }

  // Additional component implementations would go here...
  function ProductList(props: ProductListProps): React.ReactElement {
    const { filteredProducts, onDelete, onEdit } = props;

    return React.createElement(
      'div',
      { className: 'product-list' },
      filteredProducts.map((product) =>
        React.createElement(
          'div',
          { key: product.id, className: 'product-item' },
          React.createElement('span', { className: 'product-name' }, product.name),
          React.createElement(
            'span',
            { className: 'product-kcal' },
            `${product.kcal100 || 0} ккал`,
          ),
          React.createElement(
            'button',
            {
              onClick: () => onEdit(product),
              className: 'btn btn-sm btn-outline',
            },
            'Редактировать',
          ),
          React.createElement(
            'button',
            {
              onClick: () => onDelete(product.id),
              className: 'btn btn-sm btn-danger',
            },
            'Удалить',
          ),
        ),
      ),
    );
  }

  function ProductModal(props: ProductModalProps): React.ReactElement | null {
    const { show, onHide, draft, setDraft, onSave, derived } = props;

    if (!show) return null;

    return React.createElement(
      'div',
      { className: 'modal' },
      React.createElement(
        'div',
        { className: 'modal-content' },
        React.createElement('h3', null, 'Продукт'),
        React.createElement('input', {
          type: 'text',
          placeholder: 'Название',
          value: draft.name,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
            setDraft({ ...draft, name: e.target.value }),
        }),
        React.createElement(
          'div',
          { className: 'nutrition-grid' },
          [
            'simple100',
            'complex100',
            'protein100',
            'badFat100',
            'goodFat100',
            'trans100',
            'fiber100',
            'gi',
            'harmScore',
          ].map((field) =>
            React.createElement('input', {
              key: field,
              type: 'number',
              placeholder: field,
              value: (draft as any)[field],
              onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                setDraft({ ...draft, [field]: toNumInput(e.target.value) }),
            }),
          ),
        ),
        React.createElement(
          'div',
          { className: 'derived-info' },
          `Углеводы: ${derived.carbs100}г, Жиры: ${derived.fat100}г, Ккал: ${derived.kcal100}`,
        ),
        React.createElement(
          'div',
          { className: 'modal-actions' },
          React.createElement('button', { onClick: onSave }, 'Сохранить'),
          React.createElement('button', { onClick: onHide }, 'Отмена'),
        ),
      ),
    );
  }

  function ParseModal(props: ParseModalProps): React.ReactElement | null {
    const { show, onHide, paste, setPaste, onParse } = props;

    if (!show) return null;

    return React.createElement(
      'div',
      { className: 'modal' },
      React.createElement(
        'div',
        { className: 'modal-content' },
        React.createElement('h3', null, 'Импорт продуктов'),
        React.createElement('textarea', {
          placeholder: 'Вставьте данные таблицы...',
          value: paste,
          onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => setPaste(e.target.value),
          rows: 10,
        }),
        React.createElement(
          'div',
          { className: 'modal-actions' },
          React.createElement('button', { onClick: onParse }, 'Импорт'),
          React.createElement('button', { onClick: onHide }, 'Отмена'),
        ),
      ),
    );
  }

  // Export to HEYS namespace
  const utils = {
    lsGet,
    lsSet,
    toNum,
    toNumInput,
    round1,
    uuid,
    computeDerived,
    INVIS,
    NUM_RE,
    parsePasted,
  };

  // Ensure utils exists and extend it
  HEYS.utils = Object.assign(HEYS.utils || {}, utils);

  // Add core functionality (extend HEYS with core property)
  (HEYS as any).core = { RationTab, parsePasted, parsePastedSync };
})(window);
