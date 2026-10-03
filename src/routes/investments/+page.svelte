<script lang="ts">
  import { onMount } from 'svelte';
  import { openModal } from '$lib/stores/uiStore';
  import SectionTabs from '$lib/components/shared/SectionTabs.svelte';
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

<div class="space-y-6">
  <SectionTabs tabs={[{ href: '/analytics', label: 'Analytics' }, { href: '/investments', label: 'Investments' }]} />

  <div class="flex items-center justify-between gap-4">
    <h1 class="page-title">Investments</h1>
    <PrivacyToggle />
  </div>

  {#if $isLoadingInvestments}
    <div class="flex items-center justify-center py-12">
      <div class="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
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
