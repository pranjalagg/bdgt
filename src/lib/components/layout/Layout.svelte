<script lang="ts">
  import UpdateBanner from './UpdateBanner.svelte';
  import Nav from './Nav.svelte';
  import Modal from '$lib/components/shared/Modal.svelte';
  import LogEntry from '$lib/components/shared/LogEntry.svelte';
  import DateChip from '$lib/components/log/DateChip.svelte';
  import CurrencyModal from '$lib/components/shared/CurrencyModal.svelte';
  import SyncChoiceModal from '$lib/components/sync/SyncChoiceModal.svelte';
  import { syncEnabled } from '$lib/sync/browser';
  import { currencyConfirmed, takeCurrencyPrompt, currencyAnsweredElsewhere } from '$lib/stores/currencyStore';
  import { openLog, openModal, closeModal, activeModal, modalStack, logPreselectedBucketId, scaledBack } from '$lib/stores/uiStore';
  import Toast from '$lib/components/ui/Toast.svelte';
  import TabBar from './TabBar.svelte';
  import LogButton from './LogButton.svelte';
  import { onNavigate, beforeNavigate, afterNavigate } from '$app/navigation';
  import { navDirection } from '$lib/ui/navDirection';
  import { edgeSwipeBack } from '$lib/ui/edgeSwipe';
  import { isTabRoot, isModalRoot, inModal } from '$lib/ui/routes';
  import { goBack, popToTab } from '$lib/ui/goBack';
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
    '/review': 'To review',
    '/insights': 'Insights',
    '/insights/spending': 'Monthly spending',
    '/insights/income': 'Income and spending',
    '/insights/envelopes': 'Spending by envelope',
    '/insights/savings-rate': 'Savings rate',
    '/insights/investments': 'Investments',
    '/settings': 'Settings',
    '/settings/sync': 'Sync',
    '/settings/capture': 'Automatic capture',
    '/settings/rules': 'Capture rules',
  };
  $: path = $page.url.pathname.slice(base.length).replace(/(.)\/$/, '$1') || '/';
  $: title = TITLES[path] ? `${TITLES[path]} · bdgt` : path.startsWith('/budget/') ? 'Envelope · bdgt' : 'bdgt';

  // Tapping the tab you are on goes back to its first page, then to the top.
  function reselect(tab: string) {
    if (path !== tab) return popToTab(tab);
    main?.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  const edgeBack = () => goBack();

  // The Log sheet's date lives here so the chip in its header and the form
  // share it; the form resets it each time the sheet opens.
  let logDate = new Date();

  function handleLogComplete() {
    closeModal('log');
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

<!-- While a sheet is open the app behind it is inert: no focus, no reading. -->
<div id="stage" inert={$modalStack.length > 0} class:scaled={$scaledBack} class="flex h-screen bg-page supports-[height:100dvh]:h-[100dvh]">
  <Nav />
  <main bind:this={main} use:edgeSwipeBack={!isTabRoot(path) && !isModalRoot(path) && edgeBack} class="relative flex-1 overflow-auto overscroll-contain" style="padding-top: var(--safe-top)">
    <!-- The app draws under the status bar; this strip keeps content that
         scrolls up from running into the clock and icons. -->
    <div
      class="pointer-events-none fixed inset-x-0 top-0 z-30 [view-transition-name:status-strip] bg-page/85 backdrop-blur-xl md:hidden"
      style="height: var(--safe-top)"
      aria-hidden="true"
    ></div>
    <UpdateBanner />
    <div class="mx-auto max-w-5xl px-4 pb-[calc(110px+var(--safe-bottom))] pt-4 sm:px-6 md:pb-24 md:pt-8">
      <slot />
    </div>
  </main>

  <!-- Phones: the floating tab bar and the round Log button beside it. -->
  <!-- Review and Settings slide up over the tabs and cover them. -->
  {#if !inModal(path)}
    <TabBar on:reselect={(e) => reselect(e.detail)} />
    <LogButton />
  {/if}
</div>

<Toast />

<Modal id="log" title="New expense" size="large" scaleBack surface="plain">
  <button slot="leading" type="button" class="h-10 rounded-full px-1 text-[17px] text-tint focus:outline-none focus-visible:ring-2 focus-visible:ring-tint" on:click={handleLogComplete}>Cancel</button>
  <DateChip slot="trailing" bind:value={logDate} />
  <LogEntry preselectedBucketId={$logPreselectedBucketId} onComplete={handleLogComplete} bind:date={logDate} />
</Modal>

<CurrencyModal />
{#if syncEnabled}
  <SyncChoiceModal />
{/if}
