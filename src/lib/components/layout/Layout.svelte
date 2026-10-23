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
  import TabBar from './TabBar.svelte';
  import LogButton from './LogButton.svelte';
  import { goto } from '$app/navigation';
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
  $: title = TITLES[path] ? `${TITLES[path]} · bdgt` : path.startsWith('/budget/') ? 'Envelope · bdgt' : 'bdgt';

  // Tapping the tab you are on goes back to its first page, then to the top.
  function reselect(tab: string) {
    if (path !== tab) return void goto(tab === '/' ? base || '/' : base + tab);
    main?.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

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
    <div class="mx-auto max-w-5xl px-4 pb-[calc(110px+var(--safe-bottom))] pt-4 sm:px-6 md:pb-24 md:pt-8">
      <slot />
    </div>
  </main>

  <!-- Phones: the floating tab bar and the round Log button beside it. -->
  <TabBar on:reselect={(e) => reselect(e.detail)} />
  <LogButton />
</div>

<Toast />

<Modal id="log" title="Add Transaction">
  <LogEntry preselectedBucketId={$logPreselectedBucketId} onComplete={handleLogComplete} />
</Modal>

<CurrencyModal />
{#if syncEnabled}
  <SyncChoiceModal />
{/if}
