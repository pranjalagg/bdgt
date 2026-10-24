<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import { goBack, appPathOf } from '$lib/ui/goBack';
  import UpdateBanner from './UpdateBanner.svelte';

  // An iOS navigation bar: clear at the top of the page, glass once content
  // slides under it. A large title collapses into the bar as you scroll: it
  // fades while it passes under the bar (never showing behind the bar's
  // buttons), and the small title takes over once it has gone.

  export let title: string;
  export let large = true;
  export let back: { href: string; label: string } | null = null;
  // Shown in the bar once scrolled, when it should differ from the heading
  // (Home shows today's figure there). Treated as an amount for Hide amounts.
  export let compactTitle: string | null = null;
  // A page that slides up (Review) keeps its small title in the bar always.
  export let pinTitle = false;

  let bar: HTMLElement;
  let heading: HTMLElement;
  let scrolled = false;
  let titled = false;
  let fade = 1;

  onMount(() => {
    const root = bar.closest('main');
    if (!root) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      scrolled = root.scrollTop > 0;
      if (!large || !heading) return;
      const barBottom = bar.getBoundingClientRect().bottom;
      const t = heading.getBoundingClientRect();
      // How much of the title is under the bar, 0 to 1.
      const covered = Math.min(1, Math.max(0, (barBottom - t.top) / Math.max(1, t.height)));
      fade = Math.max(0, 1 - covered * 2);
      titled = covered > 0.7;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      root.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  });

  $: compact = pinTitle || (large ? titled : scrolled);

  // The centred small title gets the room between the bar's buttons, so a
  // long month name or figure never runs under them (it truncates instead).
  let rowWidth = 390;
  let leadWidth = 0;
  let trailWidth = 0;
  $: titleRoom = Math.max(0, rowWidth - 2 * (Math.max(leadWidth, trailWidth) + 12) - 20);
</script>

<header bind:this={bar} class="navbar sticky z-20 -mx-4 -mt-4 sm:-mx-6 md:-mt-8" class:scrolled>
  <div class="relative flex h-[52px] items-center justify-between gap-2 px-2.5 sm:px-4" bind:clientWidth={rowWidth}>
    <div class="flex min-w-0 flex-1 items-center">
      <div class="flex min-w-0 items-center gap-1.5" bind:clientWidth={leadWidth}>
        {#if back}
          <!-- Back pops to the page behind when that is the page it names, so
               the history never gains a page Android back would return to. -->
          <a
            href={back.href}
            class="flex h-10 items-center rounded-full pr-2 text-[17px] text-tint focus:outline-none focus-visible:ring-2 focus-visible:ring-tint"
            on:click={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || !back) return;
              e.preventDefault();
              goBack(appPathOf(back.href));
            }}
          >
            <Icon name="chevron-left" size={26} />{back.label}
          </a>
        {/if}
        <slot name="leading" />
      </div>
    </div>
    <span class="title pointer-events-none absolute left-1/2 top-1/2 truncate text-[17px] font-semibold text-label" style:max-width="{titleRoom}px" class:amt={compactTitle !== null} class:show={compact} aria-hidden={!compact || large}>{compactTitle ?? title}</span>
    <div class="flex flex-1 items-center justify-end">
      <div class="flex items-center gap-1.5" bind:clientWidth={trailWidth}>
        <slot name="trailing" />
      </div>
    </div>
  </div>
  <UpdateBanner />
</header>
{#if large}
  <h1 bind:this={heading} class="ltitle px-1 pb-2 pt-1" style:opacity={fade}>{title}</h1>
{:else}
  <h1 class="sr-only">{title}</h1>
{/if}

<style>
  /* The bar reaches up under the status bar (Android draws edge to edge),
     so when content scrolls under it there is no gap above the bar. */
  .navbar {
    top: 0;
    padding-top: var(--safe-top);
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
