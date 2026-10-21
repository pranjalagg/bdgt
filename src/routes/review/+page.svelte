<script lang="ts">
  import { base } from '$app/paths';
  import Modal from '$lib/components/shared/Modal.svelte';
  import { buckets, transactions } from '$lib/stores/budgetStore';
  import { baseCurrency } from '$lib/stores/currencyStore';
  import { openModal, closeModal } from '$lib/stores/uiStore';
  import {
    captures, pendingCaptures, duplicatesOf, suggestions, bulkApprovable, rateFor,
    approveCapture, dismissCapture, undoCapture, notDuplicate, approveAllSuggested,
  } from '$lib/stores/captureStore';
  import { HINT_TEXT, baseAmount } from '$lib/capture/queue';
  import { fetchRate } from '$lib/currency/fetchRate';
  import { parseRate } from '$lib/currency/conversion';
  import { formatCurrency, formatMoney, parseCurrency } from '$lib/utils/currency';
  import { getLocalDateKey, parseLocalDate } from '$lib/utils/dates';
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

  function approvedBucketName(c: Capture): string {
    const tx = $transactions.find((t) => t.id === c.transactionId);
    return (tx && bucketById.get(tx.bucketId)?.name) ?? 'a bucket';
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

  // Edit, then approve.
  let editing: Capture | null = null;
  let editAmount = '';
  let editBucket = '';
  let editDate = '';
  let editNote = '';
  let editRate = '';
  let fetchingRate = false;
  $: editForeign = !!editing && editing.currency !== $baseCurrency;

  function startEdit(c: Capture) {
    editing = c;
    editAmount = (c.amount / 100).toFixed(2);
    editBucket = $suggestions.get(c.id)?.bucketId ?? '';
    editDate = getLocalDateKey(new Date(c.date));
    editNote = c.merchant;
    editRate = c.currency === $baseCurrency ? '' : String(rateFor(c.currency) ?? '');
    error = '';
    openModal('review-edit');
  }

  async function getRate() {
    if (!editing) return;
    fetchingRate = true;
    try {
      editRate = String(await fetchRate($baseCurrency, editing.currency));
    } catch {
      error = 'Could not fetch a rate; type it instead.';
    } finally {
      fetchingRate = false;
    }
  }

  async function saveEdit() {
    if (!editing) return;
    const amount = parseCurrency(editAmount);
    if (!Number.isFinite(amount) || amount <= 0) return void (error = 'Enter the amount paid.');
    if (!editBucket) return void (error = 'Choose a bucket.');
    const rate = editForeign ? parseRate(editRate) : undefined;
    if (editForeign && !rate) return void (error = 'Enter a rate to convert.');
    const c = editing;
    await attempt(async () => {
      await approveCapture(c.id, { bucketId: editBucket, amount, date: parseLocalDate(editDate), note: editNote, rate: rate ?? undefined });
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
      <a href="{base}/transactions" class="text-sm text-muted hover:text-gray-900 dark:text-muted-dark dark:hover:text-gray-100">&larr; Activity</a>
      <h1 class="page-title">Review payments</h1>
    </div>
    {#if filter === 'pending' && $bulkApprovable.length > 0}
      <button type="button" class="btn-primary" on:click={approveAll}>
        Approve all suggested ({$bulkApprovable.length})
      </button>
    {/if}
  </div>

  <p class="text-sm text-muted dark:text-muted-dark">
    Payments your phone noticed. They count toward safe to spend straight away, and reach a bucket once you approve them.
  </p>

  <div class="flex gap-2" role="tablist">
    {#each [['pending', 'To review'], ['approved', 'Approved'], ['dismissed', 'Dismissed']] as [key, label]}
      <button
        type="button"
        role="tab"
        aria-selected={filter === key}
        class="rounded-full px-3 py-1.5 text-sm font-medium {filter === key ? 'bg-primary text-white dark:text-gray-900' : 'bg-gray-100 text-gray-700 dark:bg-white/[0.06] dark:text-gray-200'}"
        on:click={() => (filter = key as Filter)}
      >{label}{key === 'pending' && $pendingCaptures.length ? ` (${$pendingCaptures.length})` : ''}</button>
    {/each}
  </div>

  {#if error}<p class="text-sm text-danger dark:text-danger-light" role="alert">{error}</p>{/if}

  {#if shown.length === 0}
    <div class="card p-5 text-sm text-muted dark:text-muted-dark">
      {filter === 'pending' ? 'Nothing to review. New payments from your phone show up here.' : 'Nothing here.'}
    </div>
  {:else}
    <ul class="card divide-y divide-gray-100 dark:divide-border-dark">
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
            <p class="rounded-md bg-warning/10 px-2.5 py-1.5 text-xs text-gray-800 dark:text-gray-100">{HINT_TEXT[c.hint]}</p>
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
                {c.status === 'approved' ? `Approved into ${approvedBucketName(c)}` : 'Dismissed'}
              </span>
              <button type="button" class="btn-secondary" on:click={() => attempt(() => undoCapture(c.id))}>Back to review</button>
            </div>
          {/if}

          {#each $duplicatesOf.get(c.id) ?? [] as d (d.id)}
            <div class="flex items-center justify-between gap-3 rounded-md bg-gray-50 px-2.5 py-1.5 text-xs dark:bg-white/[0.04]">
              <span class="text-muted dark:text-muted-dark">Also seen: {d.sourceLabel} · {when(d)}</span>
              <button type="button" class="font-medium text-gray-900 underline dark:text-gray-100" on:click={() => attempt(() => notDuplicate(d.id))}>Not a duplicate</button>
            </div>
          {/each}
        </li>
      {/each}
    </ul>
  {/if}
</div>

{#if lastAction}
  <div class="fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 md:bottom-6">
    <div class="flex items-center gap-4 rounded-lg bg-gray-900 px-4 py-2.5 text-sm text-white shadow-lg dark:bg-gray-100 dark:text-gray-900">
      <span>{lastAction.text}</span>
      <button type="button" class="font-semibold underline" on:click={undo}>Undo</button>
    </div>
  </div>
{/if}

<Modal id="review-edit" title="Edit and approve">
  {#if editing}
    <form class="space-y-4 pt-4" on:submit|preventDefault={saveEdit}>
      <div>
        <label for="review-amount" class="label">Amount paid ({editing.currency})</label>
        <input id="review-amount" class="input-base money" inputmode="decimal" bind:value={editAmount} />
      </div>
      {#if editForeign}
        <div>
          <label for="review-rate" class="label">{editing.currency} per 1 {$baseCurrency}</label>
          <div class="flex gap-2">
            <input id="review-rate" class="input-base" inputmode="decimal" bind:value={editRate} />
            <button type="button" class="btn-secondary flex-none" disabled={fetchingRate} on:click={getRate}>{fetchingRate ? 'Fetching…' : 'Fetch rate'}</button>
          </div>
        </div>
      {/if}
      <div>
        <label for="review-bucket" class="label">Bucket</label>
        <select id="review-bucket" class="select-base" bind:value={editBucket}>
          <option value="">Choose a bucket</option>
          {#each assignable as b (b.id)}<option value={b.id}>{b.name}</option>{/each}
        </select>
      </div>
      <div>
        <label for="review-date" class="label">Date</label>
        <input id="review-date" type="date" class="input-base" bind:value={editDate} />
      </div>
      <div>
        <label for="review-note" class="label">Note</label>
        <input id="review-note" class="input-base" bind:value={editNote} />
      </div>
      {#if error}<p class="text-sm text-danger dark:text-danger-light" role="alert">{error}</p>{/if}
      <div class="flex gap-3">
        <button type="submit" class="btn-primary">Approve</button>
        <button type="button" class="btn-secondary" on:click={closeModal}>Cancel</button>
      </div>
    </form>
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
