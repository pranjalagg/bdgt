<script lang="ts">
  import { haptic } from '$lib/ui/haptics';
  import Icon from '$lib/components/ui/Icon.svelte';

  // The expense's date: Today, Yesterday, or any day from the system date
  // picker.

  export let value: Date;

  let open = false;
  let picking = false;
  let button: HTMLButtonElement;
  let menu: HTMLElement;
  let dateInput: HTMLInputElement;

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const daysAgo = (n: number) => {
    const t = startOfDay(new Date());
    return new Date(t.getFullYear(), t.getMonth(), t.getDate() - n);
  };
  const sameDay = (a: Date, b: Date) => startOfDay(a).getTime() === startOfDay(b).getTime();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  $: label = sameDay(value, daysAgo(0))
    ? 'Today'
    : sameDay(value, daysAgo(1))
      ? 'Yesterday'
      : value.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(value.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });

  // Today keeps the current time, as the old form did; other days start
  // at midnight.
  function choose(d: Date) {
    value = d;
    haptic('selection');
    close();
  }

  function toggle() {
    open = !open;
    picking = false;
    if (open) setTimeout(() => menu?.querySelector<HTMLElement>('[aria-checked="true"], button')?.focus(), 30);
  }

  function close() {
    open = false;
    picking = false;
    button?.focus();
  }

  async function pickDate() {
    picking = true;
    setTimeout(() => {
      dateInput?.focus();
      try {
        dateInput?.showPicker?.();
      } catch {
        // Some browsers only open the picker on a direct tap; the field is there.
      }
    }, 30);
  }

  function onDateChange() {
    if (!dateInput.value) return;
    const [y, m, d] = dateInput.value.split('-').map(Number);
    choose(new Date(y, m - 1, d));
  }

  function onKeydown(e: KeyboardEvent) {
    if (open && e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  }

  function outside(e: PointerEvent) {
    if (open && !menu?.contains(e.target as Node) && !button?.contains(e.target as Node)) open = false;
  }
</script>

<svelte:window on:pointerdown={outside} />

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="relative" on:keydown={onKeydown}>
  <button
    bind:this={button}
    type="button"
    class="flex h-9 items-center gap-1 rounded-full bg-fill pl-3 pr-2 text-[15px] font-semibold text-label focus:outline-none focus-visible:ring-2 focus-visible:ring-tint"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label="Date: {label}"
    on:click={toggle}
  >
    {label}<Icon name="chevron-down" size={14} strokeWidth={2.4} />
  </button>
  {#if open}
    <div bind:this={menu} class="glass absolute right-0 top-11 z-50 w-56 rounded-2xl p-1.5" role="menu" aria-label="Date">
      {#if picking}
        <label class="block px-3 pb-1 pt-2 text-[13px] text-label-2" for="log-date">Pick a date</label>
        <input id="log-date" bind:this={dateInput} type="date" value={iso(value)} on:change={onDateChange} class="input-base mb-1 w-full" />
      {:else}
        <button type="button" role="menuitemradio" aria-checked={sameDay(value, daysAgo(0))} class="flex min-h-[44px] w-full items-center justify-between rounded-xl px-3 text-left text-[16px] text-label hover:bg-fill focus:bg-fill focus:outline-none" on:click={() => choose(new Date())}>
          Today{#if sameDay(value, daysAgo(0))}<span class="text-tint"><Icon name="check" size={18} /></span>{/if}
        </button>
        <button type="button" role="menuitemradio" aria-checked={sameDay(value, daysAgo(1))} class="flex min-h-[44px] w-full items-center justify-between rounded-xl px-3 text-left text-[16px] text-label hover:bg-fill focus:bg-fill focus:outline-none" on:click={() => choose(daysAgo(1))}>
          Yesterday{#if sameDay(value, daysAgo(1))}<span class="text-tint"><Icon name="check" size={18} /></span>{/if}
        </button>
        <button type="button" role="menuitem" class="flex min-h-[44px] w-full items-center justify-between rounded-xl px-3 text-left text-[16px] text-label hover:bg-fill focus:bg-fill focus:outline-none" on:click={pickDate}>
          Pick a date…<Icon name="calendar" size={18} />
        </button>
      {/if}
    </div>
  {/if}
</div>
