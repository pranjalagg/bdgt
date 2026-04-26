<script lang="ts">
  import { page } from '$app/stores';
  import { base } from '$app/paths';

  const navItems = [
    { href: '/', label: 'Dashboard', icon: 'home' },
    { href: '/buckets', label: 'Buckets', icon: 'folder' },
    { href: '/transactions', label: 'Transactions', icon: 'list' },
    { href: '/recurring', label: 'Recurring', icon: 'refresh' },
    { href: '/analytics', label: 'Analytics', icon: 'chart' },
    { href: '/settings', label: 'Settings', icon: 'cog' },
  ];

  $: currentPath = $page.url.pathname;

  function getHref(path: string): string {
    return path === '/' ? base || '/' : `${base}${path}`;
  }

  function isActive(path: string): boolean {
    const fullPath = path === '/' ? base || '/' : `${base}${path}`;
    return currentPath === fullPath || currentPath === fullPath + '/';
  }
</script>

<!-- Desktop sidebar -->
<nav class="hidden h-full w-56 flex-shrink-0 border-r border-gray-200 bg-white dark:border-border-dark dark:bg-surface-dark md:block">
  <div class="p-4">
    <h1 class="text-xl font-bold text-primary dark:text-blue-400">Budget</h1>
  </div>
  <ul class="space-y-1 px-2">
    {#each navItems as item}
      <li>
        <a
          href={getHref(item.href)}
          class="flex items-center gap-3 rounded-lg px-3 py-2 text-gray-700 transition hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
          class:bg-blue-50={isActive(item.href)}
          class:dark:bg-blue-900={isActive(item.href)}
          class:text-primary={isActive(item.href)}
        >
          <span class="h-5 w-5">{item.label.slice(0, 1)}</span>
          <span>{item.label}</span>
        </a>
      </li>
    {/each}
  </ul>
</nav>

<!-- Mobile bottom nav -->
<nav class="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white dark:border-border-dark dark:bg-surface-dark md:hidden">
  <ul class="flex justify-around">
    {#each navItems.slice(0, 5) as item}
      <li class="flex-1">
        <a
          href={getHref(item.href)}
          class="flex flex-col items-center gap-1 py-2 text-gray-600 dark:text-gray-300"
          class:text-primary={isActive(item.href)}
        >
          <span class="text-xs">{item.label.slice(0, 1)}</span>
          <span class="text-xs">{item.label}</span>
        </a>
      </li>
    {/each}
  </ul>
</nav>
