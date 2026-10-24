<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import Modal from './Modal.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import IconMark from '$lib/components/ui/IconMark.svelte';
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

<Modal {id} {title} surface="plain">
  <div class="list" style="--mark-ring: rgb(var(--c-surface))">
    {#each envelopes as s (s.bucket.id)}
      {@const on = s.bucket.id === current}
      <button type="button" class="row row-tap focus:outline-none focus-visible:ring-2 focus-visible:ring-tint" aria-current={on ? 'true' : undefined} on:click={() => dispatch('pick', { id: s.bucket.id, name: s.bucket.name })}>
        <IconMark icon={envelopeIcon(s.bucket.name)} size={40} dot={s.bucket.color} />
        <span class="t-row min-w-0 flex-1 truncate">{s.bucket.name}</span>
        <span class="money amt flex-none text-[13px] text-label-2">{formatCurrency(s.remaining)} left</span>
        {#if on}<span class="text-tint"><Icon name="check" size={18} /></span>{/if}
      </button>
    {/each}
  </div>
</Modal>
