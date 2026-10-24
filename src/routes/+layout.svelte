<script lang="ts">
	import '@fontsource-variable/inter/opsz.css';
	// Fonts ship with the app (no Google Fonts request), so it looks the same
	// offline and inside the Android app.
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import Layout from '$lib/components/layout/Layout.svelte';
	import { onMount } from 'svelte';
	import { installMotion } from '$lib/ui/motion';
	import { installBackButton } from '$lib/ui/backButton';
	import { isTabRoot, tabRootOf } from '$lib/ui/routes';
	import { afterNavigate, goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { get } from 'svelte/store';
	import { modalStack, closeModal } from '$lib/stores/uiStore';
	import { historyDepth } from '$lib/ui/history';
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

	// How many pages back this app can go (Android back from a page opened
	// directly has nowhere to go back to, so it returns to the tab instead).
	afterNavigate(({ type }) => {
		if (type === 'link' || type === 'goto') historyDepth.update((d) => d + 1);
		else if (type === 'popstate') historyDepth.update((d) => Math.max(0, d - 1));
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
			toRoot: () => void goto(base + tabRootOf(appPath()), { replaceState: true }),
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
