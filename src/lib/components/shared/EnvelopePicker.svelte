<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import Modal from './Modal.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import { bucketStatuses } from '$lib/stores/budgetStore';
  import { formatCurrency } from '$lib/utils/currency';
  import { envelopeIcon } from '$lib/ui/icons';

  // A sheet listing the envelopes with what is left in each; tapping one
  // picks it. Used to move an expense and to file a payment from Review.

  export let id: string;
  export let title: string;
  export let current: string | null = null;

  const dispatch = createEventDispatcher<{ pick: { id: string; name: string } }>();
  $: envelopes = $bucketStatuses.filter((s) => !s.bucket.isSystem);
</script>

<Modal {id} {title}>
  <div class="group">
    {#each envelopes as s (s.bucket.id)}
      {@const on = s.bucket.id === current}
      <button type="button" class="group-row flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left hover:bg-fill focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-tint" style="--row-inset: 60px" aria-current={on ? 'true' : undefined} on:click={() => dispatch('pick', { id: s.bucket.id, name: s.bucket.name })}>
        <span class="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] text-white" style="background:{s.bucket.color}" aria-hidden="true"><Icon name={envelopeIcon(s.bucket.name)} size={17} strokeWidth={2.2} /></span>
        <span class="min-w-0 flex-1 truncate text-[16px] text-label">{s.bucket.name}</span>
        <span class="money amt flex-none text-[13px] text-label-2">{formatCurrency(s.remaining)} left</span>
        {#if on}<span class="text-tint"><Icon name="check" size={18} /></span>{/if}
      </button>
    {/each}
  </div>
</Modal>
