<script lang="ts">
  // Budget: the month's plan. Income and what is left to assign on top,
  // then the envelopes in three groups, then bills, goals and notes.
  import NavBar from '$lib/components/layout/NavBar.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import { base } from '$app/paths';
  import { buckets, bucketStatuses, addBucket, updateBucket, deleteBucket, updateBucketAllocation, unsortedTransactions } from '$lib/stores/budgetStore';
  import { loadRecurring } from '$lib/stores/recurringStore';
  import { loadGoals } from '$lib/stores/goalsStore';
  import MonthMenu from '$lib/components/layout/MonthMenu.svelte';
  import BudgetSummary from '$lib/components/budget/BudgetSummary.svelte';
  import EnvelopeRow from '$lib/components/budget/EnvelopeRow.svelte';
  import AssignSheet from '$lib/components/budget/AssignSheet.svelte';
  import IncomeSheet from '$lib/components/budget/IncomeSheet.svelte';
  import GoalSheet from '$lib/components/budget/GoalSheet.svelte';
  import NotesSheet from '$lib/components/budget/NotesSheet.svelte';
  import GoalsSection from '$lib/components/budget/GoalsSection.svelte';
  import { groupEnvelopes } from '$lib/budget/groups';
  import Modal from '$lib/components/shared/Modal.svelte';
  import { openModal, closeModal } from '$lib/stores/uiStore';
  import type { AllocationType } from '$lib/types';

  type BucketFormData = { id: string; name: string; color: string; allocationType: AllocationType; fixedAmount: number; percentageAmount: number; isSavings: boolean; isEveryday: boolean; isDefault?: boolean };

  let editingBucket: BucketFormData | null = null;
  let newBucketName = '';
  let newBucketColor = '#6366f1';
  let newAllocationType: AllocationType = 'fixed';
  let newFixedAmount = 0;
  let newPercentageAmount = 0;
  let newIsSavings = false;
  let newIsEveryday = true;
  let formError = '';

  function handleAddBucket() {
    editingBucket = null;
    newBucketName = '';
    newBucketColor = '#6366f1';
    newAllocationType = 'fixed';
    newFixedAmount = 0;
    newPercentageAmount = 0;
    newIsSavings = false;
    newIsEveryday = true;
    formError = '';
    openModal('bucket-form');
  }

  function handleEditBucket(bucket: BucketFormData) {
    editingBucket = bucket;
    newBucketName = bucket.name;
    newBucketColor = bucket.color;
    newAllocationType = bucket.allocationType;
    newFixedAmount = bucket.fixedAmount;
    newPercentageAmount = bucket.percentageAmount;
    newIsSavings = bucket.isSavings ?? false;
    newIsEveryday = bucket.isEveryday ?? true;
    formError = '';
    openModal('bucket-form');
  }

  async function handleSubmit() {
    if (!newBucketName.trim()) return;
    formError = '';

    try {
      if (editingBucket) {
        await updateBucket(editingBucket.id, {
          name: newBucketName,
          color: newBucketColor,
          isSavings: newIsSavings,
          isEveryday: newIsEveryday,
        });
        await updateBucketAllocation(editingBucket.id, newAllocationType, newFixedAmount, newPercentageAmount);
      } else {
        await addBucket({
          name: newBucketName,
          color: newBucketColor,
          order: $buckets.length,
          isDefault: false,
          allocationType: newAllocationType,
          fixedAmount: newFixedAmount,
          percentageAmount: newPercentageAmount,
          isSavings: newIsSavings,
          isEveryday: newIsEveryday,
          createdAt: new Date(),
        });
      }
      closeModal();
    } catch (e) {
      formError = e instanceof Error ? e.message : 'Failed to save bucket';
    }
  }

  async function handleDelete(id: string) {
    const status = $bucketStatuses.find((s) => s.bucket.id === id);
    if (!confirm(
      `Delete "${status?.bucket.name ?? 'this bucket'}"? Its transactions are kept and moved to "Unsorted" so you can re-file them. Its recurring items and linked savings goals are deleted. This cannot be undone.`
    )) return;
    await deleteBucket(id);
    await loadRecurring();
    await loadGoals();
    closeModal();
  }

  $: groups = groupEnvelopes($bucketStatuses);
  $: sections = [
    { title: 'Everyday', note: 'counts toward safe to spend', rows: groups.everyday },
    { title: 'Bills', note: '', rows: groups.bills },
    { title: 'Savings', note: '', rows: groups.savings },
  ].filter((g) => g.rows.length > 0);
</script>

<NavBar title="Budget">
  <svelte:fragment slot="leading"><MonthMenu /></svelte:fragment>
  <svelte:fragment slot="trailing">
    <button class="btn-icon text-tint" on:click={handleAddBucket} aria-label="Add bucket"><Icon name="plus" size={24} /></button>
  </svelte:fragment>
</NavBar>

<div class="space-y-6">
  <BudgetSummary />

  {#each sections as section (section.title)}
    <section aria-label={section.title}>
      <h2 class="settings-label">{section.title}{#if section.note}<span class="font-normal">{' · '}{section.note}</span>{/if}</h2>
      <div class="group">
        {#each section.rows as status (status.bucket.id)}
          <EnvelopeRow {status} onClick={() => handleEditBucket(status.bucket)} />
        {/each}
      </div>
    </section>
  {/each}

  {#if $unsortedTransactions.length > 0 && groups.unsorted}
    <section aria-label="Needs an envelope">
      <h2 class="settings-label">Needs an envelope</h2>
      <div class="group">
        <EnvelopeRow status={groups.unsorted} href="{base}/activity?bucket=unsorted" />
      </div>
    </section>
  {/if}

  <section aria-label="More">
    <h2 class="settings-label">More</h2>
    <div class="group">
      <a href="{base}/budget/bills" class="group-row flex min-h-[56px] items-center gap-3 px-4 py-2.5 text-label hover:bg-fill">
        <span class="flex h-9 w-9 flex-none items-center justify-center rounded-[11px] bg-[#8e8e93] text-white"><Icon name="calendar" size={19} /></span>
        <span class="min-w-0 flex-1 text-[16px] font-medium">Bills and subscriptions</span>
        <span class="text-label-2/60"><Icon name="chevron-right" size={18} /></span>
      </a>
      <button type="button" on:click={() => openModal('notes')} class="group-row flex min-h-[56px] w-full items-center gap-3 px-4 py-2.5 text-left text-label hover:bg-fill">
        <span class="flex h-9 w-9 flex-none items-center justify-center rounded-[11px] bg-[#8e8e93] text-white"><Icon name="list" size={19} /></span>
        <span class="min-w-0 flex-1 text-[16px] font-medium">Month notes</span>
        <span class="text-label-2/60"><Icon name="chevron-right" size={18} /></span>
      </button>
      <button type="button" on:click={handleAddBucket} class="group-row flex min-h-[56px] w-full items-center gap-3 px-4 py-2.5 text-left text-label hover:bg-fill">
        <span class="flex h-9 w-9 flex-none items-center justify-center rounded-[11px] bg-[#8e8e93] text-white"><Icon name="plus" size={19} /></span>
        <span class="min-w-0 flex-1 text-[16px] font-medium">New envelope</span>
        <span class="text-label-2/60"><Icon name="chevron-right" size={18} /></span>
      </button>
    </div>
  </section>

  <GoalsSection />
</div>

<AssignSheet />
<IncomeSheet />
<GoalSheet />
<NotesSheet />

<Modal id="bucket-form" title={editingBucket ? 'Edit Bucket' : 'Add Bucket'}>
  <form on:submit|preventDefault={handleSubmit} class="space-y-4">
    {#if formError}
      <p class="text-sm text-danger">{formError}</p>
    {/if}
    <div>
      <label for="name" class="label">Name</label>
      <input id="name" type="text" bind:value={newBucketName} class="mt-1.5 input-base" required />
    </div>
    <div>
      <label for="color" class="label">Color</label>
      <input id="color" type="color" bind:value={newBucketColor} class="mt-1.5 h-11 w-full cursor-pointer rounded-[14px] border border-[#8f938f] bg-white px-1.5 dark:border-white/[0.36] dark:bg-white/[0.04]" />
    </div>

    <div>
      <span class="label mb-2 block">Allocation Type</span>
      <div class="flex gap-4">
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="radio" bind:group={newAllocationType} value="fixed" class="accent-primary" />
          <span class="text-sm text-gray-700 dark:text-gray-200">Fixed</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="radio" bind:group={newAllocationType} value="percentage" class="accent-primary" />
          <span class="text-sm text-gray-700 dark:text-gray-200">Percentage</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="radio" bind:group={newAllocationType} value="hybrid" class="accent-primary" />
          <span class="text-sm text-gray-700 dark:text-gray-200">Hybrid</span>
        </label>
      </div>
    </div>

    {#if newAllocationType === 'fixed' || newAllocationType === 'hybrid'}
      <div>
        <label for="fixedAmount" class="label">Fixed Amount ($)</label>
        <input
          id="fixedAmount"
          type="number"
          step="0.01"
          min="0"
          value={(newFixedAmount / 100).toFixed(2)}
          on:change={(e) => newFixedAmount = Math.round(parseFloat(e.currentTarget.value || '0') * 100)}
          class="mt-1.5 input-base"
        />
      </div>
    {/if}

    {#if newAllocationType === 'percentage' || newAllocationType === 'hybrid'}
      <div>
        <label for="percentageAmount" class="label">Percentage (%)</label>
        <input
          id="percentageAmount"
          type="number"
          step="0.1"
          min="0"
          max="100"
          bind:value={newPercentageAmount}
          class="mt-1.5 input-base"
        />
      </div>
    {/if}

    <label class="flex items-start gap-2.5 cursor-pointer">
      <input type="checkbox" bind:checked={newIsSavings} class="mt-0.5 accent-primary" />
      <span class="text-sm text-gray-700 dark:text-gray-200">
        Counts as savings
        <span class="block text-xs text-muted">Money moved here is treated as saved, not spent, in your savings rate.</span>
      </span>
    </label>

    <label class="flex items-start gap-2.5 cursor-pointer">
      <input type="checkbox" bind:checked={newIsEveryday} class="mt-0.5 accent-primary" />
      <span class="text-sm text-gray-700 dark:text-gray-200">
        Everyday spending
        <span class="block text-xs text-muted">Included in "safe to spend today". Turn off for a fixed obligation like rent that's already spoken for.</span>
      </span>
    </label>

    <button type="submit" class="w-full btn-primary">
      {editingBucket ? 'Update' : 'Add'} Bucket
    </button>
    {#if editingBucket && !editingBucket.isDefault}
      <button type="button" class="btn-danger w-full" on:click={() => editingBucket && handleDelete(editingBucket.id)}>Delete bucket</button>
    {/if}
  </form>
</Modal>
