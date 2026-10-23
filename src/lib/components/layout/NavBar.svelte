<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '$lib/components/ui/Icon.svelte';

  // An iOS navigation bar: clear at the top of the page, glass once content
  // slides under it. With a large title, the small title fades in once the
  // large one has scrolled under the bar.

  export let title: string;
  export let large = true;
  export let back: { href: string; label: string } | null = null;
  // Shown in the bar once scrolled, when it should differ from the heading
  // (Home shows today's figure there). Treated as an amount for Hide amounts.
  export let compactTitle: string | null = null;

  let top: HTMLElement;
  let below: HTMLElement;
  let scrolled = false;
  let titled = false;

  onMount(() => {
    const root = top.closest('main');
    const barHeight = 52;
    // Content is under the bar as soon as the top marker leaves the screen;
    // the large title is under it once the marker after the title passes
    // the bar's lower edge.
    const scrolledObs = new IntersectionObserver(([e]) => (scrolled = !e.isIntersecting), { root, threshold: 0 });
    const titleObs = new IntersectionObserver(
      ([e]) => (titled = !e.isIntersecting && e.boundingClientRect.top < (e.rootBounds?.top ?? 0) + barHeight),
      { root, rootMargin: `-${barHeight}px 0px 0px 0px`, threshold: 0 }
    );
    scrolledObs.observe(top);
    titleObs.observe(below);
    return () => {
      scrolledObs.disconnect();
      titleObs.disconnect();
    };
  });

  $: compact = large ? titled : scrolled;
</script>

<div bind:this={top} class="h-0" aria-hidden="true"></div>
<header class="navbar sticky z-20 -mx-4 -mt-4 sm:-mx-6 md:-mt-8" class:scrolled>
  <div class="relative flex h-[52px] items-center justify-between gap-2 px-2.5 sm:px-4">
    <div class="flex min-w-0 flex-1 items-center gap-1.5">
      {#if back}
        <a href={back.href} class="flex h-10 items-center rounded-full pr-2 text-[17px] text-tint focus:outline-none focus-visible:ring-2 focus-visible:ring-tint">
          <Icon name="chevron-left" size={26} />{back.label}
        </a>
      {/if}
      <slot name="leading" />
    </div>
    <span class="title pointer-events-none absolute left-1/2 top-1/2 max-w-[50%] truncate text-[17px] font-semibold text-label" class:amt={compactTitle !== null} class:show={compact} aria-hidden={!compact || large}>{compactTitle ?? title}</span>
    <div class="flex flex-1 items-center justify-end gap-1.5">
      <slot name="trailing" />
    </div>
  </div>
</header>
{#if large}
  <h1 class="ltitle px-1 pb-2 pt-1">{title}</h1>
{:else}
  <h1 class="sr-only">{title}</h1>
{/if}
<div bind:this={below} class="h-0" aria-hidden="true"></div>

<style>
  .navbar {
    top: var(--safe-top);
    transition: background-color 200ms ease-out, box-shadow 200ms ease-out;
  }

  .navbar.scrolled {
    background-color: rgb(var(--c-glass) / var(--glass-alpha));
    -webkit-backdrop-filter: blur(22px) saturate(180%);
    backdrop-filter: blur(22px) saturate(180%);
    box-shadow: 0 0.5px 0 rgb(var(--c-sep) / var(--sep-alpha));
  }

  .title {
    opacity: 0;
    transform: translate(-50%, -30%);
    transition: opacity 180ms ease-out, transform var(--ms-smooth, 300ms) var(--ease-smooth, ease-out);
  }

  .title.show {
    opacity: 1;
    transform: translate(-50%, -50%);
  }
</style>
