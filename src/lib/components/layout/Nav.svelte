<script lang="ts">
  import { page } from '$app/stores';
  import { base } from '$app/paths';
  import CurrencyChip from '$lib/components/shared/CurrencyChip.svelte';
  import SyncChip from '$lib/components/sync/SyncChip.svelte';
  import { pendingCaptures } from '$lib/stores/captureStore';
  import { openLog } from '$lib/stores/uiStore';
  import { tabRootOf } from '$lib/ui/routes';
  import Icon from '$lib/components/ui/Icon.svelte';
  import type { IconName } from '$lib/ui/icons';

  // The desktop sidebar: the phone's four tabs plus Settings, and the Log
  // button (Cmd+K). Phones use TabBar and LogButton instead.

  const ITEMS: { href: string; label: string; icon: IconName }[] = [
    { href: '/', label: 'Home', icon: 'house' },
    { href: '/budget', label: 'Budget', icon: 'layers' },
    { href: '/activity', label: 'Activity', icon: 'list' },
    { href: '/insights', label: 'Insights', icon: 'chart' },
    { href: '/settings', label: 'Settings', icon: 'settings' },
  ];

  $: path = $page.url.pathname.slice(base.length) || '/';
  $: current = path === '/settings' || path.startsWith('/settings/') ? '/settings' : tabRootOf(path);
</script>

<nav class="hidden h-full w-56 flex-shrink-0 flex-col border-r border-sep bg-surface md:flex [view-transition-name:sidebar]" aria-label="Main">
  <div class="flex items-center gap-2.5 px-5 py-5">
    <div class="flex h-8 w-8 items-center justify-center rounded-[9px] bg-tint text-white">
      <Icon name="layers" size={18} strokeWidth={2.5} />
    </div>
    <span class="text-lg font-bold tracking-tight text-label">bdgt</span>
  </div>

  <div class="px-3 pb-3">
    <button type="button" class="btn-primary w-full" aria-keyshortcuts="Meta+K" on:click={() => openLog()}>
      <Icon name="plus" size={18} strokeWidth={2.5} />
      Log
      <kbd class="ml-auto rounded border border-white/25 px-1.5 py-0.5 text-[10px] font-medium leading-none text-white/80">⌘K</kbd>
    </button>
  </div>

  <ul class="flex-1 space-y-0.5 px-3">
    {#each ITEMS as item}
      {@const active = current === item.href}
      <li>
        <a
          href={item.href === '/' ? base || '/' : base + item.href}
          aria-current={active ? 'page' : undefined}
          class="flex items-center gap-3 rounded-full px-3.5 py-2.5 text-[15px] transition-colors duration-150
                 {active ? 'bg-fill font-semibold text-label' : 'font-medium text-label-2 hover:bg-fill hover:text-label'}"
        >
          <Icon name={item.icon} size={20} strokeWidth={active ? 2.2 : 1.8} />
          <span>{item.label}</span>
          {#if item.href === '/activity' && $pendingCaptures.length > 0}
            <span class="ml-auto rounded-full bg-tint px-1.5 text-[11px] font-semibold leading-5 text-white" aria-label="{$pendingCaptures.length} {$pendingCaptures.length === 1 ? 'payment' : 'payments'} to review">{$pendingCaptures.length}</span>
          {/if}
        </a>
      </li>
    {/each}
  </ul>

  <div class="border-t border-sep px-3 py-3">
    <CurrencyChip />
    <SyncChip />
  </div>
</nav>
