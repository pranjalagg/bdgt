<script lang="ts">
  // Budget: the month's plan. Income and what is left to assign on top,
  // then the envelopes in three groups, then bills, goals and notes.
  import NavBar from '$lib/components/layout/NavBar.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import { base } from '$app/paths';
  import { bucketStatuses, unsortedTransactions } from '$lib/stores/budgetStore';
  import MonthMenu from '$lib/components/layout/MonthMenu.svelte';
  import BudgetSummary from '$lib/components/budget/BudgetSummary.svelte';
  import EnvelopeRow from '$lib/components/budget/EnvelopeRow.svelte';
  import AssignSheet from '$lib/components/budget/AssignSheet.svelte';
  import IncomeSheet from '$lib/components/budget/IncomeSheet.svelte';
  import GoalSheet from '$lib/components/budget/GoalSheet.svelte';
  import NotesSheet from '$lib/components/budget/NotesSheet.svelte';
  import GoalsSection from '$lib/components/budget/GoalsSection.svelte';
  import { groupEnvelopes } from '$lib/budget/groups';
  import { openModal } from '$lib/stores/uiStore';
  import EnvelopeSheet from '$lib/components/budget/EnvelopeSheet.svelte';

  const newEnvelope = () => openModal('bucket-form');

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
    <button class="btn-icon text-tint" on:click={newEnvelope} aria-label="New envelope"><Icon name="plus" size={24} /></button>
  </svelte:fragment>
</NavBar>

<div class="space-y-6">
  <BudgetSummary />

  {#each sections as section (section.title)}
    <section aria-label={section.title}>
      <h2 class="settings-label">{section.title}{#if section.note}<span class="font-normal">{' · '}{section.note}</span>{/if}</h2>
      <div class="group">
        {#each section.rows as status (status.bucket.id)}
          <EnvelopeRow {status} href="{base}/budget/{status.bucket.id}" />
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
      <button type="button" on:click={newEnvelope} class="group-row flex min-h-[56px] w-full items-center gap-3 px-4 py-2.5 text-left text-label hover:bg-fill">
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
<EnvelopeSheet envelope={null} />
