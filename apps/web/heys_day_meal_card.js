// heys_day_meal_card.js — legacy shim (moved to day/_meals.js)
; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  if (HEYS.analytics?.trackError) {
    HEYS.analytics.trackError(new Error('[HEYS Day Meals] MealCard moved to day/_meals.js'), {
      source: 'heys_day_meal_card.js',
      type: 'legacy_shim',
    });
  }
  return;
  /*
    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;
    
    // Import utilities from dayUtils
    const U = HEYS.dayUtils || {};
    const getProductFromItem = U.getProductFromItem || (() => null);
    const formatMealTime = U.formatMealTime || ((time) => time);
    const MEAL_TYPES = U.MEAL_TYPES || {};
    const per100 = U.per100 || ((p) => ({kcal100:0,carbs100:0,prot100:0,fat100:0,simple100:0,complex100:0,bad100:0,good100:0,trans100:0,fiber100:0}));
    const scale = U.scale || ((v,g) => Math.round(((+v||0)*(+g||0)/100)*10)/10);
    
    // Import models
    const M = HEYS.models || {};
    
    // Import from photo gallery
    const { LazyPhotoThumb } = HEYS.dayGallery || {};
    
    // Import from meal scoring
    const { getMealQualityScore, getNutrientColor, getNutrientTooltip } = HEYS.mealScoring || {};
    
    // Helper function for formatting values (extracted from v12)
    function fmtVal(key, v){
      const num = +v || 0;
      if (!num) return '-';
      if (key === 'harm') return Math.round(num * 10) / 10;
      return Math.round(num);
    }
    
    // Import popup components
    const { PopupCloseButton } = HEYS.dayPopups || {};
    
    // Import add product components
    const { MealAddProduct, ProductRow } = HEYS.dayComponents || {};
    
    // Constants
    const MEAL_HEADER_META = [
      {label:'Название<br>продукта'},
      {label:'г'},
      {label:'ккал<br>/100', per100:true},
      {label:'У<br>/100', per100:true},
      {label:'Прост<br>/100', per100:true},
      {label:'Сл<br>/100', per100:true},
      {label:'Б<br>/100', per100:true},
      {label:'Ж<br>/100', per100:true},
      {label:'ВрЖ<br>/100', per100:true},
      {label:'ПЖ<br>/100', per100:true},
      {label:'ТрЖ<br>/100', per100:true},
      {label:'Клетч<br>/100', per100:true},
      {label:'ГИ'},
      {label:'Вред'},
      {label:''}
    ];
    
    // Helper function to determine meal type
    function getMealType(mealIndex, meal, allMeals, pIndex) {
      // This is a simplified version - actual implementation may differ
      const time = meal?.time || '';
      const hour = parseInt(time.split(':')[0]) || 12;
      
      if (hour >= 6 && hour < 11) return { type: 'breakfast', label: 'Завтрак', emoji: '🌅' };
      if (hour >= 11 && hour < 16) return { type: 'lunch', label: 'Обед', emoji: '🌞' };
      if (hour >= 16 && hour < 21) return { type: 'dinner', label: 'Ужин', emoji: '🌆' };
      return { type: 'snack', label: 'Перекус', emoji: '🍎' };
    }
    
    const MealCard = React.memo(function MealCard({
      meal,
      mealIndex,
      displayIndex,
      products,
      pIndex,
      date,
      setDay,
      isMobile,
      isExpanded,
      onToggleExpand,
      onChangeMealType,
      onChangeTime,
      onChangeMood,
      onChangeWellbeing,
      onChangeStress,
      onRemoveMeal,
      openEditGramsModal,
      openTimeEditor,
      openMoodEditor,
      setGrams,
      removeItem,
      isMealStale,
      allMeals,
      isNewItem,
      optimum,
      setMealQualityPopup,
      addProductToMeal,
      dayData,
      profile,
      insulinWaveData: insulinWaveDataProp
    }) {
      const headerMeta = MEAL_HEADER_META;
      function mTotals(m){
        const t=(M.mealTotals? M.mealTotals(m,pIndex): {kcal:0,carbs:0,simple:0,complex:0,prot:0,fat:0,bad:0,good:0,trans:0,fiber:0});
        let gSum=0, giSum=0, harmSum=0; (m.items||[]).forEach(it=>{ const p=getProductFromItem(it,pIndex); if(!p)return; const g=+it.grams||0; if(!g)return; const gi=p.gi??p.gi100??p.GI??p.giIndex; const harm=p.harm??p.harmScore??p.harm100??p.harmPct; gSum+=g; if(gi!=null) giSum+=gi*g; if(harm!=null) harmSum+=harm*g; }); t.gi=gSum?giSum/gSum:0; t.harm=gSum?harmSum/gSum:0; return t; }
      const totals=mTotals(meal);
      const manualType = meal.mealType;
      const autoTypeInfo = getMealType(mealIndex, meal, allMeals, pIndex);
      const mealTypeInfo = manualType && U.MEAL_TYPES && U.MEAL_TYPES[manualType] 
        ? { type: manualType, ...U.MEAL_TYPES[manualType] }
        : autoTypeInfo;
      
      const changeMealType = (newType) => {
        onChangeMealType(mealIndex, newType);
      };
      const timeDisplay = U.formatMealTime ? U.formatMealTime(meal.time) : (meal.time || '');
      const mealKcal = Math.round(totals.kcal || 0);
      const isStale = isMealStale(meal);
      const isCurrentMeal = displayIndex === 0 && !isStale;
      
      // Вычисляем activityContext для этого приёма (для harmMultiplier)
      const mealActivityContext = React.useMemo(() => {
        if (!HEYS.InsulinWave?.calculateActivityContext) return null;
        if (!dayData?.trainings || dayData.trainings.length === 0) return null;
        if (!meal?.time || !meal?.items?.length) return null;
        
        const mealTotals = M.mealTotals ? M.mealTotals(meal, pIndex) : { kcal: 0 };
        return HEYS.InsulinWave.calculateActivityContext({
          mealTime: meal.time,
          mealKcal: mealTotals.kcal || 0,
          trainings: dayData.trainings,
          householdMin: dayData.householdMin || 0,
          steps: dayData.steps || 0,
          allMeals: allMeals
        });
      }, [meal?.time, meal?.items, dayData?.trainings, dayData?.householdMin, dayData?.steps, allMeals, pIndex]);
      
      // Вычисляем качество приёма для цветной линии слева
      const mealQuality = React.useMemo(() => {
        if (!meal?.items || meal.items.length === 0) return null;
        return getMealQualityScore(meal, mealTypeInfo.type, optimum || 2000, pIndex, mealActivityContext);
      }, [meal?.items, mealTypeInfo.type, optimum, pIndex, mealActivityContext]);
      
      // Цвет линии качества
      const qualityLineColor = mealQuality 
        ? mealQuality.color 
        : (meal?.items?.length > 0 ? '#9ca3af' : 'transparent');
      
      const mealCardClass = isCurrentMeal ? 'card tone-green meal-card meal-card--current' : 'card tone-slate meal-card';
      const mealCardStyle = {
        marginTop: '8px', 
        width: '100%',
        position: 'relative',
        paddingLeft: '12px',
        ...(isCurrentMeal ? { 
          border: '2px solid #22c55e', 
          boxShadow: '0 4px 12px rgba(34,197,94,0.25)' 
        } : {})
      };
      const computeDerivedProductFn = M.computeDerivedProduct || ((prod) => prod || {});
  
      // === Инсулиновая волна в карточке приёма ===
      const InsulinWave = HEYS.InsulinWave || {};
      const IWUtils = InsulinWave.utils || {};
      const insulinWaveData = insulinWaveDataProp || {};
      const waveHistorySorted = React.useMemo(() => {
        const list = insulinWaveData.waveHistory || [];
        // Сортировка по времени приёма (используем normalizeToHeysDay, день = 03:00→03:00)
        if (!IWUtils.normalizeToHeysDay) return [...list].sort((a, b) => a.startMin - b.startMin);
        return [...list].sort((a, b) => IWUtils.normalizeToHeysDay(a.startMin) - IWUtils.normalizeToHeysDay(b.startMin));
      }, [insulinWaveData.waveHistory]);
  
      const currentWaveIndex = React.useMemo(() => waveHistorySorted.findIndex(w => w.time === meal.time), [waveHistorySorted, meal.time]);
      const currentWave = currentWaveIndex >= 0 ? waveHistorySorted[currentWaveIndex] : null;
      const prevWave = currentWaveIndex > 0 ? waveHistorySorted[currentWaveIndex - 1] : null;
      const nextWave = (currentWaveIndex >= 0 && currentWaveIndex < waveHistorySorted.length - 1) ? waveHistorySorted[currentWaveIndex + 1] : null;
      const hasOverlapWithNext = currentWave && nextWave ? currentWave.endMin > nextWave.startMin : false;
      const hasOverlapWithPrev = currentWave && prevWave ? prevWave.endMin > currentWave.startMin : false;
      const hasAnyOverlap = hasOverlapWithNext || hasOverlapWithPrev;
      const lipolysisGapNext = currentWave && nextWave ? Math.max(0, nextWave.startMin - currentWave.endMin) : 0;
      const overlapMinutes = hasOverlapWithNext
        ? currentWave.endMin - nextWave.startMin
        : hasOverlapWithPrev
          ? prevWave.endMin - currentWave.startMin
          : 0;
      const [waveExpanded, setWaveExpanded] = React.useState(true);
      const [showWaveCalcPopup, setShowWaveCalcPopup] = React.useState(false);
      const isCurrentActiveMeal = !!(currentWave && currentWave.isActive);
      const showWaveButton = !!(currentWave && meal.time && (meal.items || []).length > 0);
      const formatMinutes = React.useCallback((mins) => {
        if (IWUtils.formatDuration) return IWUtils.formatDuration(mins);
        return `${Math.max(0, Math.round(mins))}м`;
      }, [IWUtils.formatDuration]);
  
      const toggleWave = React.useCallback(() => {
        const newState = !waveExpanded;
        setWaveExpanded(newState);
        if (HEYS.dayUtils?.haptic) HEYS.dayUtils.haptic('light');
        if (HEYS.analytics?.trackDataOperation) {
          HEYS.analytics.trackDataOperation('insulin_wave_meal_expand', {
            action: newState ? 'open' : 'close',
            hasOverlap: hasAnyOverlap,
            overlapMinutes,
            lipolysisGap: lipolysisGapNext,
            mealIndex
          });
        }
      }, [waveExpanded, hasAnyOverlap, overlapMinutes, lipolysisGapNext, mealIndex]);
      
      // Helper functions для эмодзи оценок (как в тренировках)
      const getMoodEmoji = (v) => 
        v <= 0 ? null : v <= 2 ? '😢' : v <= 4 ? '😕' : v <= 6 ? '😐' : v <= 8 ? '😊' : '😄';
      const getWellbeingEmoji = (v) => 
        v <= 0 ? null : v <= 2 ? '🤒' : v <= 4 ? '😓' : v <= 6 ? '😐' : v <= 8 ? '💪' : '🏆';
      const getStressEmoji = (v) => 
        v <= 0 ? null : v <= 2 ? '😌' : v <= 4 ? '🙂' : v <= 6 ? '😐' : v <= 8 ? '😟' : '😰';
      
      const moodVal = +meal.mood || 0;
      const wellbeingVal = +meal.wellbeing || 0;
      const stressVal = +meal.stress || 0;
      const moodEmoji = getMoodEmoji(moodVal);
      const wellbeingEmoji = getWellbeingEmoji(wellbeingVal);
      const stressEmoji = getStressEmoji(stressVal);
      const hasRatings = moodVal > 0 || wellbeingVal > 0 || stressVal > 0;
  
      // === State для попапа советов ===
      const [optimizerPopupOpen, setOptimizerPopupOpen] = React.useState(false);
      
      // === State для раскрытия блока КБЖУ ===
      const [totalsExpanded, setTotalsExpanded] = React.useState(false);
      
      // === Вычисляем количество советов MealOptimizer ===
      const optimizerRecsCount = React.useMemo(() => {
        const MO = HEYS.MealOptimizer;
        if (!MO || !meal?.items?.length) return 0;
        
        const recommendations = MO.getMealOptimization({
          meal,
          mealTotals: totals,
          dayData: dayData || {},
          profile: profile || {},
          products: products || [],
          pIndex,
          avgGI: totals?.gi || 50
        });
        
        // Фильтруем скрытые
        const filtered = recommendations.filter(r => !MO.shouldHideRecommendation(r.id));
        
        // Дедупликация по title
        const seen = new Set();
        return filtered.filter(r => {
          const key = r.title.toLowerCase().trim();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }).length;
      }, [meal, totals, dayData, profile, products, pIndex]);
  
      return React.createElement('div',{className: mealCardClass, 'data-meal-index': mealIndex, style: mealCardStyle},
        // Вертикальная линия качества слева
        qualityLineColor !== 'transparent' && React.createElement('div', {
          className: 'meal-quality-line',
          style: {
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: '5px',
            borderRadius: '12px 0 0 12px',
            background: qualityLineColor,
            transition: 'background 0.3s ease'
          }
        }),
        // Заголовок приёма ВНУТРИ карточки: время слева, тип по центру, калории справа (ОДНА СТРОКА)
        // Фон шапки — цвет качества с 12% прозрачностью
        React.createElement('div',{className:'meal-header-inside meal-type-' + mealTypeInfo.type, style: { 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          gap: '8px',
          background: qualityLineColor !== 'transparent' 
            ? qualityLineColor + '1F' // 12% opacity (1F = 31/255)
            : undefined,
          borderRadius: '10px 10px 0 0',
          margin: '-12px -12px 8px -4px',
          padding: '12px 16px 12px 8px'
        }},
          // Время слева (крупное)
          timeDisplay && React.createElement('span', { 
            className: 'meal-time-badge-inside',
            onClick: () => openTimeEditor(mealIndex),
            title: 'Изменить время',
            style: { fontSize: '15px', padding: '6px 14px', fontWeight: '700', flexShrink: 0 }
          }, timeDisplay),
          // Тип приёма по центру (кликабельный dropdown)
          React.createElement('div', { className: 'meal-type-wrapper', style: { flex: 1, display: 'flex', justifyContent: 'center' } },
            // Текущий тип (иконка + название) — кликабельный
            React.createElement('span', { className: 'meal-type-label', style: { fontSize: '16px', fontWeight: '700', padding: '4px 12px' } }, 
              mealTypeInfo.icon + ' ' + mealTypeInfo.name,
              // Индикатор dropdown
              React.createElement('span', { className: 'meal-type-arrow' }, ' ▾')
            ),
            // Скрытый select поверх
            React.createElement('select', {
              className: 'meal-type-select',
              value: manualType || '',
              onChange: (e) => {
                changeMealType(e.target.value || null);
              },
              title: 'Изменить тип приёма'
            }, [
              { value: '', label: '🔄 Авто' },
              { value: 'breakfast', label: '🍳 Завтрак' },
              { value: 'snack1', label: '🍎 Перекус' },
              { value: 'lunch', label: '🍲 Обед' },
              { value: 'snack2', label: '🥜 Перекус' },
              { value: 'dinner', label: '🍽️ Ужин' },
              { value: 'snack3', label: '🧀 Перекус' },
              { value: 'night', label: '🌙 Ночной' }
            ].map(opt => 
              React.createElement('option', { key: opt.value, value: opt.value }, opt.label)
            ))
          ),
          // Калории справа (крупное)
          React.createElement('span', { className: 'meal-kcal-badge-inside', style: { fontSize: '15px', padding: '6px 14px', flexShrink: 0 } }, 
            mealKcal > 0 ? (mealKcal + ' ккал') : '0 ккал'
          ),
          // 🆕 v3.4.0: Activity Context badge (если есть)
          currentWave && currentWave.activityContext && React.createElement('span', {
            className: 'activity-context-badge',
            title: currentWave.activityContext.desc,
            style: {
              fontSize: '12px',
              padding: '4px 8px',
              borderRadius: '8px',
              background: currentWave.activityContext.type === 'peri' ? '#22c55e33' :
                          currentWave.activityContext.type === 'post' ? '#3b82f633' :
                          currentWave.activityContext.type === 'pre' ? '#eab30833' :
                          '#6b728033',
              color: currentWave.activityContext.type === 'peri' ? '#16a34a' :
                     currentWave.activityContext.type === 'post' ? '#2563eb' :
                     currentWave.activityContext.type === 'pre' ? '#ca8a04' :
                     '#374151',
              fontWeight: '600',
              flexShrink: 0,
              marginLeft: '4px',
              whiteSpace: 'nowrap'
            }
          }, currentWave.activityContext.badge || '')
        ),
        // 🆕 v3.5.0: Smart Training Hint — контекстная подсказка при добавлении еды
        mealActivityContext && mealActivityContext.type !== 'none' && (meal.items || []).length === 0 && 
          React.createElement('div', {
            className: 'training-context-hint',
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              margin: '0 -4px 8px -4px',
              borderRadius: '8px',
              fontSize: '13px',
              lineHeight: '1.4',
              background: mealActivityContext.type === 'peri' ? 'linear-gradient(135deg, #22c55e15, #22c55e25)' :
                          mealActivityContext.type === 'post' ? 'linear-gradient(135deg, #3b82f615, #3b82f625)' :
                          mealActivityContext.type === 'pre' ? 'linear-gradient(135deg, #eab30815, #eab30825)' :
                          'linear-gradient(135deg, #6b728015, #6b728025)',
              border: mealActivityContext.type === 'peri' ? '1px solid #22c55e40' :
                      mealActivityContext.type === 'post' ? '1px solid #3b82f640' :
                      mealActivityContext.type === 'pre' ? '1px solid #eab30840' :
                      '1px solid #6b728040',
              color: mealActivityContext.type === 'peri' ? '#16a34a' :
                     mealActivityContext.type === 'post' ? '#2563eb' :
                     mealActivityContext.type === 'pre' ? '#ca8a04' :
                     '#374151'
            }
          },
            React.createElement('span', { style: { fontSize: '18px' } }, mealActivityContext.badge || '🏋️'),
            React.createElement('div', { style: { flex: 1 } },
              React.createElement('div', { style: { fontWeight: 600, marginBottom: '2px' } }, 
                mealActivityContext.type === 'peri' ? '🔥 Топливо для тренировки!' :
                mealActivityContext.type === 'post' ? '💪 Анаболическое окно!' :
                mealActivityContext.type === 'pre' ? '⚡ Скоро тренировка!' :
                mealActivityContext.type === 'steps' ? '👟 Активный день!' :
                mealActivityContext.type === 'double' ? '🏆 Двойная тренировка!' :
                '🎯 Хорошее время!'
              ),
              React.createElement('div', { style: { opacity: 0.85, fontSize: '12px' } }, 
                mealActivityContext.type === 'peri' ? 'Еда пойдёт в энергию, а не в жир. Вред снижен на ' + Math.round((1 - (mealActivityContext.harmMultiplier || 1)) * 100) + '%' :
                mealActivityContext.type === 'post' ? 'Нутриенты усвоятся в мышцы. Отличное время для белка!' :
                mealActivityContext.type === 'pre' ? 'Лёгкие углеводы дадут энергию для тренировки' :
                mealActivityContext.type === 'steps' ? 'Высокая активность улучшает метаболизм' :
                mealActivityContext.type === 'double' ? 'Двойная нагрузка — можно есть смелее!' :
                'Инсулиновая волна будет короче'
              )
            )
          ),
        React.createElement('div',{className:'row desktop-add-product',style:{justifyContent:'space-between',alignItems:'center'}},
          React.createElement('div',{className:'section-title'},'Добавить продукт'),
          React.createElement(MealAddProduct, { mi: mealIndex, products, date, setDay, isCurrentMeal })
        ),
        React.createElement('div',{style:{overflowX:'auto',marginTop:'8px'}}, React.createElement('table',{className:'tbl meals-table'},
          React.createElement('thead',null,React.createElement('tr',null, headerMeta.map((h,i)=>React.createElement('th',{
              key:'h'+i,
              className: h.per100? 'per100-col': undefined,
              dangerouslySetInnerHTML:{__html:h.label}
            }))
          )),
          React.createElement('tbody',null,
            (meal.items||[]).map(it => React.createElement(ProductRow, {
              key: it.id,
              item: it,
              mealIndex,
              isNew: isNewItem(it.id),
              pIndex,
              setGrams,
              removeItem
            })),
            React.createElement('tr',{className:'tr-sum'},
              React.createElement('td',{className:'fw-600'},''),
              React.createElement('td',null,''),
              React.createElement('td',{colSpan:10},React.createElement('div',{className:'table-divider'})),
              React.createElement('td',null,fmtVal('kcal', totals.kcal)),
              React.createElement('td',null,fmtVal('carbs', totals.carbs)),
              React.createElement('td',null,fmtVal('simple', totals.simple)),
              React.createElement('td',null,fmtVal('complex', totals.complex)),
              React.createElement('td',null,fmtVal('prot', totals.prot)),
              React.createElement('td',null,fmtVal('fat', totals.fat)),
              React.createElement('td',null,fmtVal('bad', totals.bad)),
              React.createElement('td',null,fmtVal('good', totals.good)),
              React.createElement('td',null,fmtVal('trans', totals.trans)),
              React.createElement('td',null,fmtVal('fiber', totals.fiber)),
              React.createElement('td',null,fmtVal('gi', totals.gi)),
              React.createElement('td',null,fmtVal('harm', totals.harm)),
              React.createElement('td',null,'')
            )
          )
        )),
        // MOBILE CARDS — компактный вид с grid-сеткой (collapsible)
          React.createElement('div', { className: 'mobile-products-list' },
            // Ряд: toggle + добавить (если есть продукты) или только добавить (если пусто)
            React.createElement('div', { className: 'mpc-toggle-add-row' + ((meal.items || []).length === 0 ? ' single' : '') },
              // Toggle (только если есть продукты)
              (meal.items || []).length > 0 && React.createElement('div', { 
                className: 'mpc-products-toggle' + (isExpanded ? ' expanded' : ''),
                onClick: () => onToggleExpand(mealIndex, allMeals)
              },
                React.createElement('span', { className: 'toggle-arrow' }, '›'),
                React.createElement('span', { className: 'mpc-toggle-text' },
                  React.createElement('span', { className: 'mpc-toggle-title' }, isExpanded ? 'Свернуть' : 'Развернуть'),
                  React.createElement('span', { className: 'mpc-toggle-count' },
                    (meal.items || []).length + ' продукт' + ((meal.items || []).length === 1 ? '' : (meal.items || []).length < 5 ? 'а' : 'ов')
                  )
                )
              ),
            // Кнопка добавить
            React.createElement(MealAddProduct, { mi: mealIndex, products, date, setDay, isCurrentMeal })
          ),
          // Products list (shown when expanded)
          isExpanded && (meal.items || []).map(it => {
            const p = getProductFromItem(it, pIndex) || { name: it.name || '?' };
            const G = +it.grams || 0;
            const per = per100(p);
            const giVal = p.gi ?? p.gi100 ?? p.GI ?? p.giIndex ?? it.gi;
            // Use centralized harm normalization with fallback to item data
            const harmVal = HEYS.models?.normalizeHarm?.(p) ?? HEYS.models?.normalizeHarm?.(it);
            
            // Контент карточки
            // Определяем цвет граммов
            const gramsClass = G > 500 ? 'grams-danger' : G > 300 ? 'grams-warn' : '';
            
            // Фон карточки по полезности: 0=зелёный(полезный), 5=голубой(средний), 10=красный(вредный)
            const getHarmBg = (h) => {
              if (h == null) return '#fff';
              // h: 0=полезный, 5=средний, 10=вредный
              if (h <= 1) return '#34d399';  // 0-1: насыщенный зелёный — полезный
              if (h <= 2) return '#6ee7b7';  // 2: зелёный
              if (h <= 3) return '#a7f3d0';  // 3: мятный
              if (h <= 4) return '#d1fae5';  // 4: светло-мятный
              if (h <= 5) return '#bae6fd';  // 5: голубой — средний
              if (h <= 6) return '#e0f2fe';  // 6: светло-голубой
              if (h <= 7) return '#fecaca';  // 7: светло-розовый
              if (h <= 8) return '#fee2e2';  // 8: розовый
              if (h <= 9) return '#fecdd3';  // 9: красноватый
              return '#f87171';              // 10: красный — вредный
            };
            const harmBg = getHarmBg(harmVal);
            
            // Бейдж полезности/вредности: 0=полезный, 10=вредный
            const getHarmBadge = (h) => {
              if (h == null) return null;
              if (h <= 2) return { emoji: '🌿', text: 'полезный', color: '#059669' };
              if (h >= 8) return { emoji: '⚠️', text: 'вредный', color: '#dc2626' };
              return null;
            };
            const harmBadge = getHarmBadge(harmVal);
            
            // Иконка категории продукта
            const getCategoryIcon = (cat) => {
              if (!cat) return null;
              const c = cat.toLowerCase();
              if (c.includes('молоч') || c.includes('сыр') || c.includes('творог')) return '🥛';
              if (c.includes('мяс') || c.includes('птиц') || c.includes('курин') || c.includes('говя') || c.includes('свин')) return '🍖';
              if (c.includes('рыб') || c.includes('морепр')) return '🐟';
              if (c.includes('овощ') || c.includes('салат') || c.includes('зелен')) return '🥬';
              if (c.includes('фрукт') || c.includes('ягод')) return '🍎';
              if (c.includes('круп') || c.includes('каш') || c.includes('злак') || c.includes('хлеб') || c.includes('выпеч')) return '🌾';
              if (c.includes('яйц')) return '🥚';
              if (c.includes('орех') || c.includes('семеч')) return '🥜';
              if (c.includes('масл')) return '🫒';
              if (c.includes('напит') || c.includes('сок') || c.includes('кофе') || c.includes('чай')) return '🥤';
              if (c.includes('сладк') || c.includes('десерт') || c.includes('конфет') || c.includes('шокол')) return '🍬';
              if (c.includes('соус') || c.includes('специ') || c.includes('припра')) return '🧂';
              return '🍽️';
            };
            const categoryIcon = getCategoryIcon(p.category);
            
            // Smart Alternative v1.0: semantic category + macro similarity + multi-factor scoring
            const findAlternative = (prod, allProducts) => {
              if (!allProducts || allProducts.length < 2) return null;
              const currentKcal = per.kcal100 || 0;
              if (currentKcal < 50) return null;
              const _detectCat = HEYS.InsightsPI?.productPicker?._internal?.detectCategory;
              const getSemanticCat = (name, fallbackCat) => {
                if (_detectCat) return _detectCat(name || '');
                const c = (fallbackCat || name || '').toLowerCase();
                if (c.includes('молоч') || c.includes('кефир') || c.includes('творог') || c.includes('йогур') || c.includes('сыр')) return 'dairy';
                if (c.includes('мяс') || c.includes('птиц') || c.includes('курин') || c.includes('говяд') || c.includes('рыб') || c.includes('морепр') || c.includes('яйц')) return 'protein';
                if (c.includes('овощ') || c.includes('фрукт') || c.includes('ягод') || c.includes('зелен') || c.includes('салат')) return 'vegetables';
                if (c.includes('круп') || c.includes('каш') || c.includes('злак') || c.includes('хлеб') || c.includes('макарон')) return 'grains';
                if (c.includes('орех') || c.includes('семеч') || c.includes('миндал') || c.includes('фундук')) return 'snacks';
                return 'other';
              };
              const getDominantMacro = (prot, carbs, fat, kcal) => {
                if (!kcal || kcal < 1) return 'macro_mixed';
                if ((prot * 3) / kcal >= 0.35) return 'macro_protein';
                if ((fat * 9) / kcal >= 0.55) return 'macro_fat';
                if ((carbs * 4) / kcal >= 0.50) return 'macro_carb';
                return 'macro_mixed';
              };
              const origSemCat = getSemanticCat(prod.name, prod.category);
              const origMacroCat = origSemCat === 'other'
                ? getDominantMacro(per.prot100 || 0, per.carbs100 || 0, per.fat100 || 0, currentKcal)
                : null;
              const _sharedList = (HEYS.products?.shared && Array.isArray(HEYS.products.shared)) ? HEYS.products.shared : [];
              const _clientIds = new Set(allProducts.map(ap => ap.id));
              const candidatePool = [
                ...allProducts.map(ap => ({ ...ap, _familiar: true })),
                ..._sharedList.filter(sp => sp && sp.id && !_clientIds.has(sp.id)).map(sp => ({ ...sp, _familiar: false })),
              ];
              const candidates = candidatePool.filter((alt) => {
                if (alt.id === prod.id) return false;
                const altDer = computeDerivedProductFn(alt);
                const altKcal = alt.kcal100 || altDer.kcal100 || 0;
                if (altKcal < 30) return false;
                const altMacroSum = (alt.prot100 || altDer.prot100 || 0)
                  + (alt.fat100 || altDer.fat100 || 0)
                  + ((alt.simple100 || 0) + (alt.complex100 || 0) || alt.carbs100 || altDer.carbs100 || 0);
                if (altMacroSum < 5) return false;
                if (altKcal >= currentKcal * 0.90) return false;
                if (altKcal < currentKcal * 0.15) return false;
                const altSemCat = getSemanticCat(alt.name, alt.category);
                if (origSemCat !== 'other') {
                  if (altSemCat !== origSemCat) return false;
                } else {
                  const altMacroCat = getDominantMacro(
                    alt.prot100 || altDer.prot100 || 0,
                    alt.carbs100 || altDer.carbs100 || 0,
                    alt.fat100 || altDer.fat100 || 0,
                    altKcal,
                  );
                  if (origMacroCat !== 'macro_mixed' && altMacroCat !== 'macro_mixed' && origMacroCat !== altMacroCat) return false;
                }
                return true;
              });
              if (candidates.length === 0) return null;
              const origHarm = prod.harm ?? harmVal ?? 0;
              const origGI = prod.gi ?? 50;
              const origProtEn = (per.prot100 || 0) * 3 / currentKcal;
              const origCarbEn = (per.carbs100 || 0) * 4 / currentKcal;
              const origFatEn = (per.fat100 || 0) * 9 / currentKcal;
              const origFiber = per.fiber100 || 0;
              let _pickerFn = null;
              let _pickerScenario = null;
              try {
                _pickerFn = HEYS.InsightsPI?.productPicker?.calculateProductScore;
                if (_pickerFn && meal?.time) {
                  const _mealHour = parseInt(meal.time.split(':')[0], 10);
                  _pickerScenario = {
                    scenario: _mealHour >= 22 ? 'PRE_SLEEP' : _mealHour >= 20 ? 'LATE_EVENING' : 'BALANCED',
                    remainingKcal: optimum ? Math.max(0, optimum - currentKcal) : 500,
                    currentTime: _mealHour,
                    targetProtein: profile?.targetProtein || 100,
                    sugarDependencyRisk: false,
                    fiberRegularityScore: 0.5,
                    micronutrientDeficits: [],
                    novaQualityScore: 0.5,
                    targetGL: _mealHour >= 20 ? 10 : 20,
                  };
                }
              } catch (e) { _pickerFn = null; }
              let best = null;
              let bestComposite = -Infinity;
              for (const alt of candidates) {
                try {
                  const altDer = computeDerivedProductFn(alt);
                  const altKcal = alt.kcal100 || altDer.kcal100 || 1;
                  const altProt = alt.prot100 || altDer.prot100 || 0;
                  const altCarbs = alt.carbs100 || altDer.carbs100 || 0;
                  const altFat = alt.fat100 || altDer.fat100 || 0;
                  const altFiber = alt.fiber100 || altDer.fiber100 || 0;
                  const altGI = alt.gi ?? 50;
                  const altHarm = alt.harm ?? 0;
                  const macroSimilarity = Math.max(0,
                    100
                    - Math.abs(origProtEn - (altProt * 3 / altKcal)) * 150
                    - Math.abs(origCarbEn - (altCarbs * 4 / altKcal)) * 100
                    - Math.abs(origFatEn - (altFat * 9 / altKcal)) * 100,
                  );
                  const savingPct = Math.round((1 - altKcal / currentKcal) * 100);
                  const harmImprov = Math.min(50, Math.max(-20, (origHarm - altHarm) * 15));
                  const improvementScore = harmImprov + Math.min(35, savingPct * 0.45) + (altFiber > origFiber + 1 ? 10 : 0);
                  const familiarBonus = alt._familiar ? 10 : 0;
                  let pickerScore = 50;
                  if (_pickerFn && _pickerScenario) {
                    try {
                      pickerScore = _pickerFn({
                        name: alt.name,
                        macros: { protein: altProt, carbs: altCarbs, fat: altFat, kcal: altKcal },
                        harm: altHarm, gi: altGI,
                        category: getSemanticCat(alt.name, alt.category),
                        familiarityScore: alt._familiar ? 7 : 3,
                        fiber: altFiber, nova_group: alt.novaGroup || 2,
                      }, _pickerScenario) || 50;
                    } catch (e) { pickerScore = 50; }
                  }
                  const composite = pickerScore * 0.35 + macroSimilarity * 0.30 + improvementScore * 0.25 + familiarBonus * 0.10;
                  if (composite > bestComposite) {
                    bestComposite = composite;
                    best = { name: alt.name, saving: savingPct, score: Math.round(composite) };
                  }
                } catch (e) { /* skip bad candidate */ }
              }
              if (!best || bestComposite < 28) return null;
              console.info('[HEYS.alternative] ✅ Smart replacement found:', {
                original: prod.name, replacement: best.name,
                saving: best.saving + '%', score: best.score, candidates: candidates.length,
              });
              return best;
            };
            const alternative = findAlternative(p, products);
            
            const cardContent = React.createElement('div', { className: 'mpc', style: { background: harmBg } },
              // Row 1: category icon + name + badge + grams
              React.createElement('div', { className: 'mpc-row1' },
                categoryIcon && React.createElement('span', { className: 'mpc-category-icon' }, categoryIcon),
                React.createElement('span', { className: 'mpc-name' }, p.name),
                harmBadge && React.createElement('span', { 
                  className: 'mpc-badge',
                  style: { color: harmBadge.color }
                }, harmBadge.emoji),
                // На мобильных — кнопка открывает модалку со слайдером
                React.createElement('button', {
                  className: 'mpc-grams-btn ' + gramsClass,
                  onClick: (e) => { e.stopPropagation(); openEditGramsModal(mealIndex, it.id, G, p); }
                }, G + 'г')
              ),
              // Row 2: header labels (grid)
              React.createElement('div', { className: 'mpc-grid mpc-header' },
                React.createElement('span', null, 'ккал'),
                React.createElement('span', null, 'У'),
                React.createElement('span', { className: 'mpc-dim' }, 'пр/сл'),
                React.createElement('span', null, 'Б'),
                React.createElement('span', null, 'Ж'),
                React.createElement('span', { className: 'mpc-dim' }, 'вр/пол/суп'),
                React.createElement('span', null, 'Кл'),
                React.createElement('span', null, 'ГИ'),
                React.createElement('span', null, 'Вр')
              ),
              // Row 3: values (grid) - абсолютные значения в граммах с цветовой индикацией и tooltips
              (() => {
                const itemTotals = {
                  kcal: scale(per.kcal100, G),
                  carbs: scale(per.carbs100, G),
                  simple: scale(per.simple100, G),
                  complex: scale(per.complex100, G),
                  prot: scale(per.prot100, G),
                  fat: scale(per.fat100, G),
                  bad: scale(per.bad100, G),
                  good: scale(per.good100, G),
                  trans: scale(per.trans100 || 0, G),
                  fiber: scale(per.fiber100, G),
                  gi: giVal || 0,
                  harm: harmVal || 0
                };
                return React.createElement('div', { className: 'mpc-grid mpc-values' },
                  React.createElement('span', { title: getNutrientTooltip('kcal', itemTotals.kcal, itemTotals), style: { color: getNutrientColor('kcal', itemTotals.kcal, itemTotals), fontWeight: getNutrientColor('kcal', itemTotals.kcal, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.kcal)),
                  React.createElement('span', { title: getNutrientTooltip('carbs', itemTotals.carbs, itemTotals), style: { color: getNutrientColor('carbs', itemTotals.carbs, itemTotals), fontWeight: getNutrientColor('carbs', itemTotals.carbs, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.carbs)),
                  React.createElement('span', { className: 'mpc-dim' },
                    React.createElement('span', { title: getNutrientTooltip('simple', itemTotals.simple, itemTotals), style: { color: getNutrientColor('simple', itemTotals.simple, itemTotals), fontWeight: getNutrientColor('simple', itemTotals.simple, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.simple)),
                    '/',
                    React.createElement('span', { title: getNutrientTooltip('complex', itemTotals.complex, itemTotals), style: { color: getNutrientColor('complex', itemTotals.complex, itemTotals), cursor: 'help' } }, Math.round(itemTotals.complex))
                  ),
                  React.createElement('span', { title: getNutrientTooltip('prot', itemTotals.prot, itemTotals), style: { color: getNutrientColor('prot', itemTotals.prot, itemTotals), fontWeight: getNutrientColor('prot', itemTotals.prot, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.prot)),
                  React.createElement('span', { title: getNutrientTooltip('fat', itemTotals.fat, itemTotals), style: { color: getNutrientColor('fat', itemTotals.fat, itemTotals), fontWeight: getNutrientColor('fat', itemTotals.fat, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.fat)),
                  React.createElement('span', { className: 'mpc-dim' },
                    React.createElement('span', { title: getNutrientTooltip('bad', itemTotals.bad, itemTotals), style: { color: getNutrientColor('bad', itemTotals.bad, itemTotals), fontWeight: getNutrientColor('bad', itemTotals.bad, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.bad)),
                    '/',
                    React.createElement('span', { title: getNutrientTooltip('good', itemTotals.good, itemTotals), style: { color: getNutrientColor('good', itemTotals.good, itemTotals), fontWeight: getNutrientColor('good', itemTotals.good, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.good)),
                    '/',
                    React.createElement('span', { title: getNutrientTooltip('trans', itemTotals.trans, itemTotals), style: { color: getNutrientColor('trans', itemTotals.trans, itemTotals), fontWeight: getNutrientColor('trans', itemTotals.trans, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.trans))
                  ),
                  React.createElement('span', { title: getNutrientTooltip('fiber', itemTotals.fiber, itemTotals), style: { color: getNutrientColor('fiber', itemTotals.fiber, itemTotals), fontWeight: getNutrientColor('fiber', itemTotals.fiber, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.fiber)),
                  React.createElement('span', { title: getNutrientTooltip('gi', itemTotals.gi, itemTotals), style: { color: getNutrientColor('gi', itemTotals.gi, itemTotals), fontWeight: getNutrientColor('gi', itemTotals.gi, itemTotals) ? 600 : 400, cursor: 'help' } }, giVal != null ? Math.round(giVal) : '-'),
                  React.createElement('span', { title: getNutrientTooltip('harm', itemTotals.harm, itemTotals), style: { color: getNutrientColor('harm', itemTotals.harm, itemTotals), fontWeight: getNutrientColor('harm', itemTotals.harm, itemTotals) ? 600 : 400, cursor: 'help' } }, harmVal != null ? fmtVal('harm', harmVal) : '-')
                );
              })(),
              // Row 4: альтернатива (если есть)
              alternative && React.createElement('div', { className: 'mpc-alternative' },
                React.createElement('span', null, '💡 Замени на '),
                React.createElement('strong', null, alternative.name),
                React.createElement('span', null, alternative.saving >= 10
                  ? ' — на ' + alternative.saving + '% меньше ккал'
                  : ' — полезнее по составу')
              )
            );
            
            // На мобильных — оборачиваем в SwipeableRow
            if (isMobile && HEYS.SwipeableRow) {
              return React.createElement(HEYS.SwipeableRow, {
                key: it.id,
                onDelete: () => removeItem(mealIndex, it.id)
              }, cardContent);
            }
            
            // На десктопе — обычная карточка с кнопкой удаления
            return React.createElement('div', { key: it.id, className: 'mpc', style: { marginBottom: '6px', background: harmBg } },
              React.createElement('div', { className: 'mpc-row1' },
                React.createElement('span', { className: 'mpc-name' }, p.name),
                React.createElement('input', {
                  type: 'number',
                  className: 'mpc-grams',
                  value: G,
                  onChange: e => setGrams(mealIndex, it.id, e.target.value),
                  onFocus: e => e.target.select(),
                  onKeyDown: e => { if (e.key === 'Enter') e.target.blur(); },
                  'data-grams-input': true,
                  'data-meal-index': mealIndex,
                  'data-item-id': it.id,
                  inputMode: 'decimal'
                }),
                React.createElement('button', {
                  className: 'mpc-delete',
                  onClick: () => removeItem(mealIndex, it.id)
                }, '×')
              ),
              React.createElement('div', { className: 'mpc-grid mpc-header' },
                React.createElement('span', null, 'ккал'),
                React.createElement('span', null, 'У'),
                React.createElement('span', { className: 'mpc-dim' }, 'пр/сл'),
                React.createElement('span', null, 'Б'),
                React.createElement('span', null, 'Ж'),
                React.createElement('span', { className: 'mpc-dim' }, 'вр/пол/суп'),
                React.createElement('span', null, 'Кл'),
                React.createElement('span', null, 'ГИ'),
                React.createElement('span', null, 'Вр')
              ),
              (() => {
                const itemTotals = {
                  kcal: scale(per.kcal100, G),
                  carbs: scale(per.carbs100, G),
                  simple: scale(per.simple100, G),
                  complex: scale(per.complex100, G),
                  prot: scale(per.prot100, G),
                  fat: scale(per.fat100, G),
                  bad: scale(per.bad100, G),
                  good: scale(per.good100, G),
                  trans: scale(per.trans100 || 0, G),
                  fiber: scale(per.fiber100, G),
                  gi: giVal || 0,
                  harm: harmVal || 0
                };
                return React.createElement('div', { className: 'mpc-grid mpc-values' },
                  React.createElement('span', { title: getNutrientTooltip('kcal', itemTotals.kcal, itemTotals), style: { color: getNutrientColor('kcal', itemTotals.kcal, itemTotals), fontWeight: getNutrientColor('kcal', itemTotals.kcal, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.kcal)),
                  React.createElement('span', { title: getNutrientTooltip('carbs', itemTotals.carbs, itemTotals), style: { color: getNutrientColor('carbs', itemTotals.carbs, itemTotals), fontWeight: getNutrientColor('carbs', itemTotals.carbs, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.carbs)),
                  React.createElement('span', { className: 'mpc-dim' },
                    React.createElement('span', { title: getNutrientTooltip('simple', itemTotals.simple, itemTotals), style: { color: getNutrientColor('simple', itemTotals.simple, itemTotals), fontWeight: getNutrientColor('simple', itemTotals.simple, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.simple)),
                    '/',
                    React.createElement('span', { title: getNutrientTooltip('complex', itemTotals.complex, itemTotals), style: { color: getNutrientColor('complex', itemTotals.complex, itemTotals), cursor: 'help' } }, Math.round(itemTotals.complex))
                  ),
                  React.createElement('span', { title: getNutrientTooltip('prot', itemTotals.prot, itemTotals), style: { color: getNutrientColor('prot', itemTotals.prot, itemTotals), fontWeight: getNutrientColor('prot', itemTotals.prot, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.prot)),
                  React.createElement('span', { title: getNutrientTooltip('fat', itemTotals.fat, itemTotals), style: { color: getNutrientColor('fat', itemTotals.fat, itemTotals), fontWeight: getNutrientColor('fat', itemTotals.fat, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.fat)),
                  React.createElement('span', { className: 'mpc-dim' },
                    React.createElement('span', { title: getNutrientTooltip('bad', itemTotals.bad, itemTotals), style: { color: getNutrientColor('bad', itemTotals.bad, itemTotals), fontWeight: getNutrientColor('bad', itemTotals.bad, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.bad)),
                    '/',
                    React.createElement('span', { title: getNutrientTooltip('good', itemTotals.good, itemTotals), style: { color: getNutrientColor('good', itemTotals.good, itemTotals), fontWeight: getNutrientColor('good', itemTotals.good, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.good)),
                    '/',
                    React.createElement('span', { title: getNutrientTooltip('trans', itemTotals.trans, itemTotals), style: { color: getNutrientColor('trans', itemTotals.trans, itemTotals), fontWeight: getNutrientColor('trans', itemTotals.trans, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.trans))
                  ),
                  React.createElement('span', { title: getNutrientTooltip('fiber', itemTotals.fiber, itemTotals), style: { color: getNutrientColor('fiber', itemTotals.fiber, itemTotals), fontWeight: getNutrientColor('fiber', itemTotals.fiber, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.fiber)),
                  React.createElement('span', { title: getNutrientTooltip('gi', itemTotals.gi, itemTotals), style: { color: getNutrientColor('gi', itemTotals.gi, itemTotals), fontWeight: getNutrientColor('gi', itemTotals.gi, itemTotals) ? 600 : 400, cursor: 'help' } }, giVal != null ? Math.round(giVal) : '-'),
                  React.createElement('span', { title: getNutrientTooltip('harm', itemTotals.harm, itemTotals), style: { color: getNutrientColor('harm', itemTotals.harm, itemTotals), fontWeight: getNutrientColor('harm', itemTotals.harm, itemTotals) ? 600 : 400, cursor: 'help' } }, harmVal != null ? fmtVal('harm', harmVal) : '-')
                );
              })()
            );
          }),
          
          // Фотографии приёма (если есть)
          (meal.photos && meal.photos.length > 0) && React.createElement('div', { className: 'meal-photos' },
            meal.photos.map((photo, photoIndex) => {
              // Используем url если загружено, иначе data (для pending)
              const photoSrc = photo.url || photo.data;
              if (!photoSrc) return null;
              
              // Форматируем timestamp
              const timeStr = photo.timestamp 
                ? new Date(photo.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                : null;
              
              // Удаление фото
              const handleDelete = async (e) => {
                e.stopPropagation();
                if (!confirm('Удалить это фото?')) return;
                
                // Удаляем из Supabase Storage если загружено
                if (photo.path && photo.uploaded && window.HEYS?.cloud?.deletePhoto) {
                  try {
                    await window.HEYS.cloud.deletePhoto(photo.path);
                  } catch (err) {
                    console.warn('[MealCard] Failed to delete from storage:', err);
                  }
                }
                
                setDay((prevDay = {}) => {
                  const meals = (prevDay.meals || []).map((m, i) => {
                    if (i !== mealIndex || !m.photos) return m;
                    return { ...m, photos: m.photos.filter(p => p.id !== photo.id) };
                  });
                  return { ...prevDay, meals, updatedAt: Date.now() };
                });
              };
              
              // Собираем классы
              let thumbClass = 'meal-photo-thumb';
              if (photo.pending) thumbClass += ' pending';
              if (photo.uploading) thumbClass += ' uploading';
              
              return React.createElement(LazyPhotoThumb, { 
                key: photo.id || photoIndex,
                photo,
                photoSrc,
                thumbClass,
                timeStr,
                mealIndex,
                photoIndex,
                mealPhotos: meal.photos,
                handleDelete,
                setDay
              });
            })
          ),
  
          // Инсулиновая волна в карточке приёма — единый блок
          showWaveButton && React.createElement('div', {
            className: 'meal-wave-block' + (waveExpanded ? ' expanded' : ''),
            style: {
              marginTop: '10px',
              background: 'transparent',
              borderRadius: '12px',
              overflow: 'hidden'
            }
          },
            // Заголовок (кликабельный toggle)
            React.createElement('div', {
              className: 'meal-wave-toggle',
              onClick: toggleWave,
              style: {
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 12px',
                cursor: 'pointer',
                fontSize: '13px', fontWeight: 600,
                color: hasAnyOverlap ? '#b91c1c' : '#1f2937'
              }
            },
              React.createElement('span', null,
                `📉 Волна ${(currentWave.duration / 60).toFixed(1)}ч • ` + (
                  hasAnyOverlap
                    ? `⚠️ перехлёст ${formatMinutes(overlapMinutes)}`
                    : nextWave
                      ? `✅ липолиз ${formatMinutes(lipolysisGapNext)}`
                      : '🟢 последний приём'
                )
              ),
              // Кнопка "расчёт" между названием и стрелочкой
              React.createElement('button', {
                onClick: (e) => {
                  e.stopPropagation();
                  setShowWaveCalcPopup(true);
                },
                style: {
                  background: 'rgba(59, 130, 246, 0.12)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '3px 8px',
                  fontSize: '11px',
                  color: '#3b82f6',
                  fontWeight: 500,
                  cursor: 'pointer',
                  marginLeft: '8px'
                }
              }, 'расчёт'),
              React.createElement('span', { className: 'toggle-arrow' }, waveExpanded ? '▴' : '▾')
            ),
            // Expand-секция (график) — внутри того же блока
            waveExpanded && InsulinWave.MealWaveExpandSection && React.createElement(InsulinWave.MealWaveExpandSection, {
              waveData: currentWave,
              prevWave,
              nextWave
            }),
            
            // ⚡ v3.2.0: Предупреждение о реактивной гипогликемии
            (() => {
              const IW = HEYS.InsulinWave;
              if (!IW || !IW.calculateHypoglycemiaRisk) return null;
              
              const hypoRisk = IW.calculateHypoglycemiaRisk(meal, pIndex, getProductFromItem);
              if (!hypoRisk.hasRisk) return null;
              
              // Проверяем: мы в окне риска (2-4 часа после еды)?
              const mealMinutes = IW.utils?.timeToMinutes?.(meal.time) || 0;
              const now = new Date();
              const nowMinutes = now.getHours() * 60 + now.getMinutes();
              let minutesSinceMeal = nowMinutes - mealMinutes;
              if (minutesSinceMeal < 0) minutesSinceMeal += 24 * 60;
              
              const inRiskWindow = minutesSinceMeal >= hypoRisk.riskWindow.start && minutesSinceMeal <= hypoRisk.riskWindow.end;
              
              return React.createElement('div', {
                className: 'hypoglycemia-warning',
                style: {
                  margin: '8px 12px 10px 12px',
                  padding: '8px 10px',
                  background: inRiskWindow ? 'rgba(249,115,22,0.12)' : 'rgba(234,179,8,0.1)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: inRiskWindow ? '#ea580c' : '#ca8a04'
                }
              },
                React.createElement('div', { style: { fontWeight: '600', marginBottom: '2px' } },
                  inRiskWindow 
                    ? '⚡ Сейчас возможен спад энергии'
                    : '⚡ Высокий GI — риск "сахарных качелей"'
                ),
                React.createElement('div', { style: { fontSize: '11px', color: '#64748b' } },
                  inRiskWindow
                    ? 'Это нормально! Съешь орехи или белок если устал'
                    : `GI ~${Math.round(hypoRisk.details.avgGI)}, белок ${Math.round(hypoRisk.details.totalProtein)}г — через 2-3ч может "накрыть"`
                )
              );
            })()
          ),
          
          // Компактный блок: бейдж качества + оценки + удаление (перенесено под инсулиновую волну)
          React.createElement('div', { 
            className: 'meal-meta-row',
            style: {
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '4px',
              padding: '8px 0'
            }
          },
            // Бейдж качества приёма (кликабельный для попапа)
            mealQuality && React.createElement('button', {
              className: 'meal-quality-badge',
              onClick: (e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setMealQualityPopup({
                  meal,
                  quality: mealQuality,
                  mealTypeInfo,
                  x: rect.left + rect.width / 2,
                  y: rect.bottom + 8
                });
              },
              title: 'Качество приёма — нажми для деталей',
              style: {
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '2px 6px',
                borderRadius: '8px',
                border: 'none',
                background: mealQuality.color + '20',
                color: mealQuality.color,
                cursor: 'pointer',
                marginRight: '4px',
                transition: 'transform 0.15s, box-shadow 0.15s',
                flexShrink: 0,
                minWidth: '28px'
              }
            },
              React.createElement('span', { style: { fontSize: '12px' } }, 
                mealQuality.score >= 80 ? '⭐' : mealQuality.score >= 50 ? '📊' : '⚠️'
              ),
              React.createElement('span', { style: { fontSize: '11px', fontWeight: 600 } }, mealQuality.score)
            ),
            // На мобильных — оценки вертикальные (эмодзи сверху, значение снизу)
            isMobile
              ? React.createElement('div', {
                  className: 'mobile-mood-btn',
                  onClick: () => openMoodEditor(mealIndex),
                  title: 'Изменить оценки',
                  style: {
                    display: 'flex',
                    gap: '6px',
                    cursor: 'pointer'
                  }
                },
                  hasRatings ? React.createElement(React.Fragment, null,
                    moodEmoji && React.createElement('div', { 
                      style: { 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center',
                        padding: '2px 6px',
                        borderRadius: '8px',
                        background: '#fef3c7',
                        minWidth: '28px'
                      } 
                    }, 
                      React.createElement('span', { style: { fontSize: '12px' } }, moodEmoji),
                      React.createElement('span', { style: { fontSize: '11px', fontWeight: 600, color: '#b45309' } }, moodVal)
                    ),
                    wellbeingEmoji && React.createElement('div', { 
                      style: { 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center',
                        padding: '2px 6px',
                        borderRadius: '8px',
                        background: '#dcfce7',
                        minWidth: '28px'
                      } 
                    }, 
                      React.createElement('span', { style: { fontSize: '12px' } }, wellbeingEmoji),
                      React.createElement('span', { style: { fontSize: '11px', fontWeight: 600, color: '#15803d' } }, wellbeingVal)
                    ),
                    stressEmoji && React.createElement('div', { 
                      style: { 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center',
                        padding: '2px 6px',
                        borderRadius: '8px',
                        background: '#fce7f3',
                        minWidth: '28px'
                      } 
                    }, 
                      React.createElement('span', { style: { fontSize: '12px' } }, stressEmoji),
                      React.createElement('span', { style: { fontSize: '11px', fontWeight: 600, color: '#be185d' } }, stressVal)
                    )
                  ) : React.createElement('span', { 
                    style: { 
                      fontSize: '11px', 
                      color: '#94a3b8',
                      padding: '4px 8px',
                      borderRadius: '8px',
                      background: 'var(--bg-secondary, #f1f5f9)'
                    } 
                  }, '+ оценки')
                )
              // На десктопе — время + inputs для оценок
              : React.createElement(React.Fragment, null,
                  React.createElement('input', { className: 'compact-input time', type: 'time', title: 'Время приёма', value: meal.time || '', onChange: e => onChangeTime(mealIndex, e.target.value) }),
                  React.createElement('span', { className: 'meal-meta-field' }, '😊', React.createElement('input', { className: 'compact-input tiny', type: 'number', min: 1, max: 10, placeholder: '—', title: 'Настроение', value: meal.mood || '', onChange: e => onChangeMood(mealIndex, +e.target.value || '') })),
                  React.createElement('span', { className: 'meal-meta-field' }, '💪', React.createElement('input', { className: 'compact-input tiny', type: 'number', min: 1, max: 10, placeholder: '—', title: 'Самочувствие', value: meal.wellbeing || '', onChange: e => onChangeWellbeing(mealIndex, +e.target.value || '') })),
                  React.createElement('span', { className: 'meal-meta-field' }, '😰', React.createElement('input', { className: 'compact-input tiny', type: 'number', min: 1, max: 10, placeholder: '—', title: 'Стресс', value: meal.stress || '', onChange: e => onChangeStress(mealIndex, +e.target.value || '') }))
                ),
            // Плашка "Общее КБЖУ" (голубая, компактная)
            (meal.items || []).length > 0 && React.createElement('button', {
              className: 'meal-totals-badge',
              onClick: (e) => {
                e.stopPropagation();
                setTotalsExpanded(!totalsExpanded);
              },
              title: 'Показать итоговые КБЖУ приёма',
              style: {
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                padding: '4px 8px',
                borderRadius: '12px',
                border: 'none',
                background: '#dbeafe',
                color: '#1d4ed8',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                marginRight: '4px',
                transition: 'transform 0.15s, background 0.15s',
                flexShrink: 0
              }
            },
              'КБЖУ',
              React.createElement('span', { style: { fontSize: '10px', opacity: 0.7, marginLeft: '2px' } }, totalsExpanded ? '▴' : '▾')
            ),
            // Плашка "Советы" с бейджем количества (между оценками и удалением)
            optimizerRecsCount > 0 && React.createElement('button', {
              className: 'meal-optimizer-badge',
              onClick: () => setOptimizerPopupOpen(!optimizerPopupOpen),
              title: 'Советы по улучшению приёма',
              style: {
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                borderRadius: '12px',
                border: 'none',
                background: '#fef3c7',
                color: '#b45309',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                marginRight: '4px',
                transition: 'transform 0.15s, background 0.15s',
                flexShrink: 0
              }
            },
              'Советы',
              React.createElement('span', {
                style: {
                  background: '#f59e0b',
                  color: '#fff',
                  borderRadius: '8px',
                  padding: '0 5px',
                  fontSize: '10px',
                  fontWeight: 700,
                  marginLeft: '3px',
                  lineHeight: '16px'
                }
              }, optimizerRecsCount),
              React.createElement('span', { style: { fontSize: '10px', opacity: 0.7, marginLeft: '2px' } }, optimizerPopupOpen ? '▴' : '▾')
            ),
            React.createElement('button', { 
              className: 'meal-delete-btn', 
              onClick: () => onRemoveMeal(mealIndex), 
              title: 'Удалить приём',
              style: {
                padding: '4px 6px',
                fontSize: '14px',
                lineHeight: 1,
                flexShrink: 0
              }
            }, '🗑')
          ),
          
          // === Раскрывающийся блок "Общее КБЖУ" ===
          totalsExpanded && (meal.items || []).length > 0 && React.createElement('div', {
            className: 'mpc-totals-wrap',
            style: {
              marginTop: '10px',
              padding: '12px',
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(96, 165, 250, 0.05) 100%)',
              borderRadius: '12px',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              animation: 'slideDown 0.2s ease-out'
            }
          },
            React.createElement('div', { className: 'mpc-grid mpc-header' },
              React.createElement('span', null, 'ккал'),
              React.createElement('span', null, 'У'),
              React.createElement('span', { className: 'mpc-dim' }, 'пр/сл'),
              React.createElement('span', null, 'Б'),
              React.createElement('span', null, 'Ж'),
              React.createElement('span', { className: 'mpc-dim' }, 'вр/пол/суп'),
              React.createElement('span', null, 'Кл'),
              React.createElement('span', null, 'ГИ'),
              React.createElement('span', null, 'Вр')
            ),
            React.createElement('div', { className: 'mpc-grid mpc-totals-values' },
              React.createElement('span', { title: getNutrientTooltip('kcal', totals.kcal, totals), style: { color: getNutrientColor('kcal', totals.kcal, totals), fontWeight: getNutrientColor('kcal', totals.kcal, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.kcal)),
              React.createElement('span', { title: getNutrientTooltip('carbs', totals.carbs, totals), style: { color: getNutrientColor('carbs', totals.carbs, totals), fontWeight: getNutrientColor('carbs', totals.carbs, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.carbs)),
              React.createElement('span', { className: 'mpc-dim' }, 
                React.createElement('span', { title: getNutrientTooltip('simple', totals.simple, totals), style: { color: getNutrientColor('simple', totals.simple, totals), fontWeight: getNutrientColor('simple', totals.simple, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.simple || 0)),
                '/',
                React.createElement('span', { title: getNutrientTooltip('complex', totals.complex, totals), style: { color: getNutrientColor('complex', totals.complex, totals), cursor: 'help' } }, Math.round(totals.complex || 0))
              ),
              React.createElement('span', { title: getNutrientTooltip('prot', totals.prot, totals), style: { color: getNutrientColor('prot', totals.prot, totals), fontWeight: getNutrientColor('prot', totals.prot, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.prot)),
              React.createElement('span', { title: getNutrientTooltip('fat', totals.fat, totals), style: { color: getNutrientColor('fat', totals.fat, totals), fontWeight: getNutrientColor('fat', totals.fat, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.fat)),
              React.createElement('span', { className: 'mpc-dim' }, 
                React.createElement('span', { title: getNutrientTooltip('bad', totals.bad, totals), style: { color: getNutrientColor('bad', totals.bad, totals), fontWeight: getNutrientColor('bad', totals.bad, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.bad || 0)),
                '/',
                React.createElement('span', { title: getNutrientTooltip('good', totals.good, totals), style: { color: getNutrientColor('good', totals.good, totals), fontWeight: getNutrientColor('good', totals.good, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.good || 0)),
                '/',
                React.createElement('span', { title: getNutrientTooltip('trans', totals.trans, totals), style: { color: getNutrientColor('trans', totals.trans, totals), fontWeight: getNutrientColor('trans', totals.trans, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.trans || 0))
              ),
              React.createElement('span', { title: getNutrientTooltip('fiber', totals.fiber, totals), style: { color: getNutrientColor('fiber', totals.fiber, totals), fontWeight: getNutrientColor('fiber', totals.fiber, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.fiber || 0)),
              React.createElement('span', { title: getNutrientTooltip('gi', totals.gi, totals), style: { color: getNutrientColor('gi', totals.gi, totals), fontWeight: getNutrientColor('gi', totals.gi, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.gi || 0)),
              React.createElement('span', { title: getNutrientTooltip('harm', totals.harm, totals), style: { color: getNutrientColor('harm', totals.harm, totals), fontWeight: getNutrientColor('harm', totals.harm, totals) ? 600 : 400, cursor: 'help' } }, fmtVal('harm', totals.harm || 0))
            )
          ),
          
          // === MealOptimizer: Раскрывающийся блок советов ===
          optimizerPopupOpen && optimizerRecsCount > 0 && HEYS.MealOptimizer && React.createElement('div', {
            className: 'meal-optimizer-expanded',
            style: {
              marginTop: '12px',
              padding: '12px',
              background: 'linear-gradient(135deg, rgba(245, 158, 0, 0.08) 0%, rgba(251, 191, 36, 0.05) 100%)',
              borderRadius: '12px',
              border: '1px solid rgba(245, 158, 0, 0.2)',
              animation: 'slideDown 0.2s ease-out'
            }
          }, React.createElement(MealOptimizerSection, {
            meal,
            totals,
            dayData: dayData || {},
            profile: profile || {},
            products: products || [],
            pIndex,
            mealIndex,
            addProductToMeal
          })),
          
          // Popup расчёта волны
          showWaveCalcPopup && currentWave && React.createElement('div', {
            className: 'wave-details-overlay',
            onClick: (e) => { if (e.target === e.currentTarget) setShowWaveCalcPopup(false); },
            style: {
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.5)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px'
            }
          },
            React.createElement('div', {
              className: 'wave-details-popup',
              style: {
                background: 'var(--card, #fff)',
                borderRadius: '16px',
                padding: '20px',
                maxWidth: '360px',
                width: '100%',
                maxHeight: '80vh',
                overflowY: 'auto',
                boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
              }
            },
              // Заголовок
              React.createElement('div', {
                style: { 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  marginBottom: '16px'
                }
              },
                React.createElement('h3', { 
                  style: { margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text, #1f2937)' }
                }, 'Расчёт волны'),
                React.createElement('button', {
                  onClick: () => setShowWaveCalcPopup(false),
                  style: {
                    background: 'none', border: 'none', fontSize: '20px', 
                    cursor: 'pointer', color: '#9ca3af', padding: '4px'
                  }
                }, '×')
              ),
              
              // Итоговая длина волны
              React.createElement('div', {
                style: {
                  background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                  borderRadius: '12px',
                  padding: '16px',
                  marginBottom: '16px',
                  textAlign: 'center',
                  color: '#fff'
                }
              },
                React.createElement('div', { style: { fontSize: '12px', opacity: 0.9, marginBottom: '4px' } }, 
                  'Длина волны'
                ),
                React.createElement('div', { style: { fontSize: '28px', fontWeight: 700 } }, 
                  (currentWave.waveHours || currentWave.duration / 60).toFixed(1) + 'ч'
                ),
                React.createElement('div', { style: { fontSize: '11px', opacity: 0.8, marginTop: '4px' } }, 
                  currentWave.timeDisplay + ' → ' + currentWave.endTimeDisplay
                )
              ),
              
              // Формула
              React.createElement('div', {
                style: {
                  background: 'var(--bg-secondary, #f8fafc)',
                  borderRadius: '10px',
                  padding: '12px',
                  marginBottom: '16px',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  color: '#64748b',
                  textAlign: 'center'
                }
              }, 'База × Множитель = ' + (currentWave.baseWaveHours || 3).toFixed(1) + 'ч × ' + 
                 (currentWave.finalMultiplier || 1).toFixed(2) + ' = ' +
                 (currentWave.waveHours || currentWave.duration / 60).toFixed(1) + 'ч'
              ),
              
              // Факторы еды
              React.createElement('div', { style: { marginBottom: '12px' } },
                React.createElement('div', { 
                  style: { fontSize: '12px', fontWeight: 600, color: 'var(--text, #1f2937)', marginBottom: '8px' }
                }, '🍽️ Факторы еды'),
                
                // GI
                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
                  React.createElement('span', { style: { color: '#64748b' } }, 'ГИ'),
                  React.createElement('span', { style: { fontWeight: 500 } }, Math.round(currentWave.gi || 0))
                ),
                // GL
                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
                  React.createElement('span', { style: { color: '#64748b' } }, 'GL (нагрузка)'),
                  React.createElement('span', { style: { fontWeight: 500, color: currentWave.gl < 10 ? '#22c55e' : currentWave.gl > 20 ? '#ef4444' : '#1f2937' } }, 
                    (currentWave.gl || 0).toFixed(1)
                  )
                ),
                // Белок
                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
                  React.createElement('span', { style: { color: '#64748b' } }, 'Белок'),
                  React.createElement('span', { style: { fontWeight: 500 } }, Math.round(currentWave.protein || 0) + 'г')
                ),
                // Клетчатка
                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
                  React.createElement('span', { style: { color: '#64748b' } }, 'Клетчатка'),
                  React.createElement('span', { style: { fontWeight: 500, color: currentWave.fiber >= 5 ? '#22c55e' : '#1f2937' } }, 
                    Math.round(currentWave.fiber || 0) + 'г'
                  )
                ),
                // Жиры
                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
                  React.createElement('span', { style: { color: '#64748b' } }, 'Жиры'),
                  React.createElement('span', { style: { fontWeight: 500 } }, Math.round(currentWave.fat || 0) + 'г')
                ),
                // Углеводы
                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0' } },
                  React.createElement('span', { style: { color: '#64748b' } }, 'Углеводы'),
                  React.createElement('span', { style: { fontWeight: 500 } }, Math.round(currentWave.carbs || 0) + 'г')
                )
              ),
              
              // Дневные факторы
              React.createElement('div', { style: { marginBottom: '12px' } },
                React.createElement('div', { 
                  style: { fontSize: '12px', fontWeight: 600, color: 'var(--text, #1f2937)', marginBottom: '8px' }
                }, '⏰ Дневные факторы'),
                
                // Циркадный ритм
                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
                  React.createElement('span', { style: { color: '#64748b' } }, 'Время суток'),
                  React.createElement('span', { style: { fontWeight: 500, color: currentWave.circadianMultiplier > 1.05 ? '#f97316' : '#1f2937' } }, 
                    '×' + (currentWave.circadianMultiplier || 1).toFixed(2)
                  )
                ),
                // Активность
                currentWave.activityBonus && currentWave.activityBonus !== 0 && React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0' } },
                  React.createElement('span', { style: { color: '#22c55e' } }, '🏃 Активность'),
                  React.createElement('span', { style: { fontWeight: 500, color: '#22c55e' } }, 
                    (currentWave.activityBonus * 100).toFixed(0) + '%'
                  )
                )
              ),
              
              // Кнопка закрытия
              React.createElement('button', {
                onClick: () => setShowWaveCalcPopup(false),
                style: {
                  width: '100%',
                  background: '#3b82f6',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '12px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  marginTop: '8px'
                }
              }, 'Закрыть')
            )
          )
        )
      );
    }, (prevProps, nextProps) => {
      // Custom comparison: ререндерим если изменились важные поля meal
      if (prevProps.meal !== nextProps.meal) return false;
      if (prevProps.meal?.mealType !== nextProps.meal?.mealType) return false;
      if (prevProps.meal?.name !== nextProps.meal?.name) return false;
      if (prevProps.meal?.time !== nextProps.meal?.time) return false;
      if (prevProps.meal?.items?.length !== nextProps.meal?.items?.length) return false;
      if (prevProps.meal?.photos?.length !== nextProps.meal?.photos?.length) return false;
      if (prevProps.mealIndex !== nextProps.mealIndex) return false;
      if (prevProps.displayIndex !== nextProps.displayIndex) return false;
      if (prevProps.isExpanded !== nextProps.isExpanded) return false;
      if (prevProps.allMeals !== nextProps.allMeals) return false;
      return true;
    });
    
    // Export to HEYS namespace
    HEYS.dayComponents = HEYS.dayComponents || {};
    HEYS.dayComponents.MealCard = MealCard;
    
  */
})(window);
