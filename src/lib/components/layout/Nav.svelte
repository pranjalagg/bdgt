<script lang="ts">
  import { page } from '$app/stores';
  import { base } from '$app/paths';

  const iconPaths: Record<string, string> = {
    home: '<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
    chart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    cog: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>',
  };

  // Four destinations, not six: every extra top-level item is one more
  // place a user has to check before they trust the number on the
  // dashboard. Analytics and Investments both answer "how am I doing," so
  // they share "Insights"; Buckets, Recurring and Settings are all
  // one-time-per-month setup, so they share "Setup." Each group gets its
  // own sub-tabs (SectionTabs.svelte) once you're inside it.
  const navItems = [
    { href: '/', label: 'Month', icon: 'home', match: ['/'] },
    { href: '/transactions', label: 'Activity', icon: 'list', match: ['/transactions'] },
    { href: '/analytics', label: 'Insights', icon: 'chart', match: ['/analytics', '/investments'] },
    { href: '/buckets', label: 'Setup', icon: 'cog', match: ['/buckets', '/recurring', '/settings'] },
  ];

  $: currentPath = $page.url.pathname;

  function getHref(path: string): string {
    return path === '/' ? base || '/' : `${base}${path}`;
  }

  function isActive(matches: string[], path: string): boolean {
    return matches.some((m) => path === getHref(m) || path === getHref(m) + '/');
  }
</script>

<!-- Desktop sidebar -->
<nav class="hidden h-full w-56 flex-shrink-0 flex-col border-r border-border bg-white dark:border-border-dark dark:bg-surface-dark md:flex">
  <div class="flex items-center gap-2.5 px-5 py-5">
    <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white dark:text-gray-900">
      <svg class="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 17L12 22L22 17" /><path d="M2 12L12 17L22 12" /><path d="M12 2L2 7L12 12L22 7L12 2Z" />
      </svg>
    </div>
    <span class="text-lg font-bold tracking-tight text-gray-900 dark:text-gray-50">Budget</span>
  </div>

  <ul class="flex-1 space-y-0.5 px-3 pt-2">
    {#each navItems as item}
      {@const active = isActive(item.match, currentPath)}
      <li>
        <a
          href={getHref(item.href)}
          class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors
                 {active
                   ? 'bg-primary/10 text-primary dark:bg-primary/15'
                   : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800/50 dark:hover:text-gray-200'}"
        >
          <svg class="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            {@html iconPaths[item.icon]}
          </svg>
          <span>{item.label}</span>
        </a>
      </li>
    {/each}
  </ul>
</nav>

<!-- Mobile bottom nav -->
<nav class="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-white/95 backdrop-blur-sm dark:border-border-dark dark:bg-surface-dark/95 md:hidden">
  <ul class="flex justify-around pb-[env(safe-area-inset-bottom)]">
    {#each navItems as item}
      {@const active = isActive(item.match, currentPath)}
      <li class="flex-1">
        <a
          href={getHref(item.href)}
          class="flex min-h-[44px] flex-col items-center justify-center gap-1 py-2 transition-colors
                 {active ? 'text-primary' : 'text-muted dark:text-muted-dark'}"
        >
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            {@html iconPaths[item.icon]}
          </svg>
          <span class="text-[11px] font-medium">{item.label}</span>
        </a>
      </li>
    {/each}
  </ul>
</nav>
