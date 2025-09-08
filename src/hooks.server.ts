import type { Handle, HandleServerError } from '@sveltejs/kit';

import { log } from '../src/lib/logger.js';

// Создаем логгер для сервера

export const handle: Handle = async ({ event, resolve }) => {
  // Добавляем логирование к каждому запросу
  const start = Date.now();
  
  log.info('SvelteKit request started', {
    method: event.request.method,
    url: event.url.pathname,
    userAgent: event.request.headers.get('user-agent'),
  });

  try {
    const response = await resolve(event, {
      transformPageChunk: ({ html }) => {
        // Можно добавить дополнительную обработку HTML
        return html;
      },
    });

    const duration = Date.now() - start;
    log.info('SvelteKit request completed', {
      method: event.request.method,
      url: event.url.pathname,
      status: response.status,
      duration,
    });

    return response;
  } catch (error) {
    const duration = Date.now() - start;
    log.error('SvelteKit request failed', {
      method: event.request.method,
      url: event.url.pathname,
      duration,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

export const handleError: HandleServerError = ({ error, event }) => {
  log.error('SvelteKit server error', {
    url: event.url.pathname,
    method: event.request.method,
    error: error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
    } : String(error),
  });

  return {
    message: 'Внутренняя ошибка сервера',
    code: 'INTERNAL_SERVER_ERROR',
  };
};
