<script lang="ts">
  import NavBar from '$lib/components/layout/NavBar.svelte';
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import { openModal } from '$lib/stores/uiStore';
  import PrivacyToggle from '$lib/components/shared/PrivacyToggle.svelte';
  import {
    loadInvestments,
    isLoadingInvestments,
    holdings,
    portfolioSummary,
    recentActivity,
  } from '$lib/stores/investmentStore';
  import PortfolioSummary from '$lib/components/investments/PortfolioSummary.svelte';
  import HoldingsTable from '$lib/components/investments/HoldingsTable.svelte';
  import ActivityList from '$lib/components/investments/ActivityList.svelte';
  import AddLotModal from '$lib/components/investments/AddLotModal.svelte';
  import SellModal from '$lib/components/investments/SellModal.svelte';

  let selectedLotId = '';

  onMount(() => {
    loadInvestments();
  });

  function handleAddPurchase() {
    openModal('add-lot');
  }

  function handleSellFromLot(lotId: string) {
    selectedLotId = lotId;
    openModal('sell-lot');
  }
</script>

<NavBar title="Investments" back={{ href: `${base}/insights`, label: 'Insights' }}>
  <svelte:fragment slot="trailing"><PrivacyToggle /></svelte:fragment>
</NavBar>

<div class="space-y-6">

  {#if $isLoadingInvestments}
    <div class="flex items-center justify-center py-12">
      <div class="h-8 w-8 animate-spin rounded-full border-2 border-tint border-t-transparent"></div>
    </div>
  {:else}
    <PortfolioSummary summary={$portfolioSummary} />

    <HoldingsTable
      holdings={$holdings}
      onAddPurchase={handleAddPurchase}
      onSellFromLot={handleSellFromLot}
    />

    <ActivityList activities={$recentActivity} />
  {/if}
</div>

<AddLotModal />
<SellModal lotId={selectedLotId} />
