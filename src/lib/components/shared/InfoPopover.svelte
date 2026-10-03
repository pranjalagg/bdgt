<script lang="ts">
  // A small "i" that explains a number. Opens on hover and keyboard focus,
  // and stays open when clicked or tapped (touch has no hover, and the
  // native title tooltip never shows there). Esc or a click elsewhere
  // closes it.
  //
  // On narrow screens the popover spans the nearest positioned ancestor
  // (give the surrounding card `relative`) so it can never run off-screen;
  // from `sm` up it hangs under the icon.
  export let label: string;

  const id = `info-${Math.random().toString(36).slice(2, 8)}`;
  let open = false;
  let pinned = false;
  let root: HTMLElement | undefined;

  function close() {
    open = false;
    pinned = false;
  }

  function toggle() {
    pinned = !pinned;
    open = pinned;
  }

  function onWindowClick(e: MouseEvent) {
    if (open && root && !root.contains(e.target as Node)) close();
  }

  function onWindowKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) close();
  }
</script>

<svelte:window on:click={onWindowClick} on:keydown={onWindowKey} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<span
  class="inline-flex sm:relative"
  bind:this={root}
  on:mouseenter={() => (open = true)}
  on:mouseleave={() => !pinned && (open = false)}
>
  <button
    type="button"
    class="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted transition-colors hover:text-gray-900
           focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-muted-dark dark:hover:text-gray-100"
    aria-label={label}
    aria-expanded={open}
    aria-describedby={open ? id : undefined}
    on:click={toggle}
    on:focus={() => (open = true)}
    on:blur={() => !pinned && (open = false)}
  >
    <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 7.25v3.5" />
      <circle cx="8" cy="5" r=".4" fill="currentColor" />
    </svg>
  </button>

  {#if open}
    <div
      {id}
      role="tooltip"
      class="absolute inset-x-3 top-full z-20 mt-2 space-y-2 sm:inset-x-auto sm:left-0 sm:w-80 rounded border border-border bg-white p-3 text-left
             text-[12.5px] normal-case leading-snug tracking-normal text-gray-700 shadow-md
             dark:border-border-dark dark:bg-surface-dark dark:text-gray-200"
    >
      <slot />
    </div>
  {/if}
</span>
