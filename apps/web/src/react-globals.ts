/**
 * React Globals Entry Point
 * 
 * Экспортирует React и ReactDOM в window для совместимости с legacy heys_*.js файлами.
 * Этот файл обрабатывается Vite:
 * - В dev: import из pre-bundled node_modules
 * - В prod: tree-shaken и минифицированный бандл
 * 
 * @version 1.1.0
 * @date 2026-01-21
 * 
 * Причина миграции с CDN:
 * - 152-ФЗ compliance (нет внешних CDN)
 * - Убрать document.write warnings
 * - Лучшая производительность (локальный кэш)
 * - PWA совместимость
 */

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as ReactDOMClient from 'react-dom/client';

// Экспортируем в window для legacy heys_*.js файлов
// Они используют: const React = window.React;
window.React = React;

// ReactDOM с createRoot из react-dom/client (React 18+)
// Мержим ReactDOM + ReactDOMClient для совместимости
window.ReactDOM = {
    ...ReactDOM,
    createRoot: ReactDOMClient.createRoot,
    hydrateRoot: ReactDOMClient.hydrateRoot,
};

// Debug log (удаляется в production через terser drop_console)
console.log('[HEYS] React globals loaded (local bundle)', React.version);
