<script lang="ts">
	// Fonts ship with the app (no Google Fonts request), so it looks the same
	// offline and inside the Android app.
	import '@fontsource-variable/ibm-plex-sans/wght.css';
	import '@fontsource/ibm-plex-mono/400.css';
	import '@fontsource-variable/archivo/wdth.css';
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import Layout from '$lib/components/layout/Layout.svelte';
	import { onMount } from 'svelte';
	import { loadData, isLoading } from '$lib/stores/budgetStore';
	import { loadRecurring, processRecurring } from '$lib/stores/recurringStore';
	import { loadGoals } from '$lib/stores/goalsStore';
	import { loadCaptures } from '$lib/stores/captureStore';
	import { startCapture } from '$lib/capture/runner';
	import { startClock } from '$lib/stores/uiStore';
	import { loadCurrency, baseCurrency } from '$lib/stores/currencyStore';
	import { initSync } from '$lib/sync/browser';
	import '$lib/stores/themeStore';

	let { children } = $props();

	onMount(() => {
		// Development only: Vite sets import.meta.env.DEV to false in every build
		// (website and Android app) and drops these imports.
		if (import.meta.env.DEV) {
			void import('$lib/capture/devSamples').then((m) => m.installSampleCaptures());
			void import('$lib/capture/devPhone').then((m) => m.installDevPhone());
		}
		const stopClock = startClock();
		void init();
		return stopClock;
	});

	async function init() {
		await loadCurrency();
		await loadData();
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
	<div class="flex h-screen items-center justify-center bg-background dark:bg-background-dark">
		<p class="text-gray-500 dark:text-gray-400">Loading...</p>
	</div>
{:else}
	{#key $baseCurrency}
		<Layout>
			{@render children()}
		</Layout>
	{/key}
{/if}
