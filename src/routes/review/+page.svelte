<script lang="ts">
  import { segmentedPill } from '$lib/actions/segmentedPill';
  import { base } from '$app/paths';
  import Modal from '$lib/components/shared/Modal.svelte';
  import { buckets, transactions } from '$lib/stores/budgetStore';
  import { baseCurrency } from '$lib/stores/currencyStore';
  import { openModal, closeModal } from '$lib/stores/uiStore';
  import TransactionForm from '$lib/components/shared/TransactionForm.svelte';
  import type { TransactionValues } from '$lib/components/shared/transactionValues';
  import {
    captures, pendingCaptures, duplicatesOf, suggestions, bulkApprovable, rateFor,
    approveCapture, approveCaptureAs, dismissCapture, undoCapture, notDuplicate, approveAllSuggested,
  } from '$lib/stores/captureStore';
  import { HINT_TEXT, baseAmount, recordedDiffers } from '$lib/capture/queue';
  import { formatCurrency, formatMoney } from '$lib/utils/currency';
  import type { Capture } from '$lib/types';

  // Payments noticed on the phone, waiting to be approved, changed or
  // dismissed. Nothing counts in a bucket until it is approved.

  type Filter = 'pending' | 'approved' | 'dismissed';
  let filter: Filter = 'pending';
  let error = '';

  const WEEK = 7 * 24 * 3600 * 1000;
  $: assignable = $buckets.filter((b) => !b.isSystem);
  $: bucketById = new Map($buckets.map((b) => [b.id, b]));
  $: shown =
    filter === 'pending'
      ? $pendingCaptures
      : $captures
          .filter((c) => c.status === filter && (filter === 'dismissed' || (c.resolvedAt ?? 0) > Date.now() - WEEK))
          .sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0));
  $: bulkTotal = $bulkApprovable.reduce((sum, x) => sum + (x.amount ?? 0), 0);

  function when(c: Capture): string {
    return new Date(c.postedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }

  function estimate(c: Capture): string | null {
    if (c.currency === $baseCurrency) return null;
    const amount = baseAmount(c, $baseCurrency, rateFor(c.currency));
    return amount === null ? 'rate needed' : `≈ ${formatCurrency(amount)}`;
  }

  // "Approved into Dining Out", plus what went into the budget when that is
  // not simply the amount paid (part of a shared bill, or converted).
  function approvedText(c: Capture): string {
    const tx = $transactions.find((t) => t.id === c.transactionId);
    if (!tx) return 'Approved';
    const into = `Approved into ${bucketById.get(tx.bucketId)?.name ?? 'a bucket'}`;
    return recordedDiffers(c, tx, $baseCurrency) ? `${into} · recorded ${formatCurrency(tx.amount)}` : into;
  }

  function reasonText(c: Capture): string {
    const s = $suggestions.get(c.id);
    if (!s) return '';
    const name = bucketById.get(s.bucketId)?.name ?? '';
    return s.reason === 'rule' ? `Last filed under ${name}` : `Usually ${name}`;
  }

  // The bar at the bottom offering to undo the last action.
  let lastAction: { id: string; text: string } | null = null;
  let undoTimer: ReturnType<typeof setTimeout> | undefined;
  function offerUndo(id: string, text: string) {
    lastAction = { id, text };
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => (lastAction = null), 8000);
  }

  async function attempt(action: () => Promise<void>) {
    try {
      error = '';
      await action();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  function approve(c: Capture) {
    if (!$suggestions.get(c.id) || (c.currency !== $baseCurrency && !rateFor(c.currency))) return startEdit(c);
    void attempt(async () => {
      await approveCapture(c.id);
      offerUndo(c.id, `Approved ${c.merchant}`);
    });
  }

  async function undo() {
    if (!lastAction) return;
    const { id } = lastAction;
    lastAction = null;
    await attempt(() => undoCapture(id));
  }

  async function approveAll() {
    const n = $bulkApprovable.length;
    if (!confirm(`Approve ${n} ${n === 1 ? 'payment' : 'payments'} (${formatCurrency(bulkTotal)}) into their suggested buckets?`)) return;
    await attempt(async () => {
      await approveAllSuggested();
    });
  }

  // Edit, then approve: the same form as editing a transaction in Activity.
  let editing: Capture | null = null;

  function startEdit(c: Capture) {
    editing = c;
    error = '';
    openModal('review-edit');
  }

  function editInitial(c: Capture) {
    return {
      amount: c.amount,
      currency: c.currency,
      rate: c.currency === $baseCurrency ? undefined : rateFor(c.currency) ?? undefined,
      bucketId: $suggestions.get(c.id)?.bucketId ?? '',
      date: new Date(c.date),
      note: c.merchant,
    };
  }

  async function saveEdit(v: TransactionValues) {
    if (!editing) return;
    const c = editing;
    await attempt(async () => {
      await approveCaptureAs(c.id, { amount: v.baseCents, foreign: v.foreign, bucketId: v.bucketId, date: v.date, note: v.note });
      closeModal();
      editing = null;
      offerUndo(c.id, `Approved ${c.merchant}`);
    });
  }

  // Dismiss, optionally ignoring the payee from now on.
  let dismissing: Capture | null = null;
  let ignorePayee = false;
  function startDismiss(c: Capture) {
    dismissing = c;
    ignorePayee = false;
    openModal('review-dismiss');
  }
  async function confirmDismiss() {
    if (!dismissing) return;
    const c = dismissing;
    await attempt(async () => {
      await dismissCapture(c.id, { ignorePayee });
      closeModal();
      dismissing = null;
      offerUndo(c.id, `Dismissed ${c.merchant}`);
    });
  }
</script>

<div class="space-y-5 pb-16">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <a href="{base}/transactions" class="-ml-2 inline-flex min-h-[2.75rem] items-center gap-0.5 rounded-full pl-1 pr-3 text-[15px] font-medium text-gray-700 hover:bg-black/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.06]">
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
        Activity
      </a>
      <h1 class="page-title">Review payments</h1>
    </div>
    {#if filter === 'pending' && $bulkApprovable.length > 0}
      <button type="button" class="btn-secondary" on:click={approveAll}>
        Approve all suggested ({$bulkApprovable.length})
      </button>
    {/if}
  </div>

  <p class="text-sm text-muted dark:text-muted-dark">
    Payments your phone noticed. They count toward safe to spend straight away, and reach a bucket once you approve them.
  </p>

  <div class="segmented" role="tablist" aria-label="Payments" use:segmentedPill>
    {#each [['pending', 'To review'], ['approved', 'Approved'], ['dismissed', 'Dismissed']] as [key, label]}
      <button
        type="button"
        role="tab"
        aria-selected={filter === key}
        class="segment"
        on:click={() => (filter = key as Filter)}
      >{label}{key === 'pending' && $pendingCaptures.length ? ` (${$pendingCaptures.length})` : ''}</button>
    {/each}
  </div>

  {#if filter === 'approved'}
    <p class="text-sm text-muted dark:text-muted-dark">The last 7 days. Older ones are in Activity like any other transaction.</p>
  {/if}

  {#if error}<p class="text-sm text-danger dark:text-danger-light" role="alert">{error}</p>{/if}

  {#if shown.length === 0}
    <div class="card p-5 text-sm text-muted dark:text-muted-dark">
      {filter === 'pending' ? 'Nothing to review. New payments from your phone show up here.' : 'Nothing here.'}
    </div>
  {:else}
    <ul class="card divide-y divide-border overflow-hidden dark:divide-border-dark">
      {#each shown as c (c.id)}
        {@const suggestion = $suggestions.get(c.id)}
        {@const suggested = suggestion ? bucketById.get(suggestion.bucketId) : undefined}
        {@const est = estimate(c)}
        <li class="space-y-2 p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="truncate font-medium text-gray-900 dark:text-gray-50">{c.merchant}</p>
              <p class="text-xs text-muted dark:text-muted-dark">
                {when(c)} · {c.sourceLabel}{#if c.accountHint} · ••{c.accountHint}{/if}
              </p>
            </div>
            <div class="text-right">
              <p class="money amt font-medium text-gray-900 dark:text-gray-50">{formatMoney(c.amount, c.currency)}</p>
              {#if est}<p class="money amt text-xs text-muted dark:text-muted-dark">{est}</p>{/if}
            </div>
          </div>

          {#if c.hint && c.status === 'pending'}
            <p class="rounded-xl bg-warning/10 px-3 py-2 text-xs text-gray-800 dark:text-gray-100">{HINT_TEXT[c.hint]}</p>
          {/if}

          {#if c.status === 'pending'}
            {#if suggested}
              <p class="flex items-center gap-2 text-sm">
                <span class="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 font-medium text-gray-900 dark:border-border-dark dark:text-gray-100">
                  <span class="h-2 w-2 rounded-full" style="background:{suggested.color}"></span>{suggested.name}
                </span>
                <span class="text-xs text-muted dark:text-muted-dark">{reasonText(c)}</span>
              </p>
            {:else}
              <p class="text-xs text-muted dark:text-muted-dark">No bucket suggested yet</p>
            {/if}
            <div class="flex flex-wrap gap-2 pt-1">
              <button type="button" class="btn-primary" on:click={() => approve(c)}>{!suggested ? 'Choose bucket' : est === 'rate needed' ? 'Add rate' : 'Approve'}</button>
              <button type="button" class="btn-secondary" on:click={() => startEdit(c)}>Edit</button>
              <button type="button" class="btn-secondary" on:click={() => startDismiss(c)}>Dismiss</button>
            </div>
          {:else}
            <div class="flex items-center justify-between gap-3 text-sm">
              <span class="text-muted dark:text-muted-dark">
                {c.status === 'approved' ? approvedText(c) : 'Dismissed'}
              </span>
              <button type="button" class="btn-secondary" on:click={() => attempt(() => undoCapture(c.id))}>Back to review</button>
            </div>
          {/if}

          {#each $duplicatesOf.get(c.id) ?? [] as d (d.id)}
            <div class="flex items-center justify-between gap-3 rounded-xl bg-raised px-3 py-2 text-xs dark:bg-raised-dark">
              <span class="text-muted dark:text-muted-dark">Also seen: {d.sourceLabel} · {when(d)}</span>
              <button type="button" class="font-medium text-gray-900 underline dark:text-gray-100" on:click={() => attempt(() => notDuplicate(d.id))}>Not a duplicate</button>
            </div>
          {/each}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<!-- Above the Log button on phones, as a snackbar sits above a FAB. The
     live region stays mounted so the message is announced when it lands. -->
<div class="pointer-events-none fixed inset-x-0 bottom-[calc(9rem+var(--safe-bottom))] z-40 flex justify-center px-4 md:bottom-6" role="status">
  {#if lastAction}
    <div class="pointer-events-auto flex min-h-[3rem] items-center gap-4 rounded-2xl bg-gray-900 py-1.5 pl-4 pr-1.5 text-sm text-white dark:bg-gray-100 dark:text-gray-900" style="box-shadow: var(--shadow-float)">
      <span>{lastAction.text}</span>
      <button type="button" class="min-h-[2.5rem] rounded-full px-3 font-semibold underline-offset-2 hover:underline" on:click={undo}>Undo</button>
    </div>
  {/if}
</div>

<Modal id="review-edit" title="Edit and approve">
  {#if editing}
    {#key editing.id}
      <div class="pt-4">
        <TransactionForm id="review" initial={editInitial(editing)} submitLabel="Approve" busyLabel="Approving…" onSubmit={saveEdit}>
          {#if error}<p class="text-sm text-danger dark:text-danger-light" role="alert">{error}</p>{/if}
        </TransactionForm>
      </div>
    {/key}
  {/if}
</Modal>

<Modal id="review-dismiss" title="Dismiss payment">
  {#if dismissing}
    <div class="space-y-4 pt-4">
      <p class="text-sm text-gray-700 dark:text-gray-200">
        {dismissing.merchant}, {formatMoney(dismissing.amount, dismissing.currency)}, will not be added to your budget.
      </p>
      {#if dismissing.payeeKey}
        <label class="flex items-start gap-2 text-sm text-gray-800 dark:text-gray-100">
          <input type="checkbox" class="mt-0.5" bind:checked={ignorePayee} />
          <span>Always ignore payments to {dismissing.merchant} (for example a card bill or your own account)</span>
        </label>
      {/if}
      <div class="flex gap-3">
        <button type="button" class="btn-primary" on:click={confirmDismiss}>Dismiss</button>
        <button type="button" class="btn-secondary" on:click={closeModal}>Cancel</button>
      </div>
    </div>
  {/if}
</Modal>
