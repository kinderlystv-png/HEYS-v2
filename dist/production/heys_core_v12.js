// heys_core_v12.js — ядро + вкладка «Рацион»
(function(global){
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  const Store = (HEYS.store)||(HEYS.store={});

  // ===== Utils =====
  const INVIS = /[\u00A0\u1680\u180E\u2000-\u200A\u200B-\u200F\u202F\u205F\u3000\uFEFF]/g;
  const NUM_RE = /[-+]?\d+(?:[\.,]\d+)?/g;
  const round1 = (v) => Math.round(v * 10) / 10;
  const uuid = () => Math.random().toString(36).slice(2,10);
  const toNum = (x) => { if (x===undefined || x===null) return 0; if (typeof x === 'number') return x; const s = String(x).trim().replace(',', '.'); const n = Number(s); return Number.isFinite(n) ? n : 0; };
  const toNumInput = (v)=>{ const n = Number(String(v).replace(',', '.')); return Number.isFinite(n)?n:0; };
  function computeDerived(p){ const carbs100 = toNum(p.simple100) + toNum(p.complex100); const fat100 = toNum(p.badFat100) + toNum(p.goodFat100) + toNum(p.trans100); const kcal100 = 4*(toNum(p.protein100) + carbs100) + 8*fat100; return { carbs100: round1(carbs100), fat100: round1(fat100), kcal100: round1(kcal100) }; }
  function lsGet(key, def){ try{ const v = localStorage.getItem(key); return v? JSON.parse(v): def; }catch(e){ return def; } }
  function lsSet(key, val){ 
    try{ 
      console.log('[lsSet] Saving to localStorage:', key, val);
      localStorage.setItem(key, JSON.stringify(val)); 
      console.log('[lsSet] Saving to cloud:', key);
      window.HEYS.saveClientKey(key, val); 
    }catch(e){
      console.error('[lsSet] Error saving:', key, e);
    } 
  }

  function isHeaderLine(line){ const l=line.toLowerCase(); return l.includes('название') && (l.includes('ккал') || l.includes('калори') || l.includes('углевод')); }
  function normalizeLine(raw){ let s = raw.replace(INVIS,' '); s = s.replace(/\u060C/g, ',').replace(/\u066B/g, ',').replace(/\u066C/g, ',').replace(/\u201A/g, ','); s = s.replace(/\u00B7/g, '.').replace(/[–—−]/g, '-').replace(/%/g, ''); s = s.replace(/\t+/g, ' ').replace(/\s+/g, ' ').trim(); return s; }
  function findTokenPositions(s, tokens){ const positions=[]; let start=0; for(const tok of tokens){ const idx=s.indexOf(tok, start); positions.push(idx===-1?null:idx); if(idx!==-1) start=idx+tok.length; } return positions; }
  function extractRow(raw){ const clean = normalizeLine(raw); const tokens = clean.match(NUM_RE) || []; if (!tokens.length) return null; let last = tokens.slice(-12); if (last.length<12) last = Array(12-last.length).fill('0').concat(last); const positions = findTokenPositions(clean, last); const firstPos = positions[0] ?? clean.length; const name = clean.slice(0, firstPos).trim() || 'Без названия'; const nums = last.map(toNum); return { name, nums }; }
  // --- Web Worker proxy for heavy parsePasted ---
  let _parseWorker = null;
  function getParseWorker() {
    if (!_parseWorker) {
      _parseWorker = new Worker('parse_worker.js');
    }
    return _parseWorker;
  }
  function parsePasted(text) {
    // fallback sync for environments without Worker
    if (typeof Worker === 'undefined') return parsePastedSync(text);
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
  function parsePastedSync(text){
    const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(l=>l.length>0 && !isHeaderLine(l));
    const rows=[];
    for(const raw of lines){
      const st = extractRow(raw); if(!st) continue;
      const [kcal, carbs, simple, complex, protein, fat, bad, good, trans, fiber, gi, harm] = st.nums;
      const base = { id: uuid(), name: st.name, simple100:simple, complex100:complex, protein100:protein, badFat100:bad, goodFat100:good, trans100:trans, fiber100:fiber, gi:gi, harmScore:harm };
      const d = computeDerived(base);
      rows.push({ id: base.id, name: base.name, ...base, carbs100: d.carbs100, fat100: d.fat100, kcal100: d.kcal100 });
    }
    return rows;
  }

    function RationTab(props){
      const { setProducts } = props;
      const products = Array.isArray(props.products) ? props.products : [];

      // Сохранять продукты в облако и localStorage при каждом изменении (через HEYS.utils для namespace)
      React.useEffect(() => {
        // Не сохраняем пустой массив если это первичная инициализация и возможно есть данные в облаке
        if (products.length === 0) {
          // Проверяем, есть ли данные в localStorage или облаке
          const existingProducts = (window.HEYS && window.HEYS.store && window.HEYS.store.get && window.HEYS.store.get('heys_products', null)) || 
                                  (window.HEYS && window.HEYS.utils && window.HEYS.utils.lsGet && window.HEYS.utils.lsGet('heys_products', null));
          if (existingProducts && Array.isArray(existingProducts) && existingProducts.length > 0) {
            // Есть продукты в storage, не затираем их пустым массивом
            return;
          }
        }
        
        if (Array.isArray(products) && window.HEYS && window.HEYS.store && typeof window.HEYS.store.set === 'function') {
          window.HEYS.store.set('heys_products', products);
        } else if (window.HEYS && window.HEYS.utils && typeof window.HEYS.utils.lsSet==='function') {
          // fallback
          window.HEYS.utils.lsSet('heys_products', products);
        }
      }, [products]);
      const [query, setQuery] = React.useState('');
      const [paste, setPaste] = React.useState('');
      const [showModal, setShowModal] = React.useState(false);
      const [draft, setDraft] = React.useState({ name:'', simple100:0, complex100:0, protein100:0, badFat100:0, goodFat100:0, trans100:0, fiber100:0, gi:0, harmScore:0 });
      const derived = computeDerived(draft);
      
      // Оптимизированный поиск с индексацией
      const searchIndex = React.useMemo(() => {
        const index = new Map();
        products.forEach((product, idx) => {
          const name = (product.name || '').toLowerCase();
          // Индексируем по первым буквам для быстрого поиска
          for (let i = 1; i <= Math.min(name.length, 3); i++) {
            const prefix = name.substring(0, i);
            if (!index.has(prefix)) index.set(prefix, []);
            index.get(prefix).push(idx);
          }
          // Индексируем по словам
          name.split(/\s+/).forEach(word => {
            if (word.length > 0) {
              if (!index.has(word)) index.set(word, []);
              index.get(word).push(idx);
            }
          });
        });
        return index;
      }, [products]);
      
      const filtered = React.useMemo(() => {
        const startTime = performance.now();
        const result = performSearch();
        const duration = performance.now() - startTime;
        
        // Трекинг поиска
        if (window.HEYS && window.HEYS.analytics) {
          window.HEYS.analytics.trackSearch(query, result.length, duration);
        }
        
        return result;
          
        function performSearch() {
          const q = query.trim().toLowerCase();
          if (!q) return products;
          
          if (q.length <= 3) {
            // Для коротких запросов используем индекс
            const indices = searchIndex.get(q) || [];
            if (indices.length > 0) {
              if (window.HEYS && window.HEYS.analytics) {
                window.HEYS.analytics.trackDataOperation('cache-hit');
              }
              return indices.map(idx => products[idx]);
            } else {
              if (window.HEYS && window.HEYS.analytics) {
                window.HEYS.analytics.trackDataOperation('cache-miss');
              }
              return products.filter(p => (p.name || '').toLowerCase().includes(q));
            }
          } else {
            // Для длинных запросов - комбинированный подход
            const candidateIndices = new Set();
            
            // Ищем по префиксам и словам
            for (const [key, indices] of searchIndex.entries()) {
              if (key.includes(q) || q.includes(key)) {
                indices.forEach(idx => candidateIndices.add(idx));
              }
            }
            
            // Если нашли кандидатов через индекс, фильтруем их
            if (candidateIndices.size > 0) {
              if (window.HEYS && window.HEYS.analytics) {
                window.HEYS.analytics.trackDataOperation('cache-hit');
              }
              const candidates = Array.from(candidateIndices).map(idx => products[idx]);
              return candidates.filter(p => (p.name || '').toLowerCase().includes(q));
            }
            
            // Fallback к обычному поиску
            if (window.HEYS && window.HEYS.analytics) {
              window.HEYS.analytics.trackDataOperation('cache-miss');
            }
            return products.filter(p => (p.name || '').toLowerCase().includes(q));
          }
        }
      }, [products, query, searchIndex]);

      // Подгружать продукты из облака при смене клиента
      React.useEffect(()=>{
        const clientId = window.HEYS && window.HEYS.currentClientId;
        const cloud = window.HEYS && window.HEYS.cloud;
        if (clientId && cloud && typeof cloud.bootstrapClientSync === 'function') {
          const startTime = performance.now();
          const need = (typeof cloud.shouldSyncClient==='function') ? cloud.shouldSyncClient(clientId, 4000) : true;
          if (need){
            cloud.bootstrapClientSync(clientId).then(()=>{
              const duration = performance.now() - startTime;
              if (window.HEYS && window.HEYS.analytics) {
                window.HEYS.analytics.trackApiCall('bootstrapClientSync', duration, true);
                window.HEYS.analytics.trackDataOperation('cloud-sync');
              }
              const latest = (window.HEYS.store && window.HEYS.store.get && window.HEYS.store.get('heys_products', null)) || (window.HEYS.utils && window.HEYS.utils.lsGet && window.HEYS.utils.lsGet('heys_products', [])) || [];
              if (Array.isArray(latest) && latest.length > 0) {
                if (window.HEYS && window.HEYS.analytics) {
                  window.HEYS.analytics.trackDataOperation('products-loaded', latest.length);
                }
              }
              setProducts(Array.isArray(latest)?latest:[]);
            }).catch((error) => {
              const duration = performance.now() - startTime;
              if (window.HEYS && window.HEYS.analytics) {
                window.HEYS.analytics.trackApiCall('bootstrapClientSync', duration, false);
              }
              console.error('Bootstrap client sync failed:', error);
            });
          } else {
            const latest = (window.HEYS.store && window.HEYS.store.get && window.HEYS.store.get('heys_products', null)) || (window.HEYS.utils && window.HEYS.utils.lsGet && window.HEYS.utils.lsGet('heys_products', [])) || [];
            if (Array.isArray(latest) && latest.length > 0) {
              if (window.HEYS && window.HEYS.analytics) {
                window.HEYS.analytics.trackDataOperation('products-loaded', latest.length);
              }
            }
            setProducts(Array.isArray(latest)?latest:[]);
          }
        } else {
          const latest = (window.HEYS.store && window.HEYS.store.get && window.HEYS.store.get('heys_products', null)) || (window.HEYS.utils && window.HEYS.utils.lsGet && window.HEYS.utils.lsGet('heys_products', [])) || [];
          setProducts(Array.isArray(latest)?latest:[]);
        }
      }, [window.HEYS && window.HEYS.currentClientId]);

    function resetDraft(){ setDraft({name:'', simple100:0, complex100:0, protein100:0, badFat100:0, goodFat100:0, trans100:0, fiber100:0, gi:0, harmScore:0}); }
    function addProduct(){ 
      const base = { id: uuid(), name: draft.name || 'Без названия', simple100: toNum(draft.simple100), complex100: toNum(draft.complex100), protein100: toNum(draft.protein100), badFat100: toNum(draft.badFat100), goodFat100: toNum(draft.goodFat100), trans100: toNum(draft.trans100), fiber100: toNum(draft.fiber100), gi: toNum(draft.gi), harmScore: toNum(draft.harmScore) }; 
      const d = computeDerived(base); 
      setProducts([...products, { ...base, ...d }]); 
      if (window.HEYS && window.HEYS.analytics) {
        window.HEYS.analytics.trackDataOperation('products-loaded', 1);
      }
      resetDraft(); 
      setShowModal(false); 
    }
    function updateRow(id, patch){ 
      setProducts(products.map(p=>{ if(p.id !== id) return p; const changed = { ...p, ...patch }; const d = computeDerived(changed); return { ...changed, ...d }; })); 
      if (window.HEYS && window.HEYS.analytics) {
        window.HEYS.analytics.trackDataOperation('storage-op');
      }
    }
    function deleteRow(id){ 
      setProducts(products.filter(p=>p.id!==id)); 
      if (window.HEYS && window.HEYS.analytics) {
        window.HEYS.analytics.trackDataOperation('storage-op');
      }
    }
    async function importAppend(){
      const startTime = performance.now();
      let rows = [];
      try {
        rows = await parsePasted(paste);
        const duration = performance.now() - startTime;
        if (window.HEYS && window.HEYS.analytics) {
          window.HEYS.analytics.trackApiCall('parsePasted', duration, true);
        }
      } catch(e) { 
        const duration = performance.now() - startTime;
        if (window.HEYS && window.HEYS.analytics) {
          window.HEYS.analytics.trackApiCall('parsePasted', duration, false);
        }
        alert('Ошибка парсинга: '+e.message); 
        return; 
      }
      if(!rows.length){ alert('Не удалось распознать данные'); return; }
      setProducts([...products, ...rows]);
      if (window.HEYS && window.HEYS.analytics) {
        window.HEYS.analytics.trackDataOperation('products-loaded', rows.length);
      }
    }
    async function importReplace(){
      const startTime = performance.now();
      let rows = [];
      try {
        rows = await parsePasted(paste);
        const duration = performance.now() - startTime;
        if (window.HEYS && window.HEYS.analytics) {
          window.HEYS.analytics.trackApiCall('parsePasted', duration, true);
        }
      } catch(e) { 
        const duration = performance.now() - startTime;
        if (window.HEYS && window.HEYS.analytics) {
          window.HEYS.analytics.trackApiCall('parsePasted', duration, false);
        }
        alert('Ошибка парсинга: '+e.message); 
        return; 
      }
      if(!rows.length){ alert('Не удалось распознать данные'); return; }
      setProducts(rows);
      if (window.HEYS && window.HEYS.analytics) {
        window.HEYS.analytics.trackDataOperation('products-loaded', rows.length);
      }
    }

    return React.createElement('div', {className:'page page-ration'},
      React.createElement('div', {className:'card tone-amber', style:{marginBottom:'8px'}},
        React.createElement('div', {className:'section-title'}, 'Импорт из вставки'),
        React.createElement('textarea', {placeholder:'Вставь строки: Название + 12 чисел справа', value:paste, onChange:e=>setPaste(e.target.value)}),
        React.createElement('div', {className:'row', style:{marginTop:'8px'}},
          React.createElement('button', {className:'btn acc', onClick:importAppend}, 'Импортировать (добавить)'),
          React.createElement('button', {className:'btn', onClick:importReplace}, 'Импортировать (заменить)'),
          React.createElement('span', {className:'muted'}, 'Запятые допустимы. Если чисел меньше 12 — недостающие = 0.')
        )
      ),
      React.createElement('div', {className:'card tone-blue'},
        React.createElement('div', {className:'topbar'},
          React.createElement('div', {className:'row'},
            React.createElement('input', {placeholder:'Поиск по названию…', value:query, onChange:e=>setQuery(e.target.value), style:{minWidth:'260px'}}),
            React.createElement('span', {className:'muted'}, `Найдено: ${filtered.length} из ${products.length}`)
          ),
          React.createElement('div', {className:'row'},
            React.createElement('button', {className:'btn acc', onClick:()=>setShowModal(true)}, '+ Добавить продукт')
          )
        ),
        React.createElement('div', {style:{overflowX:'auto'}},
          React.createElement('table', null,
            React.createElement('thead', null,
              React.createElement('tr', null,
                React.createElement('th', null, 'Название'),
                React.createElement('th', null, 'Ккал (100г)'),
                React.createElement('th', null, 'Углеводы'),
                React.createElement('th', null, 'Простые'),
                React.createElement('th', null, 'Сложные'),
                React.createElement('th', null, 'Белки'),
                React.createElement('th', null, 'Жиры'),
                React.createElement('th', null, 'Вредные'),
                React.createElement('th', null, 'Полезные'),
                React.createElement('th', null, 'Супервредные'),
                React.createElement('th', null, 'Клетчатка'),
                React.createElement('th', null, 'ГИ'),
                React.createElement('th', null, 'Вредность'),
                React.createElement('th', null, '')
              )
            ),
            React.createElement('tbody', null,
              filtered.map(p=> React.createElement('tr', {key:p.id},
                React.createElement('td', null, React.createElement('input', {value:p.name, onChange:e=>updateRow(p.id, {name:e.target.value})})),
                React.createElement('td', null, React.createElement('input', {className:'readOnly', value:p.kcal100, readOnly:true})),
                React.createElement('td', null, React.createElement('input', {className:'readOnly', value:p.carbs100, readOnly:true})),
                React.createElement('td', null, React.createElement('input', {type:'text', value:p.simple100, onChange:e=>updateRow(p.id, {simple100:toNum(e.target.value)})})),
                React.createElement('td', null, React.createElement('input', {type:'text', value:p.complex100, onChange:e=>updateRow(p.id, {complex100:toNum(e.target.value)})})),
                React.createElement('td', null, React.createElement('input', {type:'text', value:p.protein100, onChange:e=>updateRow(p.id, {protein100:toNum(e.target.value)})})),
                React.createElement('td', null, React.createElement('input', {className:'readOnly', value:p.fat100, readOnly:true})),
                React.createElement('td', null, React.createElement('input', {type:'text', value:p.badFat100, onChange:e=>updateRow(p.id, {badFat100:toNum(e.target.value)})})),
                React.createElement('td', null, React.createElement('input', {type:'text', value:p.goodFat100, onChange:e=>updateRow(p.id, {goodFat100:toNum(e.target.value)})})),
                React.createElement('td', null, React.createElement('input', {type:'text', value:p.trans100, onChange:e=>updateRow(p.id, {trans100:toNum(e.target.value)})})),
                React.createElement('td', null, React.createElement('input', {type:'text', value:p.fiber100, onChange:e=>updateRow(p.id, {fiber100:toNum(e.target.value)})})),
                React.createElement('td', null, React.createElement('input', {type:'text', value:p.gi, onChange:e=>updateRow(p.id, {gi:toNum(e.target.value)})})),
                React.createElement('td', null, React.createElement('input', {type:'text', value:p.harmScore, onChange:e=>updateRow(p.id, {harmScore:toNum(e.target.value)})})),
                React.createElement('td', null, React.createElement('button', {className:'btn', onClick:()=>deleteRow(p.id)}, 'Удалить'))
              ))
            )
          )
        ),
        React.createElement('div', {className:'muted', style:{marginTop:'8px'}}, 'Серые поля — авто: У=простые+сложные; Ж=вредные+полезные+супервредные; Ккал=4×(Б+У)+8×Ж.')
      ),
      showModal && React.createElement('div', {className:'modal-backdrop', onClick:(e)=>{ if(e.target.classList.contains('modal-backdrop')) setShowModal(false); }},
        React.createElement('div', {className:'modal'},
          React.createElement('div', {className:'row', style:{justifyContent:'space-between'}},
            React.createElement('div', null, 'Новый продукт'),
            React.createElement('button', {className:'btn', onClick:()=>setShowModal(false)}, '×')
          ),
          React.createElement('div', {className:'grid grid-2', style:{marginTop:'8px'}},
            React.createElement('div', null, React.createElement('label', null, 'Название'), React.createElement('input', {value:draft.name, onChange:e=>setDraft({...draft, name:e.target.value})})),
            React.createElement('div', null, React.createElement('label', null, 'ГИ'), React.createElement('input', {type:'text', value:draft.gi, onChange:e=>setDraft({...draft, gi:toNum(e.target.value)})})),
            React.createElement('div', null, React.createElement('label', null, 'Простые (100г)'), React.createElement('input', {type:'text', value:draft.simple100, onChange:e=>setDraft({...draft, simple100:toNum(e.target.value)})})),
            React.createElement('div', null, React.createElement('label', null, 'Сложные (100г)'), React.createElement('input', {type:'text', value:draft.complex100, onChange:e=>setDraft({...draft, complex100:toNum(e.target.value)})})),
            React.createElement('div', null, React.createElement('label', null, 'Белки (100г)'), React.createElement('input', {type:'text', value:draft.protein100, onChange:e=>setDraft({...draft, protein100:toNum(e.target.value)})})),
            React.createElement('div', null, React.createElement('label', null, 'Вредные жиры (100г)'), React.createElement('input', {type:'text', value:draft.badFat100, onChange:e=>setDraft({...draft, badFat100:toNum(e.target.value)})})),
            React.createElement('div', null, React.createElement('label', null, 'Полезные жиры (100г)'), React.createElement('input', {type:'text', value:draft.goodFat100, onChange:e=>setDraft({...draft, goodFat100:toNum(e.target.value)})})),
            React.createElement('div', null, React.createElement('label', null, 'Супервредные жиры (100г)'), React.createElement('input', {type:'text', value:draft.trans100, onChange:e=>setDraft({...draft, trans100:toNum(e.target.value)})})),
            React.createElement('div', null, React.createElement('label', null, 'Клетчатка (100г)'), React.createElement('input', {type:'text', value:draft.fiber100, onChange:e=>setDraft({...draft, fiber100:toNum(e.target.value)})})),
            React.createElement('div', null, React.createElement('label', null, 'Вредность (0–10)'), React.createElement('input', {type:'text', value:draft.harmScore, onChange:e=>setDraft({...draft, harmScore:toNum(e.target.value)})})),
            React.createElement('div', null, React.createElement('label', null, 'Углеводы (100г) — авто'), React.createElement('input', {className:'readOnly', readOnly:true, value:derived.carbs100})),
            React.createElement('div', null, React.createElement('label', null, 'Жиры (100г) — авто'), React.createElement('input', {className:'readOnly', readOnly:true, value:derived.fat100})),
            React.createElement('div', null, React.createElement('label', null, 'Калории (100г) — авто'), React.createElement('input', {className:'readOnly', readOnly:true, value:derived.kcal100}))
          ),
          React.createElement('div', {className:'row', style:{justifyContent:'flex-end', marginTop:'10px'}},
            React.createElement('button', {className:'btn', onClick:()=>{ setShowModal(false); resetDraft(); }}, 'Отмена'),
            React.createElement('button', {className:'btn acc', onClick:addProduct}, 'Добавить')
          )
        )
      )
    );
  }

  HEYS.utils = { INVIS, NUM_RE, round1, uuid, toNum, toNumInput, computeDerived, lsGet, lsSet, parsePasted };
  // products helper API (thin wrapper over store + local fallback)
  HEYS.products = HEYS.products || {
    getAll: ()=> (HEYS.store&&HEYS.store.get&&HEYS.store.get('heys_products', [])) || (HEYS.utils&&HEYS.utils.lsGet&&HEYS.utils.lsGet('heys_products', [])) || [],
    setAll: (arr)=> { if(HEYS.store&&HEYS.store.set) HEYS.store.set('heys_products', arr); else if(HEYS.utils&&HEYS.utils.lsSet) HEYS.utils.lsSet('heys_products', arr); },
    watch: (fn)=> { if(HEYS.store&&HEYS.store.watch) return HEYS.store.watch('heys_products', fn); return ()=>{}; }
  };
  HEYS.RationTab = RationTab;
  HEYS.Ration = RationTab;
})(window);


;(function(global){
  const HEYS = global.HEYS = global.HEYS || {};
  const U = HEYS.utils || {};
  if (!U.__clientScoped) {
    const get0 = U.lsGet ? U.lsGet.bind(U) : (k,d)=>{ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch(e){ return d; } };
    const set0 = U.lsSet ? U.lsSet.bind(U) : (k,v)=>{ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} };

    function nsKey(k){
      // 1) текущий клиент: из глобала или из глобального ключа выбора клиента
      let cid = (global.HEYS && HEYS.currentClientId) || '';
      if (!cid) {
        try { const raw = localStorage.getItem('heys_client_current'); if (raw) cid = JSON.parse(raw); } catch(e){ cid=''; }
      }
      // 2) служебные ключи НЕ префиксуем (глобальные)
      if (/^heys_(clients|client_current)$/i.test(k)) return k;
      // 3) если клиента нет — работаем как есть
      if (!cid) return k;
      // 4) все остальные наши ключи префиксуем
      if (/^(heys_|day_)/i.test(k)) {
        return k.replace(/^(heys_|day_)/i, (m)=> m + cid + '_');
      }
      return k;
    }

    U.lsGet = (k,d)=> get0(nsKey(k), d);
    U.lsSet = (k,v)=> set0(nsKey(k), v);
    U.__clientScoped = true;
  }
})(window);
