<script lang="ts">
  import { base } from '$app/paths';
  import NavBar from '$lib/components/layout/NavBar.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import RecurringRow from '$lib/components/budget/RecurringRow.svelte';
  import RecurringSheet from '$lib/components/budget/RecurringSheet.svelte';
  import { recurringTransactions } from '$lib/stores/recurringStore';
  import { openModal } from '$lib/stores/uiStore';
  import type { RecurringTransaction } from '$lib/types';

  // Bills and subscriptions, soonest due first. Each is logged for you on
  // the day it falls due; tap one to edit, pause or delete it.

  let editing: RecurringTransaction | null = null;
  function open(item: RecurringTransaction | null) {
    editing = item;
    openModal('recurring-form');
  }

  $: sorted = [...$recurringTransactions].sort((a, b) => new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime());
</script>

<NavBar title="Bills" back={{ href: `${base}/budget`, label: 'Budget' }}>
  <svelte:fragment slot="trailing">
    <button class="btn-icon text-tint" on:click={() => open(null)} aria-label="Add a recurring item"><Icon name="plus" size={24} /></button>
  </svelte:fragment>
</NavBar>

<div class="space-y-3">
  <p class="px-1 text-[13px] text-label-2">Logged for you on the day they are due.</p>
  {#if sorted.length === 0}
    <div class="card px-5 py-12 text-center text-[15px] text-label-2">No bills or subscriptions yet. Add one with +.</div>
  {:else}
    <div class="group">
      {#each sorted as item (item.id)}
        <RecurringRow {item} onClick={() => open(item)} />
      {/each}
    </div>
  {/if}
</div>

<RecurringSheet item={editing} />
