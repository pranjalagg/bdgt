<script lang="ts">
  import Modal from '$lib/components/shared/Modal.svelte';
  import Switch from '$lib/components/ui/Switch.svelte';
  import { segmentedPill } from '$lib/actions/segmentedPill';
  import { buckets, addBucket, updateBucket, deleteBucket, updateBucketAllocation } from '$lib/stores/budgetStore';
  import { loadRecurring } from '$lib/stores/recurringStore';
  import { loadGoals } from '$lib/stores/goalsStore';
  import { activeModal, closeModal } from '$lib/stores/uiStore';
  import { haptic } from '$lib/ui/haptics';
  import type { AllocationType, Bucket } from '$lib/types';

  // A new envelope, or one being edited: name, colour, how it gets money,
  // and whether it counts as savings or everyday spending. Envelopes the app
  // started with can't be deleted; others delete from here.

  export let envelope: Bucket | null = null;

  let name = '';
  let color = '#6366f1';
  let allocationType: AllocationType = 'fixed';
  let fixedAmount = 0;
  let percentageAmount = 0;
  let isSavings = false;
  let isEveryday = true;
  let formError = '';
  let wasOpen = false;

  $: onOpenChange($activeModal === 'bucket-form');
  function onOpenChange(open: boolean) {
    if (open && !wasOpen) seed();
    wasOpen = open;
  }

  function seed() {
    name = envelope?.name ?? '';
    color = envelope?.color ?? '#6366f1';
    allocationType = envelope?.allocationType ?? 'fixed';
    fixedAmount = envelope?.fixedAmount ?? 0;
    percentageAmount = envelope?.percentageAmount ?? 0;
    isSavings = envelope?.isSavings ?? false;
    isEveryday = envelope?.isEveryday ?? true;
    formError = '';
  }

  async function submit() {
    if (!name.trim()) return;
    formError = '';
    try {
      if (envelope) {
        await updateBucket(envelope.id, { name, color, isSavings, isEveryday });
        await updateBucketAllocation(envelope.id, allocationType, fixedAmount, percentageAmount);
      } else {
        await addBucket({
          name,
          color,
          order: $buckets.length,
          isDefault: false,
          allocationType,
          fixedAmount,
          percentageAmount,
          isSavings,
          isEveryday,
          createdAt: new Date(),
        });
      }
      haptic('success');
      closeModal('bucket-form');
    } catch (e) {
      formError = e instanceof Error ? e.message : 'Failed to save the envelope';
    }
  }

  async function remove() {
    if (!envelope) return;
    if (!confirm(`Delete "${envelope.name}"? Its transactions are kept and moved to "Unsorted" so you can re-file them. Its recurring items and linked savings goals are deleted. This cannot be undone.`)) return;
    await deleteBucket(envelope.id);
    await loadRecurring();
    await loadGoals();
    closeModal('bucket-form');
  }

  const TYPES: [AllocationType, string][] = [
    ['fixed', 'Fixed'],
    ['percentage', 'Percentage'],
    ['hybrid', 'Both'],
  ];
</script>

<Modal id="bucket-form" title={envelope ? 'Edit envelope' : 'New envelope'}>
  <form on:submit|preventDefault={submit} class="space-y-4 pt-1">
    {#if formError}<p class="text-sm text-danger" role="alert">{formError}</p>{/if}
    <div>
      <label for="name" class="label">Name</label>
      <input id="name" type="text" bind:value={name} class="mt-1.5 input-base" required autocomplete="off" />
    </div>
    <div>
      <label for="color" class="label">Colour</label>
      <input id="color" type="color" bind:value={color} class="mt-1.5 h-11 w-full cursor-pointer rounded-[14px] border border-[#8f938f] bg-surface px-1.5 dark:border-white/[0.36]" />
    </div>
    <div>
      <span id="alloc-label" class="label mb-1.5 block">Gets money as</span>
      <div class="segmented !w-full md:!flex" role="group" aria-labelledby="alloc-label" use:segmentedPill>
        {#each TYPES as [value, text]}
          <button type="button" class="segment" aria-pressed={allocationType === value} on:click={() => (allocationType = value)}>{text}</button>
        {/each}
      </div>
    </div>
    {#if allocationType !== 'percentage'}
      <div>
        <label for="fixedAmount" class="label">Fixed amount a month</label>
        <input id="fixedAmount" type="number" step="0.01" min="0" inputmode="decimal" value={(fixedAmount / 100).toFixed(2)} on:change={(e) => (fixedAmount = Math.round(parseFloat(e.currentTarget.value || '0') * 100))} class="mt-1.5 input-base" />
      </div>
    {/if}
    {#if allocationType !== 'fixed'}
      <div>
        <label for="percentageAmount" class="label">Percentage of income</label>
        <input id="percentageAmount" type="number" step="0.1" min="0" max="100" inputmode="decimal" bind:value={percentageAmount} class="mt-1.5 input-base" />
      </div>
    {/if}
    <div class="group">
      <div class="group-row flex items-center gap-3 px-4 py-3" style="--row-inset: 16px">
        <span class="min-w-0 flex-1">
          <span class="block text-[16px] text-label">Counts as savings</span>
          <span class="block text-[13px] text-label-2">Money moved here is saved, not spent, in your savings rate.</span>
        </span>
        <Switch bind:checked={isSavings} label="Counts as savings" />
      </div>
      <div class="group-row flex items-center gap-3 px-4 py-3" style="--row-inset: 16px">
        <span class="min-w-0 flex-1">
          <span class="block text-[16px] text-label">Everyday spending</span>
          <span class="block text-[13px] text-label-2">Counts toward safe to spend. Turn off for a fixed bill like rent.</span>
        </span>
        <Switch bind:checked={isEveryday} label="Everyday spending" />
      </div>
    </div>
    <button type="submit" class="btn-primary w-full">{envelope ? 'Save envelope' : 'Add envelope'}</button>
    {#if envelope && !envelope.isDefault}
      <button type="button" class="btn-danger w-full" on:click={remove}>Delete envelope</button>
    {/if}
  </form>
</Modal>
