// heys_day_meals_list.js — Meals list rendering component
// Phase 13A of HEYS Day v12 refactoring
// Extracted from heys_day_v12.js lines 4,794-4,896
(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  
  // Dependencies with fallbacks
  const U = HEYS.dayUtils || {};
  const warnMissing = (name) => console.warn(`[heys_day_meals_list] Missing dependency: ${name}`);
  const MealCard = HEYS.dayComponents?.MealCard;
  
  /**
   * Render meals list with number badges and current meal indicator
   * @param {Object} params - Rendering parameters
   * @returns {Array} Array of React elements
   */
  function renderMealsList(params) {
    const {
      sortedMealsForDisplay,
      day,
      products,
      pIndex,
      date,
      setDay,
      isMobile,
      isMealExpanded,
      isMealStale,
      toggleMealExpand,
      changeMealType,
      updateMealTime,
      changeMealMood,
      changeMealWellbeing,
      changeMealStress,
      removeMeal,
      openEditGramsModal,
      openTimeEditor,
      openMoodEditor,
      setGrams,
      removeItem,
      isNewItem,
      optimum,
      setMealQualityPopup,
      addProductToMeal,
      prof,
      insulinWaveData
    } = params;
    
    if (!sortedMealsForDisplay || !Array.isArray(sortedMealsForDisplay)) {
      return [];
    }
    
    if (!MealCard) {
      warnMissing('MealCard component');
      return [];
    }
    
    return sortedMealsForDisplay.map((sortedMeal, displayIndex) => {
      const mi = (day.meals || []).findIndex(m => m.id === sortedMeal.id);
      if (mi === -1) {
        console.warn('[HEYS] MealCard: meal not found in day.meals', sortedMeal.id);
        return null;
      }
      
      // Берём актуальный meal из day.meals, а не из sorted (который может быть stale)
      const meal = day.meals[mi];
      const isExpanded = isMealExpanded(mi, (day.meals || []).length, day.meals, displayIndex);
      // Номер приёма (1-based, хронологический: первый по времени = 1)
      const mealNumber = sortedMealsForDisplay.length - displayIndex;
      const isFirst = displayIndex === 0;
      
      // Key включает mealType чтобы форсировать перерендер при смене типа
      const isCurrentMeal = isFirst && !isMealStale(meal);
      
      return React.createElement('div', {
        key: meal.id + '_' + (meal.mealType || 'auto'),
        className: 'meal-with-number',
        style: {
          marginTop: isFirst ? '0' : '24px'
        }
      },
        // Номер приёма над карточкой + "ТЕКУЩИЙ" для активного
        React.createElement('div', {
          className: 'meal-number-header',
          style: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '6px',
            gap: '4px'
          }
        },
          React.createElement('div', {
            className: 'meal-number-badge' + (isCurrentMeal ? ' meal-number-badge--current' : ''),
            style: {
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: isCurrentMeal 
                ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' 
                : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
              fontWeight: '700',
              boxShadow: isCurrentMeal 
                ? '0 2px 8px rgba(34,197,94,0.35)' 
                : '0 2px 8px rgba(59,130,246,0.35)'
            }
          }, mealNumber),
          // Надпись "ТЕКУЩИЙ ПРИЁМ" для активного приёма
          isCurrentMeal && React.createElement('span', {
            className: 'meal-current-label',
            style: {
              fontSize: '14px',
              fontWeight: '800',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              color: '#22c55e',
              marginTop: '4px'
            }
          }, 'ТЕКУЩИЙ ПРИЁМ')
        ),
        // Карточка приёма
        React.createElement(MealCard, {
          meal,
          mealIndex: mi,
          displayIndex,
          products,
          pIndex,
          date,
          setDay,
          isMobile,
          isExpanded,
          onToggleExpand: toggleMealExpand,
          onChangeMealType: changeMealType,
          onChangeTime: updateMealTime,
          onChangeMood: changeMealMood,
          onChangeWellbeing: changeMealWellbeing,
          onChangeStress: changeMealStress,
          onRemoveMeal: removeMeal,
          openEditGramsModal,
          openTimeEditor,
          openMoodEditor,
          setGrams,
          removeItem,
          isMealStale,
          allMeals: day.meals,
          isNewItem,
          optimum,
          setMealQualityPopup,
          addProductToMeal,
          dayData: day,
          profile: prof,
          insulinWaveData
        })
      );
    });
  }
  
  /**
   * Render empty state when no meals
   * @param {Object} params - Parameters
   * @returns {React.Element} Empty state element
   */
  function renderEmptyMealsState(params) {
    const { addMeal, isMobile } = params;
    
    return React.createElement('div', {
      className: 'empty-meals-state',
      style: {
        textAlign: 'center',
        padding: '40px 20px',
        color: '#64748b'
      }
    },
      React.createElement('div', {
        style: { fontSize: '48px', marginBottom: '16px' }
      }, '🍽️'),
      React.createElement('div', {
        style: { fontSize: '18px', fontWeight: '600', marginBottom: '8px' }
      }, 'Нет приёмов пищи'),
      React.createElement('div', {
        style: { fontSize: '14px', marginBottom: '24px' }
      }, 'Добавь свой первый приём пищи'),
      addMeal && React.createElement('button', {
        className: 'button-primary',
        onClick: addMeal,
        style: {
          padding: '12px 24px',
          fontSize: '16px'
        }
      }, '➕ Добавить приём')
    );
  }
  
  // Export module
  HEYS.dayMealsList = {
    renderMealsList,
    renderEmptyMealsState
  };
  
})(window);
