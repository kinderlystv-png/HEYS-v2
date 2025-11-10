# Performance Monitoring v1 (Архив)

**Дата архивирования:** 9 ноября 2025 г.  
**Причина:** Избыточная сложность, over-engineering

## Что было удалено

### Файлы (60KB, 1315 строк):

- `heys_performance_monitor.js` - 829 строк, 32KB
- `heys_analytics_ui.js` - 487 строк, 28KB

### Функциональность:

- ❌ FPS tracking (requestAnimationFrame loop)
- ❌ Детальный memory monitoring
- ❌ Browser fingerprinting
- ❌ Scroll/click tracking
- ❌ UI компонент AnalyticsModal (никогда не использовался)
- ❌ Monkey patching `document.createElement`
- ❌ Console hijacking

## Замена

**Новый файл:** `apps/web/heys_simple_analytics.js`  
**Размер:** 217 строк, 8KB  
**Экономия:** 1098 строк (-84%), 52KB (-87%)

### Что оставлено (реально используемое):

- ✅ `trackSearch()` - медленные поиски (>1s)
- ✅ `trackApiCall()` - медленные API (>2s)
- ✅ `trackDataOperation()` - cache hits/misses
- ✅ `trackError()` - базовый error logging

## Причины удаления

1. **Over-engineering:** 11,500+ строк кода для мониторинга простого приложения
   учета питания
2. **Низкое использование:** <5% функциональности реально применялось
3. **Performance overhead:** FPS counter работал постоянно без необходимости
4. **Мертвый код:** UI компонент загружался но никогда не отображался
5. **Дублирование:** Legacy JS + Modern TS делали одно и то же

## Восстановление

Если понадобится полный мониторинг в будущем:

```bash
# Вернуть файлы из архива
cp archive/performance-monitoring-v1/heys_performance_monitor.js apps/web/
cp archive/performance-monitoring-v1/heys_analytics_ui.js apps/web/

# Обновить index.html
# <script defer src="heys_performance_monitor.js" fetchpriority="high"></script>
# <script defer src="heys_analytics_ui.js" fetchpriority="low"></script>
```

Или лучше: настроить профессиональное решение (Sentry, DataDog, New Relic).

## Подробности

См. полный аудит: `PERFORMANCE_MONITOR_AUDIT.md`
