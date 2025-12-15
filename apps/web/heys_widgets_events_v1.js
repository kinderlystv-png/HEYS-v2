/**
 * heys_widgets_events_v1.js
 * Event Bus для слабого связывания виджетов
 * Version: 1.0.0
 * Created: 2025-12-15
 * 
 * Паттерн: Pub/Sub для loose coupling между виджетами и core
 */
(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.Widgets = HEYS.Widgets || {};
  
  // === Event Bus Implementation ===
  const events = {
    _handlers: new Map(),
    _onceHandlers: new Map(),
    
    /**
     * Подписаться на событие
     * @param {string} event - Название события
     * @param {Function} handler - Обработчик
     * @returns {Function} Функция отписки
     */
    on(event, handler) {
      if (typeof handler !== 'function') {
        console.warn('[Widgets Events] Handler must be a function');
        return () => {};
      }
      
      if (!this._handlers.has(event)) {
        this._handlers.set(event, new Set());
      }
      this._handlers.get(event).add(handler);
      
      // Возвращаем функцию отписки
      return () => this.off(event, handler);
    },
    
    /**
     * Подписаться на событие один раз
     * @param {string} event - Название события
     * @param {Function} handler - Обработчик
     * @returns {Function} Функция отписки
     */
    once(event, handler) {
      if (typeof handler !== 'function') {
        console.warn('[Widgets Events] Handler must be a function');
        return () => {};
      }
      
      if (!this._onceHandlers.has(event)) {
        this._onceHandlers.set(event, new Set());
      }
      this._onceHandlers.get(event).add(handler);
      
      return () => {
        const handlers = this._onceHandlers.get(event);
        if (handlers) handlers.delete(handler);
      };
    },
    
    /**
     * Отписаться от события
     * @param {string} event - Название события
     * @param {Function} handler - Обработчик
     */
    off(event, handler) {
      const handlers = this._handlers.get(event);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this._handlers.delete(event);
        }
      }
      
      const onceHandlers = this._onceHandlers.get(event);
      if (onceHandlers) {
        onceHandlers.delete(handler);
        if (onceHandlers.size === 0) {
          this._onceHandlers.delete(event);
        }
      }
    },
    
    /**
     * Отправить событие
     * @param {string} event - Название события
     * @param {*} data - Данные события
     */
    emit(event, data) {
      // Регулярные обработчики
      const handlers = this._handlers.get(event);
      if (handlers) {
        handlers.forEach(handler => {
          try {
            handler(data);
          } catch (error) {
            console.error(`[Widgets Events] Error in handler for "${event}":`, error);
          }
        });
      }
      
      // Once обработчики (удаляются после вызова)
      const onceHandlers = this._onceHandlers.get(event);
      if (onceHandlers) {
        const handlersToCall = [...onceHandlers];
        this._onceHandlers.delete(event);
        handlersToCall.forEach(handler => {
          try {
            handler(data);
          } catch (error) {
            console.error(`[Widgets Events] Error in once handler for "${event}":`, error);
          }
        });
      }
      
      // Debug логирование
      if (HEYS.debug && event !== 'data:updated') {
        console.log(`[Widgets Events] ${event}`, data);
      }
    },
    
    /**
     * Очистить все обработчики
     */
    clear() {
      this._handlers.clear();
      this._onceHandlers.clear();
    },
    
    /**
     * Получить количество подписчиков на событие
     * @param {string} event - Название события
     * @returns {number}
     */
    listenerCount(event) {
      const regular = this._handlers.get(event)?.size || 0;
      const once = this._onceHandlers.get(event)?.size || 0;
      return regular + once;
    },
    
    /**
     * Получить все события с подписчиками
     * @returns {string[]}
     */
    eventNames() {
      const names = new Set([
        ...this._handlers.keys(),
        ...this._onceHandlers.keys()
      ]);
      return [...names];
    }
  };
  
  // === Built-in Events ===
  // Документация встроенных событий:
  /*
   * widget:added      - Виджет добавлен { widget }
   * widget:removed    - Виджет удалён { widgetId }
   * widget:moved      - Виджет перемещён { widget, from, to }
   * widget:resized    - Виджет изменил размер { widget, from, to }
   * widget:settings   - Настройки виджета изменены { widget, settings }
   * widget:click      - Клик на виджет { widget, event }
   * widget:action     - Quick action на виджете { widget, action }
   * 
   * layout:changed    - Layout изменился { layout }
   * layout:saved      - Layout сохранён { layout }
   * layout:loaded     - Layout загружен { layout }
   * layout:reset      - Layout сброшен
   * 
   * editmode:enter    - Вход в режим редактирования
   * editmode:exit     - Выход из режима редактирования
   * 
   * dnd:start         - Начало drag'а { widget }
   * dnd:move          - Drag движется { widget, x, y }
   * dnd:drop          - Drop завершён { widget, position }
   * dnd:cancel        - Drag отменён
   * 
   * data:updated      - Данные обновились { key, value }
   * 
   * catalog:open      - Каталог открыт
   * catalog:close     - Каталог закрыт
   * catalog:select    - Виджет выбран из каталога { type }
   */
  
  // Экспорт
  HEYS.Widgets.events = events;
  
  // Удобные алиасы
  HEYS.Widgets.on = events.on.bind(events);
  HEYS.Widgets.off = events.off.bind(events);
  HEYS.Widgets.emit = events.emit.bind(events);
  
  console.log('[HEYS] Widgets Events v1.0.0 loaded');
  
})(typeof window !== 'undefined' ? window : global);
