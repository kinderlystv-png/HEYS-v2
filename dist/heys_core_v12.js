// heys_core_v12.ts — ядро + вкладка «Рацион» (TypeScript version)
// Module implementation
(function (global) {
    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;
    const Store = HEYS.store || {};
    // ===== Utils =====
    const INVIS = /[\u00A0\u1680\u180E\u2000-\u200A\u200B-\u200F\u202F\u205F\u3000\uFEFF]/g;
    const NUM_RE = /[-+]?\d+(?:[\.,]\d+)?/g;
    const round1 = (v) => Math.round(v * 10) / 10;
    const uuid = () => Math.random().toString(36).slice(2, 10);
    const toNum = (x) => {
        if (x === undefined || x === null)
            return 0;
        if (typeof x === 'number')
            return x;
        const s = String(x).trim().replace(',', '.');
        const n = Number(s);
        return Number.isFinite(n) ? n : 0;
    };
    const toNumInput = (v) => {
        const n = Number(String(v).replace(',', '.'));
        return Number.isFinite(n) ? n : 0;
    };
    function computeDerived(p) {
        const carbs100 = toNum(p.simple100) + toNum(p.complex100);
        const fat100 = toNum(p.badFat100) + toNum(p.goodFat100) + toNum(p.trans100);
        const kcal100 = 4 * (toNum(p.protein100) + carbs100) + 8 * fat100;
        return {
            carbs100: round1(carbs100),
            fat100: round1(fat100),
            kcal100: round1(kcal100)
        };
    }
    function lsGet(key, def) {
        try {
            const v = localStorage.getItem(key);
            return v ? JSON.parse(v) : def;
        }
        catch (e) {
            return def;
        }
    }
    function lsSet(key, val) {
        try {
            window.HEYS.saveClientKey(key, val);
        }
        catch (e) {
            // Silent fail
        }
    }
    function isHeaderLine(line) {
        const l = line.toLowerCase();
        return l.includes('название') && (l.includes('ккал') || l.includes('калори') || l.includes('углевод'));
    }
    function normalizeLine(raw) {
        let s = raw.replace(INVIS, ' ');
        s = s.replace(/\u060C/g, ',').replace(/\u066B/g, ',').replace(/\u066C/g, ',').replace(/\u201A/g, ',');
        s = s.replace(/\u00B7/g, '.').replace(/[–—−]/g, '-').replace(/%/g, '');
        s = s.replace(/\t+/g, ' ').replace(/\s+/g, ' ').trim();
        return s;
    }
    function findTokenPositions(s, tokens) {
        const positions = [];
        let start = 0;
        for (const tok of tokens) {
            const idx = s.indexOf(tok, start);
            positions.push(idx === -1 ? null : idx);
            if (idx !== -1)
                start = idx + tok.length;
        }
        return positions;
    }
    function extractRow(raw) {
        const clean = normalizeLine(raw);
        const tokens = clean.match(NUM_RE) || [];
        if (!tokens.length)
            return null;
        let last = tokens.slice(-12);
        if (last.length < 12)
            last = Array(12 - last.length).fill('0').concat(last);
        const positions = findTokenPositions(clean, last);
        const firstPos = positions[0] ?? clean.length;
        const name = clean.slice(0, firstPos).trim() || 'Без названия';
        const nums = last.map(toNum);
        return { id: uuid(), name, nums };
    }
    // Web Worker proxy for heavy parsePasted
    let _parseWorker = null;
    function getParseWorker() {
        if (!_parseWorker) {
            _parseWorker = new Worker('parse_worker.js');
        }
        return _parseWorker;
    }
    function parsePasted(text) {
        // fallback sync for environments without Worker
        if (typeof Worker === 'undefined')
            return Promise.resolve(parsePastedSync(text));
        return new Promise((resolve, reject) => {
            const worker = getParseWorker();
            const handler = (e) => {
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
    function parsePastedSync(text) {
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0 && !isHeaderLine(l));
        const rows = [];
        for (const raw of lines) {
            const st = extractRow(raw);
            if (!st)
                continue;
            const [kcal, carbs, simple, complex, protein, fat, bad, good, trans, fiber, gi, harm] = st.nums;
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
                harmScore: harm
            };
            const d = computeDerived(base);
            rows.push({
                ...base,
                carbs100: d.carbs100,
                fat100: d.fat100,
                kcal100: d.kcal100
            });
        }
        return rows;
    }
    // React Components
    function RationTab(props) {
        const { setProducts } = props;
        const products = Array.isArray(props.products) ? props.products : [];
        // Сохранять продукты в облако и localStorage при каждом изменении
        React.useEffect(() => {
            // Не сохраняем пустой массив если это первичная инициализация и возможно есть данные в облаке
            if (products.length === 0) {
                // Проверяем, есть ли данные в localStorage или облаке
                const existingProducts = (window.HEYS?.store?.get?.('heys_products', null)) ||
                    (window.HEYS?.utils?.lsGet?.('heys_products', null));
                if (existingProducts && Array.isArray(existingProducts) && existingProducts.length > 0) {
                    // Есть продукты в storage, не затираем их пустым массивом
                    return;
                }
            }
            if (Array.isArray(products) && window.HEYS?.store?.set) {
                window.HEYS.store.set('heys_products', products);
            }
            else if (window.HEYS?.utils?.lsSet) {
                // fallback
                window.HEYS.utils.lsSet('heys_products', products);
            }
        }, [products]);
        const [query, setQuery] = React.useState('');
        const [paste, setPaste] = React.useState('');
        const [showModal, setShowModal] = React.useState(false);
        const [showParseModal, setShowParseModal] = React.useState(false);
        const [draft, setDraft] = React.useState({
            name: '',
            simple100: 0,
            complex100: 0,
            protein100: 0,
            badFat100: 0,
            goodFat100: 0,
            trans100: 0,
            fiber100: 0,
            gi: 0,
            harmScore: 0
        });
        const derived = computeDerived(draft);
        // Оптимизированный поиск с индексацией
        const searchIndex = React.useMemo(() => {
            const index = new Map();
            products.forEach((product, idx) => {
                const name = (product.name || '').toLowerCase();
                // Индексируем по первым буквам для быстрого поиска
                for (let i = 1; i <= Math.min(name.length, 3); i++) {
                    const prefix = name.substring(0, i);
                    if (!index.has(prefix))
                        index.set(prefix, []);
                    index.get(prefix).push(idx);
                }
            });
            return index;
        }, [products]);
        const filteredProducts = React.useMemo(() => {
            if (!query.trim())
                return products;
            const q = query.toLowerCase().trim();
            // Используем индекс для быстрого поиска
            const candidates = new Set();
            for (let i = 1; i <= Math.min(q.length, 3); i++) {
                const prefix = q.substring(0, i);
                const indices = searchIndex.get(prefix);
                if (indices) {
                    indices.forEach(idx => candidates.add(idx));
                }
            }
            // Фильтруем кандидатов
            return Array.from(candidates)
                .map(idx => products[idx])
                .filter(product => product && product.name.toLowerCase().includes(q))
                .slice(0, 100); // Ограничиваем результаты
        }, [products, query, searchIndex]);
        const handleSave = () => {
            const newProduct = {
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
                kcal100: derived.kcal100
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
                harmScore: 0
            });
        };
        const handleDelete = (id) => {
            setProducts(products.filter(p => p.id !== id));
        };
        const handleEdit = (product) => {
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
                harmScore: product.harmScore || 0
            });
            setShowModal(true);
        };
        const handleParse = async () => {
            try {
                const parsed = await parsePasted(paste);
                setProducts([...products, ...parsed]);
                setShowParseModal(false);
                setPaste('');
            }
            catch (error) {
                console.error('Parse error:', error);
            }
        };
        return React.createElement('div', { className: 'ration-tab' }, React.createElement('div', { className: 'ration-controls' }, React.createElement('input', {
            type: 'text',
            placeholder: 'Поиск продуктов...',
            value: query,
            onChange: (e) => setQuery(e.target.value),
            className: 'search-input'
        }), React.createElement('button', {
            onClick: () => setShowModal(true),
            className: 'btn btn-primary'
        }, 'Добавить продукт'), React.createElement('button', {
            onClick: () => setShowParseModal(true),
            className: 'btn btn-secondary'
        }, 'Импорт из таблицы')), React.createElement(ProductList, {
            products,
            filteredProducts,
            onDelete: handleDelete,
            onEdit: handleEdit
        }), React.createElement(ProductModal, {
            show: showModal,
            onHide: () => setShowModal(false),
            draft,
            setDraft,
            onSave: handleSave,
            derived
        }), React.createElement(ParseModal, {
            show: showParseModal,
            onHide: () => setShowParseModal(false),
            paste,
            setPaste,
            onParse: handleParse
        }));
    }
    // Additional component implementations would go here...
    function ProductList(props) {
        const { filteredProducts, onDelete, onEdit } = props;
        return React.createElement('div', { className: 'product-list' }, filteredProducts.map(product => React.createElement('div', { key: product.id, className: 'product-item' }, React.createElement('span', { className: 'product-name' }, product.name), React.createElement('span', { className: 'product-kcal' }, `${product.kcal100 || 0} ккал`), React.createElement('button', {
            onClick: () => onEdit(product),
            className: 'btn btn-sm btn-outline'
        }, 'Редактировать'), React.createElement('button', {
            onClick: () => onDelete(product.id),
            className: 'btn btn-sm btn-danger'
        }, 'Удалить'))));
    }
    function ProductModal(props) {
        const { show, onHide, draft, setDraft, onSave, derived } = props;
        if (!show)
            return null;
        return React.createElement('div', { className: 'modal' }, React.createElement('div', { className: 'modal-content' }, React.createElement('h3', null, 'Продукт'), React.createElement('input', {
            type: 'text',
            placeholder: 'Название',
            value: draft.name,
            onChange: (e) => setDraft({ ...draft, name: e.target.value })
        }), React.createElement('div', { className: 'nutrition-grid' }, ['simple100', 'complex100', 'protein100', 'badFat100', 'goodFat100', 'trans100', 'fiber100', 'gi', 'harmScore'].map(field => React.createElement('input', {
            key: field,
            type: 'number',
            placeholder: field,
            value: draft[field],
            onChange: (e) => setDraft({ ...draft, [field]: toNumInput(e.target.value) })
        }))), React.createElement('div', { className: 'derived-info' }, `Углеводы: ${derived.carbs100}г, Жиры: ${derived.fat100}г, Ккал: ${derived.kcal100}`), React.createElement('div', { className: 'modal-actions' }, React.createElement('button', { onClick: onSave }, 'Сохранить'), React.createElement('button', { onClick: onHide }, 'Отмена'))));
    }
    function ParseModal(props) {
        const { show, onHide, paste, setPaste, onParse } = props;
        if (!show)
            return null;
        return React.createElement('div', { className: 'modal' }, React.createElement('div', { className: 'modal-content' }, React.createElement('h3', null, 'Импорт продуктов'), React.createElement('textarea', {
            placeholder: 'Вставьте данные таблицы...',
            value: paste,
            onChange: (e) => setPaste(e.target.value),
            rows: 10
        }), React.createElement('div', { className: 'modal-actions' }, React.createElement('button', { onClick: onParse }, 'Импорт'), React.createElement('button', { onClick: onHide }, 'Отмена'))));
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
        parsePasted
    };
    // Ensure utils exists and extend it
    HEYS.utils = Object.assign(HEYS.utils || {}, utils);
    // Add core functionality (extend HEYS with core property)
    HEYS.core = { RationTab, parsePasted, parsePastedSync };
})(window);
export {};
//# sourceMappingURL=heys_core_v12.js.map