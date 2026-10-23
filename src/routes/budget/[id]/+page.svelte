<script lang="ts">
  import { page } from '$app/stores';
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import NavBar from '$lib/components/layout/NavBar.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Modal from '$lib/components/shared/Modal.svelte';
  import EditTransaction from '$lib/components/shared/EditTransaction.svelte';
  import GoalCard from '$lib/components/shared/GoalCard.svelte';
  import EnvelopeRing from '$lib/components/budget/EnvelopeRing.svelte';
  import EnvelopeSheet from '$lib/components/budget/EnvelopeSheet.svelte';
  import AssignSheet from '$lib/components/budget/AssignSheet.svelte';
  import RecurringRow from '$lib/components/budget/RecurringRow.svelte';
  import RecurringSheet from '$lib/components/budget/RecurringSheet.svelte';
  import { bucketStatuses, currentMonthTransactions, isLoading } from '$lib/stores/budgetStore';
  import { recurringTransactions } from '$lib/stores/recurringStore';
  import { goalStatuses } from '$lib/stores/goalsStore';
  import { openModal, openLog } from '$lib/stores/uiStore';
  import { formatCurrency } from '$lib/utils/currency';
  import { envelopeIcon } from '$lib/ui/icons';
  import type { RecurringTransaction, Transaction } from '$lib/types';

  // One envelope: what is left this month, where it came from, what is
  // coming up, and every expense in it this month.

  $: id = $page.params.id;
  $: status = $bucketStatuses.find((s) => s.bucket.id === id);
  // An envelope that no longer exists (deleted, or a stale link) sends you
  // back to Budget once the data has loaded.
  $: if (!$isLoading && $bucketStatuses.length > 0 && !status) void goto(`${base}/budget`, { replaceState: true });

  $: goals = $goalStatuses.filter((g) => g.goal.bucketId === id);
  $: recurring = $recurringTransactions.filter((r) => r.bucketId === id).sort((a, b) => new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime());
  $: txs = $currentMonthTransactions.filter((t) => t.bucketId === id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  let editingRec: RecurringTransaction | null = null;
  let editingTx: Transaction | null = null;
  const whole = (c: number) => formatCurrency(c).replace(/\.00$/, '');
  const day = (d: Date) => new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
</script>

<NavBar title={status?.bucket.name ?? 'Envelope'} large={false} back={{ href: `${base}/budget`, label: 'Budget' }} />

{#if status}
  <div class="space-y-6">
    <div class="grid justify-items-center gap-2 pt-1 text-center">
      <span class="flex h-14 w-14 items-center justify-center rounded-[17px] text-white" style="background:{status.bucket.color}">
        <Icon name={envelopeIcon(status.bucket.name, status.bucket.isSystem)} size={30} strokeWidth={2.1} />
      </span>
      <p class="text-[22px] font-bold text-label">{status.bucket.name}</p>
      <EnvelopeRing {status} />
    </div>

    <div class="card grid grid-cols-3 divide-x divide-sep text-center">
      <div class="px-2 py-3"><p class="text-[12px] text-label-2">Assigned</p><p class="money amt text-[16px] font-semibold text-label">{whole(status.allocated)}</p></div>
      <div class="px-2 py-3"><p class="text-[12px] text-label-2">{status.bucket.isSavings ? 'Saved' : 'Spent'}</p><p class="money amt text-[16px] font-semibold text-label">{whole(status.spent)}</p></div>
      <div class="px-2 py-3"><p class="text-[12px] text-label-2">Carried in</p><p class="money amt text-[16px] font-semibold text-label">{whole(status.rollover)}</p></div>
    </div>

    <div class="grid grid-cols-3 gap-2">
      <button type="button" class="btn-secondary !px-2 !text-tint" on:click={() => openLog(status?.bucket.id)}><Icon name="plus" size={18} />Log here</button>
      <button type="button" class="btn-secondary !px-2 !text-tint" on:click={() => openModal('assign')}>Assign more</button>
      <button type="button" class="btn-secondary !px-2 !text-tint" on:click={() => openModal('bucket-form')}>Edit</button>
    </div>

    {#if goals.length}
      <section aria-label="Goal">
        <h2 class="settings-label">Goal</h2>
        <div class="grid gap-1.5">{#each goals as g}<GoalCard status={g} />{/each}</div>
      </section>
    {/if}

    {#if recurring.length}
      <section aria-label="Coming up">
        <h2 class="settings-label">Coming up</h2>
        <div class="group">
          {#each recurring as item (item.id)}
            <RecurringRow {item} onClick={() => { editingRec = item; openModal('recurring-form'); }} />
          {/each}
        </div>
      </section>
    {/if}

    <section aria-label="This month">
      <h2 class="settings-label">This month</h2>
      {#if txs.length === 0}
        <div class="card px-4 py-6 text-center text-[15px] text-label-2">Nothing yet this month.</div>
      {:else}
        <div class="group">
          {#each txs as t (t.id)}
            <button type="button" data-row class="group-row flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-fill focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-tint" style="--row-inset: 16px" on:click={() => { editingTx = t; openModal('edit-transaction'); }}>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[16px] font-medium text-label">{t.note || status.bucket.name}</span>
                <span class="block text-[13px] text-label-2">{day(t.date)}</span>
              </span>
              <span class="money amt flex-none text-[16px] font-semibold {status.bucket.isSavings ? 'text-success' : 'text-label'}">{formatCurrency(t.amount)}</span>
            </button>
          {/each}
        </div>
      {/if}
    </section>
  </div>

  <EnvelopeSheet envelope={status.bucket} />
  <AssignSheet focusEnvelopeId={status.bucket.id} />
  <RecurringSheet item={editingRec} defaultBucketId={status.bucket.id} />
  <Modal id="edit-transaction" title="Edit expense">
    {#if editingTx}
      {#key editingTx.id}<EditTransaction transaction={editingTx} />{/key}
    {/if}
  </Modal>
{/if}
