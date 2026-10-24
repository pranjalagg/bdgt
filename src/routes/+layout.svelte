<script lang="ts">
	// Manrope, bundled with the app (no network font). To go back to the
	// system font, import '@fontsource-variable/inter/opsz.css' here and
	// point --font-sans in app.css back at -apple-system and Inter.
	import '@fontsource-variable/manrope';
	// Fonts ship with the app (no Google Fonts request), so it looks the same
	// offline and inside the Android app.
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import Layout from '$lib/components/layout/Layout.svelte';
	import { onMount } from 'svelte';
	import { installMotion } from '$lib/ui/motion';
	import { installBackButton } from '$lib/ui/backButton';
	import { isTabRoot, tabRootOf } from '$lib/ui/routes';
	import { afterNavigate } from '$app/navigation';
	import { base } from '$app/paths';
	import { get } from 'svelte/store';
	import { modalStack, closeModal } from '$lib/stores/uiStore';
	import { historyDepth, recordNavigation } from '$lib/ui/history';
	import { appPathOf, replaceTo } from '$lib/ui/goBack';
	import { loadData, isLoading } from '$lib/stores/budgetStore';
	import { loadRecurring, processRecurring } from '$lib/stores/recurringStore';
	import { loadGoals } from '$lib/stores/goalsStore';
	import { loadHomeLayout } from '$lib/stores/homeLayoutStore';
	import { loadCaptures } from '$lib/stores/captureStore';
	import { startCapture } from '$lib/capture/runner';
	import { startClock } from '$lib/stores/uiStore';
	import { loadCurrency, baseCurrency } from '$lib/stores/currencyStore';
	import { initSync } from '$lib/sync/browser';
	import '$lib/stores/themeStore';

	let { children } = $props();

	// The app's record of the pages behind this one (see ui/history.ts): Back,
	// Close and Android back read it. A page opened directly has nothing
	// behind it, so Android back returns to its tab instead of leaving.
	afterNavigate(({ type, to }) => {
		if (to) recordNavigation(type, appPathOf(to.url.href));
	});
	const appPath = () => location.pathname.slice(base.length) || '/';

	onMount(() => {
		// Development only: Vite sets import.meta.env.DEV to false in every build
		// (website and Android app) and drops these imports.
		if (import.meta.env.DEV) {
			void import('$lib/capture/devSamples').then((m) => m.installSampleCaptures());
			void import('$lib/capture/devPhone').then((m) => m.installDevPhone());
		}
		const stopClock = startClock();
		// Spring curves for every transition; redone if reduced motion is
		// turned on or off while the app is open.
		const motion = matchMedia('(prefers-reduced-motion: reduce)');
		const applyMotion = () => installMotion(document.documentElement);
		applyMotion();
		motion.addEventListener('change', applyMotion);
		const stopBack = installBackButton({
			state: () => ({ openSheets: get(modalStack).length, atTabRoot: isTabRoot(appPath()), canGoBack: get(historyDepth) > 0 }),
			closeSheet: () => closeModal(),
			back: () => history.back(),
			toRoot: () => replaceTo(tabRootOf(appPath())),
		});
		void init();
		return () => {
			stopClock();
			stopBack();
			motion.removeEventListener('change', applyMotion);
		};
	});

	async function init() {
		await loadCurrency();
		await loadData();
		await loadHomeLayout();
		await loadRecurring();
		await loadGoals();
		await loadCaptures();
		await processRecurring();
		// Sync is an extra: the app is already usable, so it starts in the background.
		void initSync();
		// Android app only: payments the phone noticed go to Review.
		void startCapture();
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if $isLoading}
	<div class="flex h-screen items-center justify-center bg-page">
		<p class="text-label-2">Loading...</p>
	</div>
{:else}
	{#key $baseCurrency}
		<Layout>
			{@render children()}
		</Layout>
	{/key}
{/if}
