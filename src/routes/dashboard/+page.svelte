<script>
  import { onMount } from 'svelte';
  import { logger } from '@heys/logger';
  
  let stats = {
    activeProjects: 12,
    completedTasks: 89,
    teamMembers: 6,
    uptime: '99.9%'
  };

  onMount(() => {
    logger.info('Dashboard loaded', { stats });
  });
</script>

<svelte:head>
  <title>Dashboard - HEYS Platform</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <h1 class="text-3xl font-bold text-gray-900">Dashboard</h1>
    <button class="bg-heys-primary text-white px-4 py-2 rounded-md hover:bg-heys-primary/90 transition-colors">
      Новый проект
    </button>
  </div>

  <!-- Статистика -->
  <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
    <div class="bg-white overflow-hidden shadow rounded-lg">
      <div class="p-5">
        <div class="flex items-center">
          <div class="flex-shrink-0">
            <div class="w-8 h-8 bg-heys-primary/10 rounded-md flex items-center justify-center">
              <svg class="w-5 h-5 text-heys-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
          </div>
          <div class="ml-5 w-0 flex-1">
            <dl>
              <dt class="text-sm font-medium text-gray-500 truncate">Активные проекты</dt>
              <dd class="text-lg font-medium text-gray-900">{stats.activeProjects}</dd>
            </dl>
          </div>
        </div>
      </div>
    </div>

    <div class="bg-white overflow-hidden shadow rounded-lg">
      <div class="p-5">
        <div class="flex items-center">
          <div class="flex-shrink-0">
            <div class="w-8 h-8 bg-heys-success/10 rounded-md flex items-center justify-center">
              <svg class="w-5 h-5 text-heys-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div class="ml-5 w-0 flex-1">
            <dl>
              <dt class="text-sm font-medium text-gray-500 truncate">Выполненные задачи</dt>
              <dd class="text-lg font-medium text-gray-900">{stats.completedTasks}</dd>
            </dl>
          </div>
        </div>
      </div>
    </div>

    <div class="bg-white overflow-hidden shadow rounded-lg">
      <div class="p-5">
        <div class="flex items-center">
          <div class="flex-shrink-0">
            <div class="w-8 h-8 bg-heys-accent/10 rounded-md flex items-center justify-center">
              <svg class="w-5 h-5 text-heys-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
              </svg>
            </div>
          </div>
          <div class="ml-5 w-0 flex-1">
            <dl>
              <dt class="text-sm font-medium text-gray-500 truncate">Участники команды</dt>
              <dd class="text-lg font-medium text-gray-900">{stats.teamMembers}</dd>
            </dl>
          </div>
        </div>
      </div>
    </div>

    <div class="bg-white overflow-hidden shadow rounded-lg">
      <div class="p-5">
        <div class="flex items-center">
          <div class="flex-shrink-0">
            <div class="w-8 h-8 bg-heys-warning/10 rounded-md flex items-center justify-center">
              <svg class="w-5 h-5 text-heys-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>
          <div class="ml-5 w-0 flex-1">
            <dl>
              <dt class="text-sm font-medium text-gray-500 truncate">Время работы</dt>
              <dd class="text-lg font-medium text-gray-900">{stats.uptime}</dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Таблица проектов -->
  <div class="bg-white shadow overflow-hidden sm:rounded-md">
    <div class="px-4 py-5 sm:px-6">
      <h3 class="text-lg leading-6 font-medium text-gray-900">Последние проекты</h3>
      <p class="mt-1 max-w-2xl text-sm text-gray-500">Обзор активных проектов команды</p>
    </div>
    <ul class="divide-y divide-gray-200">
      <li class="px-4 py-4 sm:px-6 hover:bg-gray-50 transition-colors">
        <div class="flex items-center justify-between">
          <div class="flex items-center">
            <div class="flex-shrink-0 h-10 w-10">
              <div class="h-10 w-10 rounded-full bg-heys-primary/10 flex items-center justify-center">
                <span class="text-sm font-medium text-heys-primary">P1</span>
              </div>
            </div>
            <div class="ml-4">
              <div class="text-sm font-medium text-gray-900">HEYS Platform v2.0</div>
              <div class="text-sm text-gray-500">Обновление основной платформы</div>
            </div>
          </div>
          <div class="flex items-center space-x-2">
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              В процессе
            </span>
            <span class="text-sm text-gray-500">75%</span>
          </div>
        </div>
      </li>
      <li class="px-4 py-4 sm:px-6 hover:bg-gray-50 transition-colors">
        <div class="flex items-center justify-between">
          <div class="flex items-center">
            <div class="flex-shrink-0 h-10 w-10">
              <div class="h-10 w-10 rounded-full bg-heys-accent/10 flex items-center justify-center">
                <span class="text-sm font-medium text-heys-accent">M1</span>
              </div>
            </div>
            <div class="ml-4">
              <div class="text-sm font-medium text-gray-900">Мобильное приложение</div>
              <div class="text-sm text-gray-500">iOS и Android версии</div>
            </div>
          </div>
          <div class="flex items-center space-x-2">
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              Планирование
            </span>
            <span class="text-sm text-gray-500">15%</span>
          </div>
        </div>
      </li>
    </ul>
  </div>
</div>
