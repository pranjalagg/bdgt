<script lang="ts">
  import { currentMonthKey, activeModal } from '$lib/stores/uiStore';
  import { transactions, incomes, monthSnapshots } from '$lib/stores/budgetStore';
  import { getMonthKey, getPreviousMonthKey, getNextMonthKey, getCurrentMonthKey, parseMonthKey } from '$lib/utils/dates';
  import { monthKeyAction } from '$lib/utils/keyboard';
  import { monthsWithData } from '$lib/ui/months';
  import { haptic } from '$lib/ui/haptics';
  import Icon from '$lib/components/ui/Icon.svelte';

  // The month button in a navigation bar and its menu of months. On a
  // keyboard, ← and → step months and T returns to this one, as before.

  let open = false;
  let button: HTMLButtonElement;
  let menu: HTMLElement;

  const thisMonth = () => getCurrentMonthKey();
  $: label = (() => {
    const d = parseMonthKey($currentMonthKey);
    const sameYear = $currentMonthKey.slice(0, 4) === thisMonth().slice(0, 4);
    return d.toLocaleDateString('en-US', sameYear ? { month: 'long' } : { month: 'short', year: 'numeric' });
  })();
  $: months = monthsWithData(
    [
      ...$transactions.map((t) => getMonthKey(new Date(t.date))),
      ...$incomes.map((i) => getMonthKey(new Date(i.date))),
      ...$monthSnapshots.map((s) => s.month),
    ],
    thisMonth()
  );
  const name = (key: string) => parseMonthKey(key).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  function pick(key: string) {
    currentMonthKey.set(key);
    haptic('selection');
    close();
  }
  function toggle() {
    open = !open;
    if (open) {
      haptic('light');
      setTimeout(() => menu?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus(), 30);
    }
  }
  function close() {
    open = false;
    button?.focus();
  }
  function onKeydown(e: KeyboardEvent) {
    if (open && e.key === 'Escape') return close();
    if (open) return;
    const action = monthKeyAction(e, $activeModal !== null);
    if (!action) return;
    e.preventDefault();
    if (action === 'previous') currentMonthKey.update(getPreviousMonthKey);
    else if (action === 'next') currentMonthKey.update((m) => (m < thisMonth() ? getNextMonthKey(m) : m));
    else currentMonthKey.set(thisMonth());
  }
  function outside(e: PointerEvent) {
    if (open && !menu?.contains(e.target as Node) && !button?.contains(e.target as Node)) open = false;
  }
</script>

<svelte:window on:keydown={onKeydown} on:pointerdown={outside} />

<div class="relative">
  <button
    bind:this={button}
    type="button"
    class="glass-chip flex h-10 items-center gap-1 rounded-full pl-3.5 pr-2.5 text-[17px] font-semibold text-label"
    aria-haspopup="menu"
    aria-expanded={open}
    on:click={toggle}
  >
    {label}
    <span class="chev text-label-2" class:open aria-hidden="true"><Icon name="chevron-down" size={16} strokeWidth={2.4} /></span>
  </button>
  {#if open}
    <div bind:this={menu} class="menu glass absolute left-0 top-12 z-50 w-56 rounded-2xl p-1.5" role="menu" aria-label="Month">
      {#each months as key}
        <button
          type="button"
          role="menuitemradio"
          aria-checked={key === $currentMonthKey}
          class="flex min-h-[44px] w-full items-center justify-between rounded-xl px-3 text-left text-[16px] text-label hover:bg-fill focus:bg-fill focus:outline-none"
          on:click={() => pick(key)}
        >
          {name(key)}
          {#if key === $currentMonthKey}<span class="text-tint"><Icon name="check" size={18} /></span>{/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .glass-chip {
    background-color: rgb(var(--c-glass) / var(--glass-alpha));
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    backdrop-filter: blur(20px) saturate(180%);
    box-shadow: inset 0 0 0 0.5px var(--glass-edge), var(--shadow-card);
  }

  .chev {
    transition: transform var(--ms-smooth, 300ms) var(--ease-smooth, ease-out);
  }

  .chev.open {
    transform: rotate(180deg);
  }

  .menu {
    transform-origin: 24px 0;
  }

  @media (prefers-reduced-motion: no-preference) {
    .menu {
      animation: menu-in var(--ms-bouncy, 400ms) var(--ease-bouncy, ease-out) both;
    }
  }

  @keyframes menu-in {
    from {
      opacity: 0;
      transform: scale(0.6);
    }
  }
</style>
