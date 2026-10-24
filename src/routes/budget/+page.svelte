<script lang="ts">
  // Budget: the month's plan. Income and what is left to assign on top,
  // then the envelopes in three groups, then bills, goals and notes.
  import NavBar from '$lib/components/layout/NavBar.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import IconMark from '$lib/components/ui/IconMark.svelte';
  import SectionHeading from '$lib/components/ui/SectionHeading.svelte';
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

<div class="space-y-9">
  <BudgetSummary />

  {#each sections as section (section.title)}
    <section aria-label={section.title}>
      <SectionHeading strong={section.title} soft="envelopes" />
      {#if section.note}<p class="-mt-2 pb-2 text-[13px] text-label-2">{section.note}</p>{/if}
      <div class="list">
        {#each section.rows as status (status.bucket.id)}
          <EnvelopeRow {status} href="{base}/budget/{status.bucket.id}" />
        {/each}
      </div>
    </section>
  {/each}

  {#if $unsortedTransactions.length > 0 && groups.unsorted}
    <section aria-label="Needs an envelope">
      <SectionHeading strong="Needs an" soft="envelope" />
      <div class="list">
        <EnvelopeRow status={groups.unsorted} href="{base}/activity?bucket=unsorted" />
      </div>
    </section>
  {/if}

  <section aria-label="More">
    <SectionHeading strong="More" />
    <div class="list">
      <a href="{base}/budget/bills" class="row row-tap focus:outline-none focus-visible:ring-2 focus-visible:ring-tint">
        <IconMark icon="calendar" />
        <span class="t-row min-w-0 flex-1">Bills and subscriptions</span>
        <span class="text-label-2" aria-hidden="true"><Icon name="chevron-right" size={18} /></span>
      </a>
      <button type="button" on:click={() => openModal('notes')} class="row row-tap focus:outline-none focus-visible:ring-2 focus-visible:ring-tint">
        <IconMark icon="list" />
        <span class="t-row min-w-0 flex-1">Month notes</span>
        <span class="text-label-2" aria-hidden="true"><Icon name="chevron-right" size={18} /></span>
      </button>
      <button type="button" on:click={newEnvelope} class="row row-tap focus:outline-none focus-visible:ring-2 focus-visible:ring-tint">
        <IconMark icon="plus" />
        <span class="t-row min-w-0 flex-1">New envelope</span>
        <span class="text-label-2" aria-hidden="true"><Icon name="chevron-right" size={18} /></span>
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
