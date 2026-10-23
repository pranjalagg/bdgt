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

<nav class="segmented" aria-label="Section">
  {#each tabs as tab}
    <a href={getHref(tab.href)} class="segment" aria-current={isActive(tab.href, currentPath) ? 'page' : undefined}>
      {tab.label}
    </a>
  {/each}
</nav>
