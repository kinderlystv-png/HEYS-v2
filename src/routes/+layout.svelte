<script>
  import '../app.pcss';
  import { onMount } from 'svelte';
  import { logger } from '@heys/logger';

  export let data;

  onMount(() => {
    logger.info('SvelteKit application mounted');
  });
</script>

<main class="min-h-screen bg-heys-surface">
  <nav class="bg-white shadow-sm border-b border-gray-200">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between h-16">
        <div class="flex items-center">
          <h1 class="text-xl font-semibold text-heys-primary">
            HEYS Platform
          </h1>
        </div>
        <div class="flex items-center space-x-4">
          <a href="/dashboard" class="text-heys-secondary hover:text-heys-primary transition-colors">
            Dashboard
          </a>
          <a href="/settings" class="text-heys-secondary hover:text-heys-primary transition-colors">
            Settings
          </a>
        </div>
      </div>
    </div>
  </nav>

  <div class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
    <slot />
  </div>
</main>

<style>
  :global(body) {
    margin: 0;
    font-family: 'Inter', system-ui, sans-serif;
  }
</style>
