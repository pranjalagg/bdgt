<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import Layout from '$lib/components/layout/Layout.svelte';
	import { onMount } from 'svelte';
	import { loadData, isLoading } from '$lib/stores/budgetStore';
	import { loadRecurring, processRecurring } from '$lib/stores/recurringStore';
	import { loadGoals } from '$lib/stores/goalsStore';
	import '$lib/stores/themeStore';

	let { children } = $props();

	onMount(async () => {
		await loadData();
		await loadRecurring();
		await loadGoals();
		await processRecurring();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if $isLoading}
	<div class="flex h-screen items-center justify-center bg-background dark:bg-background-dark">
		<p class="text-gray-500 dark:text-gray-400">Loading...</p>
	</div>
{:else}
	<Layout>
		{@render children()}
	</Layout>
{/if}
