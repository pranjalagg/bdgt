<script lang="ts">
  import { page } from '$app/stores';
  import { base } from '$app/paths';

  const mainNavItems = [
    { href: '/', label: 'Dashboard', icon: 'home' },
    { href: '/buckets', label: 'Buckets', icon: 'folder' },
    { href: '/transactions', label: 'Transactions', icon: 'list' },
    { href: '/recurring', label: 'Recurring', icon: 'refresh' },
    { href: '/analytics', label: 'Analytics', icon: 'chart' },
  ];

  const settingsItem = { href: '/settings', label: 'Settings', icon: 'cog' };

  $: currentPath = $page.url.pathname;

  function getHref(path: string): string {
    return path === '/' ? base || '/' : `${base}${path}`;
  }


</script>

<!-- Desktop sidebar -->
<nav class="hidden h-full w-60 flex-shrink-0 flex-col border-r border-gray-200 bg-white dark:border-border-dark dark:bg-surface-dark md:flex">
  <div class="flex items-center gap-2.5 px-5 py-5">
    <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
      <svg class="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 17L12 22L22 17" /><path d="M2 12L12 17L22 12" /><path d="M12 2L2 7L12 12L22 7L12 2Z" />
      </svg>
    </div>
    <span class="text-lg font-bold tracking-tight text-gray-900 dark:text-gray-50">Budget</span>
  </div>

  <ul class="flex-1 space-y-0.5 px-3 pt-2">
    {#each mainNavItems as item}
      {@const active = currentPath === getHref(item.href) || currentPath === getHref(item.href) + '/'}
      <li>
        <a
          href={getHref(item.href)}
          class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors
                 {active
                   ? 'bg-primary/10 text-primary dark:bg-primary/15'
                   : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800/50 dark:hover:text-gray-200'}"
        >
          <span class="h-5 w-5 flex-shrink-0">
            {#if item.icon === 'home'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            {:else if item.icon === 'folder'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
            {:else if item.icon === 'list'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            {:else if item.icon === 'refresh'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
            {:else if item.icon === 'chart'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            {/if}
          </span>
          <span>{item.label}</span>
        </a>
      </li>
    {/each}
  </ul>

  <div class="border-t border-gray-200 px-3 py-3 dark:border-border-dark">
    <a
      href={getHref(settingsItem.href)}
      class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors
             {currentPath === getHref(settingsItem.href) || currentPath === getHref(settingsItem.href) + '/'
               ? 'bg-primary/10 text-primary dark:bg-primary/15'
               : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800/50 dark:hover:text-gray-200'}"
    >
      <span class="h-5 w-5 flex-shrink-0">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
        </svg>
      </span>
      <span>{settingsItem.label}</span>
    </a>
  </div>
</nav>

<!-- Mobile bottom nav -->
<nav class="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur-sm dark:border-border-dark dark:bg-surface-dark/95 md:hidden">
  <ul class="flex justify-around">
    {#each mainNavItems as item}
      {@const active = currentPath === getHref(item.href) || currentPath === getHref(item.href) + '/'}
      <li class="flex-1">
        <a
          href={getHref(item.href)}
          class="flex flex-col items-center gap-0.5 py-2.5 transition-colors
                 {active
                   ? 'text-primary'
                   : 'text-gray-500 dark:text-gray-400'}"
        >
          <span class="h-5 w-5">
            {#if item.icon === 'home'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            {:else if item.icon === 'folder'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
            {:else if item.icon === 'list'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            {:else if item.icon === 'refresh'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
            {:else if item.icon === 'chart'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            {/if}
          </span>
          <span class="text-[10px] font-medium">{item.label}</span>
        </a>
      </li>
    {/each}
  </ul>
</nav>
