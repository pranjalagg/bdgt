<script lang="ts">
  import UpdateBanner from './UpdateBanner.svelte';
  import Nav from './Nav.svelte';
  import Modal from '$lib/components/shared/Modal.svelte';
  import LogEntry from '$lib/components/shared/LogEntry.svelte';
  import CurrencyModal from '$lib/components/shared/CurrencyModal.svelte';
  import SyncChoiceModal from '$lib/components/sync/SyncChoiceModal.svelte';
  import { syncEnabled } from '$lib/sync/browser';
  import { currencyConfirmed, takeCurrencyPrompt, currencyAnsweredElsewhere } from '$lib/stores/currencyStore';
  import { openLog, openModal, closeModal, activeModal, logPreselectedBucketId, scaledBack } from '$lib/stores/uiStore';
  import Toast from '$lib/components/ui/Toast.svelte';
  import { onNavigate, beforeNavigate, afterNavigate } from '$app/navigation';
  import { navDirection } from '$lib/ui/navDirection';
  import { edgeSwipeBack } from '$lib/ui/edgeSwipe';
  import { isTabRoot } from '$lib/ui/routes';
  import { page } from '$app/stores';
  import { base } from '$app/paths';

  // Ask until the user confirms, once per load of the saved settings.
  // Reactive so an import or reset that keeps the same currency code (and so
  // does not rebuild this layout) still shows the modal.
  $: if (takeCurrencyPrompt($currencyConfirmed)) openModal('currency');
  // Signing in may bring a currency already confirmed on another device
  // while this dialog is open: the question is answered, so close it.
  $: if (currencyAnsweredElsewhere($currencyConfirmed, $activeModal === 'currency')) closeModal();

  // The page scrolls inside <main>, not the window, so SvelteKit's own
  // scroll handling never sees it: a new page starts at the top, and Back
  // returns to where that page was left.
  let main: HTMLElement;
  const scrollByUrl = new Map<string, number>();
  beforeNavigate(({ from }) => {
    if (from && main) scrollByUrl.set(from.url.href, main.scrollTop);
  });
  afterNavigate(({ type, to }) => {
    if (!main || type === 'enter') return;
    main.scrollTop = type === 'popstate' && to ? (scrollByUrl.get(to.url.href) ?? 0) : 0;
  });

  // Moving between pages fades through: the old one fades out, the new one
  // in (app.css). The bars and the Log button are named so they stay put.
  // The page change slides the way the app's structure goes (navDirection);
  // app.css reads data-nav to pick the animation.
  onNavigate((navigation) => {
    if (!document.startViewTransition || navigation.from?.url.pathname === navigation.to?.url.pathname) return;
    const strip = (p: string) => p.slice(base.length) || '/';
    document.documentElement.dataset.nav = navDirection(navigation.from ? strip(navigation.from.url.pathname) : null, strip(navigation.to?.url.pathname ?? '/'));
    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });

  // Each page's name in the tab, the task switcher and screen readers.
  const TITLES: Record<string, string> = {
    '/': 'Home',
    '/budget': 'Budget',
    '/budget/bills': 'Bills',
    '/activity': 'Activity',
    '/review': 'Review payments',
    '/insights': 'Insights',
    '/insights/investments': 'Investments',
    '/settings': 'Settings',
  };
  $: path = $page.url.pathname.slice(base.length).replace(/(.)\/$/, '$1') || '/';
  $: title = TITLES[path] ? `${TITLES[path]} · bdgt` : 'bdgt';

  function handleLogComplete() {
    closeModal();
    logPreselectedBucketId.set(undefined);
  }

  // Cmd/Ctrl+K opens Log from anywhere on desktop, like a command bar --
  // no reaching for the mouse to log a spend. Skipped while another
  // modal is already open so it can't yank focus out from under one.
  function handleGlobalKeydown(e: KeyboardEvent) {
    if (e.key.toLowerCase() !== 'k' || !(e.metaKey || e.ctrlKey)) return;
    if ($activeModal) return;
    e.preventDefault();
    openLog();
  }
</script>

<svelte:window on:keydown={handleGlobalKeydown} />

<svelte:head>
  <title>{title}</title>
</svelte:head>

<div id="stage" class:scaled={$scaledBack} class="flex h-screen bg-background supports-[height:100dvh]:h-[100dvh] dark:bg-background-dark">
  <Nav />
  <main bind:this={main} use:edgeSwipeBack={!isTabRoot(path)} class="relative flex-1 overflow-auto overscroll-contain" style="padding-top: var(--safe-top)">
    <!-- The app draws under the status bar; this strip keeps content that
         scrolls up from running into the clock and icons. -->
    <div
      class="pointer-events-none fixed inset-x-0 top-0 z-30 [view-transition-name:status-strip] bg-background/85 backdrop-blur-xl dark:bg-background-dark/85 md:hidden"
      style="height: var(--safe-top)"
      aria-hidden="true"
    ></div>
    <UpdateBanner />
    <div class="mx-auto max-w-5xl px-4 pb-[calc(9rem+var(--safe-bottom))] pt-4 sm:px-6 md:pb-24 md:pt-8">
      <slot />
    </div>
  </main>

  <!-- Persistent action, not a button that only exists on some pages:
       logging a spend is the one thing you do here more than anything
       else, so it's reachable from every screen. An extended action button
       above the bottom bar on phones. -->
  <button
    type="button"
    on:click={() => openLog()}
    aria-keyshortcuts="Meta+K"
    class="btn-primary fixed right-4 z-30 !min-h-[3.5rem] !px-6 text-base [view-transition-name:log-button]
           bottom-[calc(5rem+var(--safe-bottom))] md:bottom-6 md:right-6"
    style="box-shadow: var(--shadow-float)"
  >
    <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
    Log
    <kbd class="hidden rounded border border-white/25 px-1.5 py-0.5 text-[10px] font-medium leading-none text-white/80 md:inline-block">
      ⌘K
    </kbd>
  </button>
</div>

<Toast />

<Modal id="log" title="Add Transaction">
  <LogEntry preselectedBucketId={$logPreselectedBucketId} onComplete={handleLogComplete} />
</Modal>

<CurrencyModal />
{#if syncEnabled}
  <SyncChoiceModal />
{/if}
