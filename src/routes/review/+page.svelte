<script lang="ts">
  import NavBar from '$lib/components/layout/NavBar.svelte';
  import CloseButton from '$lib/components/layout/CloseButton.svelte';
  import Deck from '$lib/components/review/Deck.svelte';
  import ReviewList from '$lib/components/review/ReviewList.svelte';
  import DismissSheet from '$lib/components/review/DismissSheet.svelte';
  import ReviewEditSheet from '$lib/components/review/ReviewEditSheet.svelte';
  import EnvelopePicker from '$lib/components/shared/EnvelopePicker.svelte';
  import { segmentedPill } from '$lib/actions/segmentedPill';
  import { showToast } from '$lib/stores/toastStore';
  import { openModal, closeModal } from '$lib/stores/uiStore';
  import { baseCurrency } from '$lib/stores/currencyStore';
  import {
    captures, pendingCaptures, bulkApprovable, rateFor,
    approveCapture, approveCaptureAs, dismissCapture, undoCapture, notDuplicate, approveAllSuggested,
  } from '$lib/stores/captureStore';
  import { formatCurrency } from '$lib/utils/currency';
  import { haptic } from '$lib/ui/haptics';
  import type { TransactionValues } from '$lib/components/shared/transactionValues';
  import type { Capture } from '$lib/types';

  // Payments noticed on the phone, waiting to be approved, changed or
  // dismissed. Nothing counts in an envelope until it is approved.

  type Filter = 'pending' | 'approved' | 'dismissed';
  let filter: Filter = 'pending';
  let error = '';
  let deck: Deck;

  const WEEK = 7 * 24 * 3600 * 1000;
  $: decided =
    filter === 'pending'
      ? []
      : $captures
          .filter((c) => c.status === filter && (filter === 'dismissed' || (c.resolvedAt ?? 0) > Date.now() - WEEK))
          .sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0));
  $: bulkTotal = $bulkApprovable.reduce((sum, x) => sum + (x.amount ?? 0), 0);

  async function attempt(action: () => Promise<void>): Promise<boolean> {
    try {
      error = '';
      await action();
      return true;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  // Every decision can be taken back for 8 seconds.
  function offerUndo(id: string, text: string) {
    showToast({ message: text, action: { label: 'Undo', run: () => void attempt(() => undoCapture(id)) }, ms: 8000 });
  }

  const needsRate = (c: Capture) => c.currency !== $baseCurrency && !rateFor(c.currency);

  // Approve with the suggested envelope, or ask for what is missing first.
  function approve(c: Capture) {
    const need = deck?.need(c);
    if (need === 'envelope') return startPick(c);
    if (need === 'rate') return startEdit(c);
    void attempt(async () => {
      await approveCapture(c.id);
      haptic('success');
      offerUndo(c.id, `Approved ${c.merchant}`);
    });
  }

  function dismiss(c: Capture) {
    void attempt(async () => {
      await dismissCapture(c.id);
      haptic('light');
      offerUndo(c.id, `Dismissed ${c.merchant}`);
    });
  }

  async function approveAll() {
    const n = $bulkApprovable.length;
    if (!confirm(`Approve ${n} ${n === 1 ? 'payment' : 'payments'} (${formatCurrency(bulkTotal)}) into their suggested envelopes?`)) return;
    if (await attempt(async () => void (await approveAllSuggested()))) haptic('success');
  }

  // The envelope pill, or Approve on a card with no suggestion.
  let picking: Capture | null = null;
  function startPick(c: Capture) {
    picking = c;
    openModal('review-pick');
  }
  function picked(bucketId: string, name: string) {
    const c = picking;
    closeModal('review-pick');
    if (!c) return;
    // Another currency with no rate yet: the form asks for it.
    if (needsRate(c)) return startEdit(c, bucketId);
    void attempt(async () => {
      await approveCapture(c.id, { bucketId });
      haptic('success');
      offerUndo(c.id, `Approved ${c.merchant} into ${name}`);
    });
  }

  // Edit, then approve: the same form as editing an expense.
  let editing: Capture | null = null;
  let editBucket: string | null = null;
  function startEdit(c: Capture, bucketId: string | null = null) {
    editing = c;
    editBucket = bucketId;
    error = '';
    openModal('review-edit');
  }
  async function saveEdit(c: Capture, v: TransactionValues) {
    const ok = await attempt(() => approveCaptureAs(c.id, { amount: v.baseCents, foreign: v.foreign, bucketId: v.bucketId, date: v.date, note: v.note }));
    if (!ok) return;
    closeModal('review-edit');
    editing = null;
    haptic('success');
    offerUndo(c.id, `Approved ${c.merchant}`);
  }

  // The Dismiss button asks first, and can ignore the payee from now on.
  let dismissing: Capture | null = null;
  function startDismiss(c: Capture) {
    dismissing = c;
    openModal('review-dismiss');
  }
  async function confirmDismiss(c: Capture, ignorePayee: boolean) {
    const ok = await attempt(() => dismissCapture(c.id, { ignorePayee }));
    if (!ok) return;
    closeModal('review-dismiss');
    dismissing = null;
    haptic('light');
    offerUndo(c.id, `Dismissed ${c.merchant}`);
  }
</script>

<NavBar title="To review" large={false} pinTitle>
  <svelte:fragment slot="leading"><CloseButton /></svelte:fragment>
  <svelte:fragment slot="trailing">
    <span class="pr-1.5 text-[15px] text-label-2">{$pendingCaptures.length} left</span>
  </svelte:fragment>
</NavBar>

<div class="mx-auto max-w-md space-y-4 pt-1">
  <div class="segmented" role="tablist" aria-label="Payments" use:segmentedPill>
    {#each [['pending', 'To review'], ['approved', 'Approved'], ['dismissed', 'Dismissed']] as [key, label]}
      <button type="button" role="tab" aria-selected={filter === key} class="segment" on:click={() => (filter = key as Filter)}>
        {label}{key === 'pending' && $pendingCaptures.length ? ` (${$pendingCaptures.length})` : ''}
      </button>
    {/each}
  </div>

  {#if error}<p class="px-1 text-[15px] text-danger" role="alert">{error}</p>{/if}

  {#if filter === 'pending'}
    {#if $bulkApprovable.length > 0}
      <button type="button" class="btn-secondary w-full" on:click={approveAll}>Approve all suggested ({$bulkApprovable.length})</button>
    {/if}
    <Deck
      bind:this={deck}
      captures={$pendingCaptures}
      on:approve={(e) => approve(e.detail)}
      on:dismiss={(e) => dismiss(e.detail)}
      on:dismissAsk={(e) => startDismiss(e.detail)}
      on:edit={(e) => startEdit(e.detail)}
      on:pick={(e) => startPick(e.detail)}
      on:notDuplicate={(e) => attempt(() => notDuplicate(e.detail))}
    />
    {#if $pendingCaptures.length}
      <p class="px-1 pt-2 text-center text-[13px] text-label-2">They count toward safe to spend straight away, and reach an envelope once you approve them.</p>
    {/if}
  {:else}
    <ReviewList captures={decided} status={filter} on:reopen={(e) => attempt(() => undoCapture(e.detail))} />
  {/if}
</div>

<EnvelopePicker id="review-pick" title="Choose envelope" current={null} on:pick={(e) => picked(e.detail.id, e.detail.name)} />
<ReviewEditSheet capture={editing} bucketId={editBucket} {error} onApprove={saveEdit} />
<DismissSheet capture={dismissing} on:dismiss={(e) => confirmDismiss(e.detail.capture, e.detail.ignorePayee)} />
