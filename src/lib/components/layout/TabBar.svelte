<script lang="ts">
  import { page } from '$app/stores';
  import { base } from '$app/paths';
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import { pendingCaptures } from '$lib/stores/captureStore';
  import { tabRootOf } from '$lib/ui/routes';
  import { haptic } from '$lib/ui/haptics';
  import Icon from '$lib/components/ui/Icon.svelte';
  import type { IconName } from '$lib/ui/icons';

  // The phone's floating tab bar: a glass capsule whose lens slides to the
  // current tab. Tapping the current tab again is handled by the layout
  // (back to the tab's first page, then to the top).

  const dispatch = createEventDispatcher<{ reselect: string }>();

  const TABS: { href: string; label: string; icon: IconName }[] = [
    { href: '/', label: 'Home', icon: 'house' },
    { href: '/budget', label: 'Budget', icon: 'layers' },
    { href: '/activity', label: 'Activity', icon: 'list' },
    { href: '/insights', label: 'Insights', icon: 'chart' },
  ];

  $: current = tabRootOf($page.url.pathname.slice(base.length) || '/');

  let bar: HTMLElement;
  let lens: HTMLElement;
  let ready = false;

  async function placeLens(animate: boolean) {
    await tick();
    const on = bar?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!on || !lens) return;
    if (!animate) lens.style.transition = 'none';
    lens.style.width = `${on.offsetWidth}px`;
    lens.style.transform = `translateX(${on.offsetLeft}px)`;
    if (!animate) {
      void lens.offsetWidth;
      lens.style.transition = '';
    }
  }

  $: if (bar) void placeLens(ready && current !== undefined);

  onMount(() => {
    void placeLens(false).then(() => (ready = true));
    const ro = new ResizeObserver(() => void placeLens(false));
    ro.observe(bar);
    return () => ro.disconnect();
  });

  function tap(e: MouseEvent, href: string) {
    haptic('selection');
    if (href === current) {
      e.preventDefault();
      dispatch('reselect', href);
    }
  }
</script>

<nav bind:this={bar} class="tabbar glass fixed z-40 flex p-1 md:hidden [view-transition-name:bottom-bar]" aria-label="Tabs">
  <span bind:this={lens} class="lens" aria-hidden="true"></span>
  {#each TABS as tab}
    <a
      href={tab.href === '/' ? base || '/' : base + tab.href}
      aria-current={current === tab.href ? 'page' : undefined}
      aria-label={tab.href === '/activity' && $pendingCaptures.length > 0 ? `${tab.label}, ${$pendingCaptures.length} to review` : undefined}
      class="tab relative flex min-w-0 flex-1 flex-col items-center justify-center gap-[2px] rounded-[24px] text-[10.5px] font-semibold
             focus:outline-none focus-visible:ring-2 focus-visible:ring-tint"
      on:click={(e) => tap(e, tab.href)}
    >
      <span class="relative">
        <Icon name={tab.icon} size={22} strokeWidth={current === tab.href ? 2.1 : 1.75} />
        {#if tab.href === '/activity' && $pendingCaptures.length > 0}
          <span
            class="badge absolute -right-2.5 -top-1.5 min-w-[18px] rounded-full bg-danger px-1 text-center text-[11px] font-bold leading-[18px] text-white dark:text-black"
            aria-hidden="true">{$pendingCaptures.length}</span
          >
        {/if}
      </span>
      <span>{tab.label}</span>
    </a>
  {/each}
</nav>

<style>
  .tabbar {
    left: 20px;
    right: 88px;
    bottom: calc(14px + var(--safe-bottom));
    height: 56px;
    border-radius: 28px;
  }

  .lens {
    position: absolute;
    top: 4px;
    bottom: 4px;
    left: 0;
    border-radius: 24px;
    background: rgb(var(--c-label) / 0.07);
    transition: transform var(--ms-bouncy, 450ms) var(--ease-bouncy, ease-out), width var(--ms-bouncy, 450ms) var(--ease-bouncy, ease-out);
  }

  :global(.dark) .lens {
    background: rgb(var(--c-label) / 0.13);
  }

  :global(.rm) .lens {
    transition: none;
  }

  .tab {
    color: rgb(var(--c-label));
  }

  .tab[aria-current='page'] {
    color: rgb(var(--c-tint-text));
  }
</style>
