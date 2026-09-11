<script lang="ts">
  import { page } from '$app/stores';
  import { base } from '$app/paths';

  // "Insights" and "Setup" each fold two-to-three old top-level pages into
  // one nav destination; this is how you move between the pages inside
  // that group without a full nav item per page.
  export let tabs: { href: string; label: string }[];

  $: currentPath = $page.url.pathname;

  function getHref(path: string): string {
    return `${base}${path}`;
  }

  function isActive(href: string, path: string): boolean {
    const full = getHref(href);
    return path === full || path === full + '/';
  }
</script>

<div class="flex gap-1 border-b border-border dark:border-border-dark">
  {#each tabs as tab}
    <a
      href={getHref(tab.href)}
      class="border-b-2 px-3 pb-2.5 text-sm font-medium transition-colors
             {isActive(tab.href, currentPath)
               ? 'border-primary text-gray-900 dark:text-gray-50'
               : 'border-transparent text-muted hover:text-gray-700 dark:text-muted-dark dark:hover:text-gray-300'}"
    >
      {tab.label}
    </a>
  {/each}
</div>
