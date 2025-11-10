import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Консультация с официальной документацией: https://kit.svelte.dev/docs/integrations#preprocessors
  preprocess: vitePreprocess(),

  kit: {
    // Адаптер для Node.js production сервера
    adapter: adapter({
      out: 'build',
      precompress: false,
      envPrefix: '',
    }),

    // Псевдонимы для путей
    alias: {
      $lib: 'src/lib',
      $components: 'src/components',
      $stores: 'src/stores',
      $utils: 'src/utils',
    },

    // CSP конфигурация для безопасности
    csp: {
      mode: 'auto',
      directives: {
        'default-src': ['self'],
        'script-src': ['self', 'unsafe-inline'],
        'style-src': ['self', 'unsafe-inline'],
        'img-src': ['self', 'data:', 'https:'],
        'font-src': ['self'],
        'connect-src': ['self'],
        'manifest-src': ['self'],
        'frame-src': ['none'],
      },
    },

    // Безопасные заголовки
    serviceWorker: {
      register: false,
    },

    // Конфигурация сервера разработки
    version: {
      name: process.env.npm_package_version,
      pollInterval: 300000,
    },

    // Файлы приложения
    files: {
      assets: 'static',
      hooks: {
        client: 'src/hooks.client.ts',
        server: 'src/hooks.server.ts',
      },
      lib: 'src/lib',
      params: 'src/params',
      routes: 'src/routes',
      serviceWorker: 'src/service-worker.ts',
      appTemplate: 'src/app.html',
      errorTemplate: 'src/error.html',
    },
  },
};

export default config;
