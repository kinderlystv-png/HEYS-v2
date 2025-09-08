<script>
  import { onMount } from 'svelte';
  import { logger } from '@heys/logger';

  onMount(() => {
    logger.info('Home page loaded');
  });
</script>

<svelte:head>
  <title>HEYS Platform - Добро пожаловать</title>
  <meta name="description" content="Платформа HEYS для эффективного управления проектами" />
</svelte:head>

<div class="text-center">
  <div class="max-w-4xl mx-auto">
    <h1 class="text-4xl font-bold text-gray-900 sm:text-6xl">
      Добро пожаловать в
      <span class="text-heys-primary">HEYS</span>
    </h1>
    
    <p class="mt-6 text-lg leading-8 text-gray-600">
      Современная платформа для управления проектами с фокусом на качество, 
      производительность и удобство использования.
    </p>
    
    <div class="mt-10 flex items-center justify-center gap-x-6">
      <a 
        href="/dashboard" 
        class="rounded-md bg-heys-primary px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-heys-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-heys-primary transition-colors"
      >
        Перейти к Dashboard
      </a>
      <a 
        href="/docs" 
        class="text-sm font-semibold leading-6 text-gray-900 hover:text-heys-primary transition-colors"
      >
        Документация <span aria-hidden="true">→</span>
      </a>
    </div>
  </div>

  <div class="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
    <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      <div class="w-12 h-12 bg-heys-primary/10 rounded-lg flex items-center justify-center mb-4">
        <svg class="w-6 h-6 text-heys-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>
      <h3 class="text-lg font-semibold text-gray-900 mb-2">
        Высокая производительность
      </h3>
      <p class="text-gray-600">
        Оптимизированная архитектура для быстрой работы и минимального времени отклика.
      </p>
    </div>

    <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      <div class="w-12 h-12 bg-heys-success/10 rounded-lg flex items-center justify-center mb-4">
        <svg class="w-6 h-6 text-heys-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h3 class="text-lg font-semibold text-gray-900 mb-2">
        Надежность
      </h3>
      <p class="text-gray-600">
        Комплексная система мониторинга и логирования для обеспечения стабильности.
      </p>
    </div>

    <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      <div class="w-12 h-12 bg-heys-accent/10 rounded-lg flex items-center justify-center mb-4">
        <svg class="w-6 h-6 text-heys-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      </div>
      <h3 class="text-lg font-semibold text-gray-900 mb-2">
        Удобство использования
      </h3>
      <p class="text-gray-600">
        Интуитивный интерфейс, созданный с учетом потребностей пользователей.
      </p>
    </div>
  </div>
</div>
