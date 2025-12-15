/**
 * heys_widgets_ui_v1.js
 * UI компоненты: Каталог, Настройки, WidgetsTab
 * Version: 1.1.0
 * Created: 2025-12-15
 * 
 * v1.1.0:
 * - Поддержка pointer events для drag & drop
 * - Long press (500ms) для входа в edit mode
 * - Ghost элемент и placeholder preview
 * - Undo/Redo кнопки в header
 */
(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.Widgets = HEYS.Widgets || {};
  
  const React = global.React;
  const { useState, useEffect, useMemo, useCallback, useRef } = React || {};
  
  // === Widget Card Component ===
  function WidgetCard({ widget, isEditMode, onRemove, onSettings }) {
    const registry = HEYS.Widgets.registry;
    const widgetType = registry?.getType(widget.type);
    const category = registry?.getCategory(widgetType?.category);
    const elementRef = useRef(null);
    
    // Pointer event handlers for DnD
    const handlePointerDown = useCallback((e) => {
      HEYS.Widgets.dnd?.handlePointerDown?.(widget.id, e, elementRef.current);
    }, [widget.id]);
    
    const handleClick = useCallback(() => {
      if (!isEditMode) {
        HEYS.Widgets.emit('widget:click', { widget });
      }
    }, [isEditMode, widget]);
    
    const handleRemoveClick = useCallback((e) => {
      e.stopPropagation();
      onRemove?.(widget.id);
    }, [widget.id, onRemove]);
    
    const handleSettingsClick = useCallback((e) => {
      e.stopPropagation();
      onSettings?.(widget);
    }, [widget, onSettings]);
    
    const sizeClass = `widget--${widget.size}`;
    const typeClass = `widget--${widget.type}`;
    
    return React.createElement('div', {
      ref: elementRef,
      className: `widget ${sizeClass} ${typeClass} ${isEditMode ? 'widget--editing' : ''}`,
      'data-widget-id': widget.id,
      'data-widget-type': widget.type,
      style: {
        gridColumn: `span ${widget.cols}`,
        gridRow: `span ${widget.rows}`,
        touchAction: isEditMode ? 'none' : 'auto' // Disable browser scrolling during drag
      },
      onClick: handleClick,
      onPointerDown: handlePointerDown
    },
      // Widget Header
      React.createElement('div', { className: 'widget__header' },
        React.createElement('span', { className: 'widget__icon' }, widgetType?.icon || '📊'),
        React.createElement('span', { className: 'widget__title' }, widgetType?.name || widget.type)
      ),
      
      // Widget Content (placeholder - будет заменён конкретными виджетами)
      React.createElement('div', { className: 'widget__content' },
        React.createElement(WidgetContent, { widget, widgetType })
      ),
      
      // Edit Mode: Delete button
      isEditMode && React.createElement('button', {
        className: 'widget__delete-btn',
        onClick: handleRemoveClick,
        title: 'Удалить'
      }, '✕'),
      
      // Edit Mode: Settings button (optional)
      isEditMode && widgetType?.settings && React.createElement('button', {
        className: 'widget__settings-btn',
        onClick: handleSettingsClick,
        title: 'Настройки'
      }, '⚙️')
    );
  }
  
  // === Widget Content Component (renders actual widget data) ===
  function WidgetContent({ widget, widgetType }) {
    // State для данных виджета
    const [data, setData] = useState(() => 
      HEYS.Widgets.data?.getDataForWidget?.(widget) || {}
    );
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    
    // Подписка на обновления данных
    useEffect(() => {
      // Первоначальная загрузка
      const loadData = () => {
        try {
          const newData = HEYS.Widgets.data?.getDataForWidget?.(widget) || {};
          setData(newData);
          setError(null);
        } catch (e) {
          console.error('[Widget] Error loading data:', e);
          setError(e.message);
        }
        setLoading(false);
      };
      
      loadData();
      
      // Подписка на события обновления данных
      const unsubData = HEYS.Widgets.on?.('data:updated', loadData);
      
      // Подписка на глобальные события HEYS (meal:added, water:added, etc.)
      const heysEvents = ['day:updated', 'meal:added', 'water:added', 'profile:updated'];
      heysEvents.forEach(evt => {
        if (typeof HEYS.events?.on === 'function') {
          HEYS.events.on(evt, loadData);
        }
      });
      
      return () => {
        unsubData?.();
        heysEvents.forEach(evt => {
          if (typeof HEYS.events?.off === 'function') {
            HEYS.events.off(evt, loadData);
          }
        });
      };
    }, [widget.id, widget.type]);
    
    // Loading state
    if (loading) {
      return React.createElement('div', { className: 'widget__loading' },
        React.createElement('div', { className: 'widget__spinner' })
      );
    }
    
    // Error state
    if (error) {
      return React.createElement('div', { className: 'widget__error' },
        '⚠️ Ошибка загрузки'
      );
    }
    
    // Render based on widget type
    switch (widget.type) {
      case 'calories':
        return React.createElement(CaloriesWidgetContent, { widget, data });
      case 'water':
        return React.createElement(WaterWidgetContent, { widget, data });
      case 'sleep':
        return React.createElement(SleepWidgetContent, { widget, data });
      case 'streak':
        return React.createElement(StreakWidgetContent, { widget, data });
      case 'weight':
        return React.createElement(WeightWidgetContent, { widget, data });
      case 'steps':
        return React.createElement(StepsWidgetContent, { widget, data });
      case 'macros':
        return React.createElement(MacrosWidgetContent, { widget, data });
      case 'insulin':
        return React.createElement(InsulinWidgetContent, { widget, data });
      case 'heatmap':
        return React.createElement(HeatmapWidgetContent, { widget, data });
      case 'cycle':
        return React.createElement(CycleWidgetContent, { widget, data });
      default:
        return React.createElement('div', { className: 'widget__placeholder' },
          widgetType?.icon || '📊',
          React.createElement('span', null, 'Нет данных')
        );
    }
  }
  
  // === Individual Widget Content Components ===
  
  function CaloriesWidgetContent({ widget, data }) {
    const eaten = data.eaten || 0;
    const target = data.target || 2000;
    const pct = target > 0 ? Math.round((eaten / target) * 100) : 0;
    const remaining = Math.max(0, target - eaten);
    
    const getColor = () => {
      if (pct < 50) return 'var(--ratio-crash)';
      if (pct < 75) return 'var(--ratio-low)';
      if (pct < 110) return 'var(--ratio-good)';
      return 'var(--ratio-over)';
    };
    
    return React.createElement('div', { className: 'widget-calories' },
      React.createElement('div', { className: 'widget-calories__value', style: { color: getColor() } },
        eaten.toLocaleString('ru-RU')
      ),
      React.createElement('div', { className: 'widget-calories__label' },
        `из ${target.toLocaleString('ru-RU')} ккал`
      ),
      widget.settings?.showRemaining && remaining > 0 &&
        React.createElement('div', { className: 'widget-calories__remaining' },
          `Осталось: ${remaining.toLocaleString('ru-RU')}`
        ),
      widget.settings?.showPercentage &&
        React.createElement('div', { className: 'widget-calories__pct' }, `${pct}%`)
    );
  }
  
  function WaterWidgetContent({ widget, data }) {
    const drunk = data.drunk || 0;
    const target = data.target || 2000;
    const pct = target > 0 ? Math.round((drunk / target) * 100) : 0;
    const glasses = Math.floor(drunk / 250);
    
    return React.createElement('div', { className: 'widget-water' },
      React.createElement('div', { className: 'widget-water__value' },
        widget.settings?.showGlasses ? `${glasses} 🥛` : `${drunk} мл`
      ),
      React.createElement('div', { className: 'widget-water__progress' },
        React.createElement('div', {
          className: 'widget-water__bar',
          style: { width: `${Math.min(100, pct)}%` }
        })
      ),
      React.createElement('div', { className: 'widget-water__label' }, `${pct}%`)
    );
  }
  
  function SleepWidgetContent({ widget, data }) {
    const hours = data.hours || 0;
    const target = data.target || 8;
    const quality = data.quality;
    
    const getEmoji = () => {
      if (hours >= target) return '😊';
      if (hours >= target - 1) return '😐';
      return '😴';
    };
    
    return React.createElement('div', { className: 'widget-sleep' },
      React.createElement('div', { className: 'widget-sleep__value' },
        `${hours.toFixed(1)}ч ${getEmoji()}`
      ),
      widget.settings?.showTarget &&
        React.createElement('div', { className: 'widget-sleep__label' }, `из ${target}ч`),
      widget.settings?.showQuality && quality &&
        React.createElement('div', { className: 'widget-sleep__quality' }, `Качество: ${quality}/10`)
    );
  }
  
  function StreakWidgetContent({ widget, data }) {
    const current = data.current || 0;
    const max = data.max || 0;
    
    return React.createElement('div', { className: 'widget-streak' },
      React.createElement('div', { className: 'widget-streak__value' },
        widget.settings?.showFlame && current > 0 ? '🔥 ' : '',
        current,
        React.createElement('span', { className: 'widget-streak__days' }, ' дн.')
      ),
      widget.settings?.showMax && max > current &&
        React.createElement('div', { className: 'widget-streak__max' }, `Рекорд: ${max}`)
    );
  }
  
  function WeightWidgetContent({ widget, data }) {
    const current = data.current;
    const goal = data.goal;
    const trend = data.trend;
    
    const getTrendEmoji = () => {
      if (!trend) return '';
      if (trend < -0.1) return ' ↓';
      if (trend > 0.1) return ' ↑';
      return ' →';
    };
    
    return React.createElement('div', { className: 'widget-weight' },
      current ? 
        React.createElement('div', { className: 'widget-weight__value' },
          `${current.toFixed(1)} кг${widget.settings?.showTrend ? getTrendEmoji() : ''}`
        ) :
        React.createElement('div', { className: 'widget-weight__empty' }, 'Нет данных'),
      widget.settings?.showGoal && goal &&
        React.createElement('div', { className: 'widget-weight__goal' }, `Цель: ${goal} кг`)
    );
  }
  
  function StepsWidgetContent({ widget, data }) {
    const steps = data.steps || 0;
    const goal = data.goal || 10000;
    const pct = goal > 0 ? Math.round((steps / goal) * 100) : 0;
    const km = widget.settings?.showKilometers ? (steps * 0.0007).toFixed(1) : null;
    
    return React.createElement('div', { className: 'widget-steps' },
      React.createElement('div', { className: 'widget-steps__value' },
        steps.toLocaleString('ru-RU')
      ),
      km && React.createElement('div', { className: 'widget-steps__km' }, `${km} км`),
      widget.settings?.showGoal &&
        React.createElement('div', { className: 'widget-steps__progress' },
          React.createElement('div', {
            className: 'widget-steps__bar',
            style: { width: `${Math.min(100, pct)}%` }
          })
        )
    );
  }
  
  function MacrosWidgetContent({ widget, data }) {
    const { protein, fat, carbs, proteinTarget, fatTarget, carbsTarget } = data;
    
    const MacroBar = ({ label, value, target, color }) => {
      const pct = target > 0 ? Math.round((value / target) * 100) : 0;
      return React.createElement('div', { className: 'widget-macros__row' },
        React.createElement('span', { className: 'widget-macros__label' }, label),
        React.createElement('div', { className: 'widget-macros__bar-container' },
          React.createElement('div', {
            className: 'widget-macros__bar',
            style: { width: `${Math.min(100, pct)}%`, backgroundColor: color }
          })
        ),
        widget.settings?.showGrams &&
          React.createElement('span', { className: 'widget-macros__value' }, `${Math.round(value)}г`)
      );
    };
    
    return React.createElement('div', { className: 'widget-macros' },
      React.createElement(MacroBar, {
        label: 'Б', value: protein || 0, target: proteinTarget || 100, color: '#ef4444'
      }),
      React.createElement(MacroBar, {
        label: 'Ж', value: fat || 0, target: fatTarget || 70, color: '#eab308'
      }),
      React.createElement(MacroBar, {
        label: 'У', value: carbs || 0, target: carbsTarget || 250, color: '#3b82f6'
      })
    );
  }
  
  function InsulinWidgetContent({ widget, data }) {
    const status = data.status || 'unknown';
    const remaining = data.remaining;
    const phase = data.phase;
    
    const getStatusInfo = () => {
      switch (status) {
        case 'active': return { emoji: '📈', label: 'Волна активна', color: '#f97316' };
        case 'almost': return { emoji: '📉', label: 'Почти закончилась', color: '#eab308' };
        case 'soon': return { emoji: '⏳', label: 'Скоро закончится', color: '#22c55e' };
        case 'lipolysis': return { emoji: '🔥', label: 'Липолиз!', color: '#10b981' };
        default: return { emoji: '❓', label: 'Нет данных', color: '#94a3b8' };
      }
    };
    
    const info = getStatusInfo();
    
    return React.createElement('div', { className: 'widget-insulin' },
      React.createElement('div', { className: 'widget-insulin__status', style: { color: info.color } },
        info.emoji, ' ', info.label
      ),
      widget.settings?.showTimer && remaining > 0 &&
        React.createElement('div', { className: 'widget-insulin__timer' },
          `${remaining} мин`
        ),
      widget.settings?.showPhase && phase &&
        React.createElement('div', { className: 'widget-insulin__phase' }, phase)
    );
  }
  
  function HeatmapWidgetContent({ widget, data }) {
    const days = data.days || [];
    const period = widget.settings?.period || 'week';
    
    return React.createElement('div', { className: 'widget-heatmap' },
      React.createElement('div', { className: `widget-heatmap__grid widget-heatmap__grid--${period}` },
        days.map((day, i) =>
          React.createElement('div', {
            key: i,
            className: `widget-heatmap__cell widget-heatmap__cell--${day.status || 'empty'}`,
            title: day.date
          })
        )
      )
    );
  }
  
  function CycleWidgetContent({ widget, data }) {
    const day = data.day;
    const phase = data.phase;
    
    if (!day) {
      return React.createElement('div', { className: 'widget-cycle__empty' }, 'Нет данных');
    }
    
    return React.createElement('div', { className: 'widget-cycle' },
      React.createElement('div', { className: 'widget-cycle__day' },
        `День ${day}`
      ),
      widget.settings?.showPhase && phase &&
        React.createElement('div', { className: 'widget-cycle__phase' },
          phase.icon, ' ', phase.name
        )
    );
  }
  
  // === Catalog Modal Component ===
  function CatalogModal({ isOpen, onClose, onSelect }) {
    const registry = HEYS.Widgets.registry;
    const categories = registry?.getCategories() || [];
    const availableTypes = registry?.getAvailableTypes() || [];
    
    const [selectedCategory, setSelectedCategory] = useState(null);
    
    useEffect(() => {
      if (isOpen) {
        HEYS.Widgets.emit('catalog:open');
      } else {
        HEYS.Widgets.emit('catalog:close');
      }
    }, [isOpen]);
    
    if (!isOpen) return null;
    
    const filteredTypes = selectedCategory
      ? availableTypes.filter(t => t.category === selectedCategory)
      : availableTypes;
    
    const handleSelect = (type) => {
      console.log('[CatalogModal] Item clicked:', type);
      onSelect?.(type);
      HEYS.Widgets.emit('catalog:select', { type: type.type });
      onClose?.();
    };
    
    console.log('[CatalogModal] Rendering with', filteredTypes.length, 'types');
    
    return React.createElement('div', { className: 'widgets-catalog-overlay', onClick: onClose },
      React.createElement('div', {
        className: 'widgets-catalog',
        onClick: e => e.stopPropagation()
      },
        // Header
        React.createElement('div', { className: 'widgets-catalog__header' },
          React.createElement('h2', null, 'Добавить виджет'),
          React.createElement('button', {
            className: 'widgets-catalog__close',
            onClick: onClose
          }, '✕')
        ),
        
        // Category Filters
        React.createElement('div', { className: 'widgets-catalog__categories' },
          React.createElement('button', {
            className: `widgets-catalog__category ${!selectedCategory ? 'active' : ''}`,
            onClick: () => setSelectedCategory(null)
          }, 'Все'),
          categories.map(cat =>
            React.createElement('button', {
              key: cat.id,
              className: `widgets-catalog__category ${selectedCategory === cat.id ? 'active' : ''}`,
              onClick: () => setSelectedCategory(cat.id)
            }, cat.icon, ' ', cat.label)
          )
        ),
        
        // Widget List
        React.createElement('div', { className: 'widgets-catalog__list' },
          filteredTypes.map(type =>
            React.createElement('div', {
              key: type.type,
              className: 'widgets-catalog__item',
              onClick: () => handleSelect(type)
            },
              React.createElement('div', { className: 'widgets-catalog__item-icon' }, type.icon),
              React.createElement('div', { className: 'widgets-catalog__item-info' },
                React.createElement('div', { className: 'widgets-catalog__item-name' }, type.name),
                React.createElement('div', { className: 'widgets-catalog__item-desc' }, type.description)
              )
            )
          )
        )
      )
    );
  }
  
  // === Settings Modal Component ===
  function SettingsModal({ widget, isOpen, onClose, onSave }) {
    const registry = HEYS.Widgets.registry;
    const widgetType = widget ? registry?.getType(widget.type) : null;
    const [settings, setSettings] = useState({});
    
    useEffect(() => {
      if (widget) {
        setSettings({ ...widget.settings });
      }
    }, [widget]);
    
    if (!isOpen || !widget || !widgetType) return null;
    
    const handleChange = (key, value) => {
      setSettings(prev => ({ ...prev, [key]: value }));
    };
    
    const handleSave = () => {
      onSave?.(widget.id, settings);
      onClose?.();
    };
    
    return React.createElement('div', { className: 'widgets-settings-overlay', onClick: onClose },
      React.createElement('div', {
        className: 'widgets-settings',
        onClick: e => e.stopPropagation()
      },
        React.createElement('div', { className: 'widgets-settings__header' },
          React.createElement('h2', null, `Настройки: ${widgetType.name}`),
          React.createElement('button', {
            className: 'widgets-settings__close',
            onClick: onClose
          }, '✕')
        ),
        
        React.createElement('div', { className: 'widgets-settings__content' },
          // Size selector
          React.createElement('div', { className: 'widgets-settings__field' },
            React.createElement('label', null, 'Размер'),
            React.createElement('div', { className: 'widgets-settings__sizes' },
              widgetType.availableSizes.map(sizeId => {
                const size = registry.getSize(sizeId);
                return React.createElement('button', {
                  key: sizeId,
                  className: `widgets-settings__size ${widget.size === sizeId ? 'active' : ''}`,
                  onClick: () => HEYS.Widgets.state.resizeWidget(widget.id, sizeId)
                }, size.label);
              })
            )
          ),
          
          // Custom settings
          widgetType.settings && Object.entries(widgetType.settings).map(([key, def]) =>
            React.createElement('div', { key, className: 'widgets-settings__field' },
              React.createElement('label', null, def.label),
              def.type === 'boolean' ?
                React.createElement('input', {
                  type: 'checkbox',
                  checked: settings[key] ?? def.default,
                  onChange: e => handleChange(key, e.target.checked)
                }) :
              def.type === 'number' ?
                React.createElement('input', {
                  type: 'number',
                  value: settings[key] ?? def.default,
                  min: def.min,
                  max: def.max,
                  onChange: e => handleChange(key, parseInt(e.target.value, 10))
                }) :
              def.type === 'select' ?
                React.createElement('select', {
                  value: settings[key] ?? def.default,
                  onChange: e => handleChange(key, e.target.value)
                },
                  def.options.map(opt =>
                    React.createElement('option', { key: opt.value, value: opt.value }, opt.label)
                  )
                ) :
                null
            )
          )
        ),
        
        React.createElement('div', { className: 'widgets-settings__footer' },
          React.createElement('button', {
            className: 'widgets-settings__btn widgets-settings__btn--cancel',
            onClick: onClose
          }, 'Отмена'),
          React.createElement('button', {
            className: 'widgets-settings__btn widgets-settings__btn--save',
            onClick: handleSave
          }, 'Сохранить')
        )
      )
    );
  }
  
  // === Main WidgetsTab Component ===
  function WidgetsTab({ selectedDate, clientId }) {
    const [widgets, setWidgets] = useState([]);
    const [isEditMode, setIsEditMode] = useState(false);
    const [catalogOpen, setCatalogOpen] = useState(false);
    const [settingsWidget, setSettingsWidget] = useState(null);
    const [historyInfo, setHistoryInfo] = useState({ canUndo: false, canRedo: false });
    const containerRef = useRef(null);
    
    // Сохраняем selectedDate в HEYS.Widgets.data для использования в widget_data.js
    useEffect(() => {
      if (HEYS.Widgets.data) {
        HEYS.Widgets.data._selectedDate = selectedDate;
        console.log('[WidgetsTab] Updated selectedDate:', selectedDate);
      }
    }, [selectedDate]);
    
    // Initialize and subscribe to state changes
    useEffect(() => {
      // Initialize state if not already
      HEYS.Widgets.state?.init?.();
      
      // Get initial widgets
      setWidgets(HEYS.Widgets.state?.getWidgets?.() || []);
      setIsEditMode(HEYS.Widgets.state?.isEditMode?.() || false);
      updateHistoryInfo();
      
      // Subscribe to layout changes
      const unsubLayout = HEYS.Widgets.on('layout:changed', ({ layout }) => {
        setWidgets([...layout]);
        updateHistoryInfo();
      });
      
      // Subscribe to edit mode changes
      const unsubEditEnter = HEYS.Widgets.on('editmode:enter', () => {
        setIsEditMode(true);
      });
      
      const unsubEditExit = HEYS.Widgets.on('editmode:exit', () => {
        setIsEditMode(false);
      });
      
      // Subscribe to history changes
      const unsubHistory = HEYS.Widgets.on('history:changed', updateHistoryInfo);
      
      return () => {
        unsubLayout?.();
        unsubEditEnter?.();
        unsubEditExit?.();
        unsubHistory?.();
      };
    }, []);
    
    // Update history info
    const updateHistoryInfo = useCallback(() => {
      setHistoryInfo({
        canUndo: HEYS.Widgets.canUndo?.() || false,
        canRedo: HEYS.Widgets.canRedo?.() || false
      });
    }, []);
    
    // Global pointer event handlers for DnD
    useEffect(() => {
      const handlePointerMove = (e) => {
        HEYS.Widgets.dnd?.handlePointerMove?.(e);
      };
      
      const handlePointerUp = (e) => {
        HEYS.Widgets.dnd?.handlePointerUp?.(e);
      };
      
      // Attach global listeners
      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
      document.addEventListener('pointercancel', handlePointerUp);
      
      return () => {
        document.removeEventListener('pointermove', handlePointerMove);
        document.removeEventListener('pointerup', handlePointerUp);
        document.removeEventListener('pointercancel', handlePointerUp);
      };
    }, []);
    
    // Handle catalog widget selection
    const handleCatalogSelect = useCallback((widgetType) => {
      console.log('[Widgets UI] handleCatalogSelect called:', widgetType);
      console.log('[Widgets UI] Registry:', HEYS.Widgets.registry);
      console.log('[Widgets UI] State:', HEYS.Widgets.state);
      
      if (!HEYS.Widgets.registry) {
        console.error('[Widgets UI] Registry not initialized!');
        return;
      }
      
      const widget = HEYS.Widgets.registry.createWidget(widgetType.type);
      console.log('[Widgets UI] Created widget:', widget);
      
      if (widget) {
        if (!HEYS.Widgets.state) {
          console.error('[Widgets UI] State not initialized!');
          return;
        }
        const added = HEYS.Widgets.state.addWidget(widget);
        console.log('[Widgets UI] Added widget:', added);
      } else {
        console.error('[Widgets UI] createWidget returned null for type:', widgetType.type);
      }
    }, []);
    
    // Handle widget settings save
    const handleSettingsSave = useCallback((widgetId, settings) => {
      HEYS.Widgets.state?.updateWidget(widgetId, { settings });
    }, []);
    
    // Handle widget remove
    const handleRemove = useCallback((widgetId) => {
      HEYS.Widgets.state?.removeWidget(widgetId);
    }, []);
    
    // Toggle edit mode
    const toggleEdit = useCallback(() => {
      HEYS.Widgets.toggleEditMode?.();
    }, []);
    
    // Undo/Redo handlers
    const handleUndo = useCallback(() => {
      HEYS.Widgets.undo?.();
    }, []);
    
    const handleRedo = useCallback(() => {
      HEYS.Widgets.redo?.();
    }, []);
    
    // Render empty state
    if (widgets.length === 0 && !isEditMode) {
      return React.createElement('div', { className: 'widgets-tab' },
        React.createElement('div', { className: 'widgets-empty' },
          React.createElement('div', { className: 'widgets-empty__icon' }, '📊'),
          React.createElement('div', { className: 'widgets-empty__title' }, 'Нет виджетов'),
          React.createElement('div', { className: 'widgets-empty__desc' },
            'Добавьте виджеты для отслеживания важных показателей'
          ),
          React.createElement('button', {
            className: 'widgets-empty__btn',
            onClick: () => setCatalogOpen(true)
          }, '+ Добавить виджет')
        ),
        React.createElement(CatalogModal, {
          isOpen: catalogOpen,
          onClose: () => setCatalogOpen(false),
          onSelect: handleCatalogSelect
        })
      );
    }
    
    return React.createElement('div', {
      className: `widgets-tab ${isEditMode ? 'widgets-tab--editing' : ''}`,
      ref: containerRef
    },
      // Header with edit button
      React.createElement('div', { className: 'widgets-header' },
        React.createElement('div', { className: 'widgets-header__left' },
          isEditMode && React.createElement(React.Fragment, null,
            React.createElement('button', {
              className: 'widgets-header__btn widgets-header__btn--add',
              onClick: () => setCatalogOpen(true)
            }, '+ Добавить'),
            // Undo/Redo buttons
            React.createElement('button', {
              className: `widgets-header__btn widgets-header__btn--undo ${!historyInfo.canUndo ? 'disabled' : ''}`,
              onClick: handleUndo,
              disabled: !historyInfo.canUndo,
              title: 'Отменить (Ctrl+Z)'
            }, '↩'),
            React.createElement('button', {
              className: `widgets-header__btn widgets-header__btn--redo ${!historyInfo.canRedo ? 'disabled' : ''}`,
              onClick: handleRedo,
              disabled: !historyInfo.canRedo,
              title: 'Повторить (Ctrl+Shift+Z)'
            }, '↪')
          )
        ),
        React.createElement('button', {
          className: `widgets-header__btn widgets-header__btn--edit ${isEditMode ? 'active' : ''}`,
          onClick: toggleEdit
        }, isEditMode ? '✓ Готово' : '✏️ Изменить')
      ),
      
      // Widgets Grid
      React.createElement('div', {
        className: `widgets-grid ${isEditMode ? 'widgets-grid--editing' : ''}`
      },
        widgets.map(widget =>
          React.createElement(WidgetCard, {
            key: widget.id,
            widget,
            isEditMode,
            onRemove: handleRemove,
            onSettings: setSettingsWidget
          })
        )
      ),
      
      // Modals
      React.createElement(CatalogModal, {
        isOpen: catalogOpen,
        onClose: () => setCatalogOpen(false),
        onSelect: handleCatalogSelect
      }),
      React.createElement(SettingsModal, {
        widget: settingsWidget,
        isOpen: !!settingsWidget,
        onClose: () => setSettingsWidget(null),
        onSave: handleSettingsSave
      })
    );
  }
  
  // === Exports ===
  HEYS.Widgets.WidgetsTab = WidgetsTab;
  HEYS.Widgets.WidgetCard = WidgetCard;
  HEYS.Widgets.CatalogModal = CatalogModal;
  HEYS.Widgets.SettingsModal = SettingsModal;
  
  console.log('[HEYS] Widgets UI v1.1.0 loaded');
  
})(typeof window !== 'undefined' ? window : global);
