/**
 * React Globals (Synchronous IIFE Build)
 * 
 * Этот файл собирается esbuild/rollup в IIFE формат для синхронной загрузки.
 * Загружается до defer-скриптов чтобы window.React был доступен сразу.
 * 
 * @version 1.0.0
 * @date 2026-01-22
 * 
 * Причина создания:
 * - ESM модули загружаются асинхронно
 * - defer скрипты выполняются до завершения ESM
 * - Нужен синхронный бандл для гарантии порядка
 */

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { createRoot, hydrateRoot } from 'react-dom/client';

// Экспортируем в window для legacy heys_*.js файлов
window.React = React;

// ReactDOM с createRoot/hydrateRoot из react-dom/client (React 18+)
window.ReactDOM = {
    ...ReactDOM,
    createRoot,
    hydrateRoot,
};

// Устанавливаем флаг готовности
window.__heysReactReady = true;

// Dispatch event для модулей которые ждут React
if (typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event('heys:react-ready'));
}
