<script lang="ts">
  // Entry is amount-first: today you pick a bucket, then say how much --
  // backwards, since you always know the amount first (you're holding a
  // receipt). Type it here, and every bucket answers the question you
  // actually came to ask: does this fit? Tapping a bucket commits in one
  // motion, replacing the old amount -> dropdown -> submit sequence.
  import { bucketStatuses, addTransaction } from '$lib/stores/budgetStore';
  import { currentMonthKey } from '$lib/stores/uiStore';
  import { parseCurrency, isValidCurrency, isExpression, evaluateExpression, formatCurrency } from '$lib/utils/currency';
  import { defaultEntryDate } from '$lib/utils/dates';
  import { calculateBucketFit, type BucketFitStatus } from '$lib/utils/calculations';

  export let preselectedBucketId: string | undefined = undefined;
  export let onComplete: (() => void) | undefined = undefined;

  let amount = '';
  let note = '';
  let isSubmitting = false;
  let amountTouched = false;
  let amountInput: HTMLInputElement | undefined;

  $: amountError = amountTouched && amount && !isValidCurrency(amount)
    ? 'Please enter a valid amount (e.g. 12.50, -5, 10 + 5.25, or 12.50 * 3)'
    : '';

  $: showPreview = isExpression(amount) && isValidCurrency(amount);
  $: previewValue = showPreview ? evaluateExpression(amount) : null;

  $: amountCents = isValidCurrency(amount) ? parseCurrency(amount) : 0;

  $: rows = $bucketStatuses
    .filter((s) => !s.bucket.isSystem)
    .filter((s) => !preselectedBucketId || s.bucket.id === preselectedBucketId)
    .map((s) => ({
      status: s,
      fit: calculateBucketFit(amountCents, s.remaining, s.allocated) as BucketFitStatus,
    }));

  const fitLabel = (row: (typeof rows)[number]): string => {
    const { status, fit } = row;
    if (fit === 'unfunded') return 'not assigned';
    if (fit === 'neutral') return formatCurrency(status.remaining) + ' left';
    if (fit === 'fits') return formatCurrency(status.remaining - amountCents) + ' after';
    return formatCurrency(amountCents - status.remaining) + ' over';
  };

  function handleAmountInput() {
    amountTouched = true;
  }

  let list: HTMLDivElement | undefined;

  // Enter is the keyboard "submit": with one candidate bucket (opened from
  // an envelope) it logs straight away; otherwise it hops to the first
  // bucket so a second Enter commits, and arrows walk the list.
  function handleEnter(e: KeyboardEvent) {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    if (!amount || !isValidCurrency(amount)) {
      amountTouched = true;
      amountInput?.focus();
      return;
    }
    if (rows.length === 1) commit(rows[0].status.bucket.id);
    else list?.querySelector<HTMLButtonElement>('button')?.focus();
  }

  function handleListKeydown(e: KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...(list?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
  }

  async function commit(bucketId: string) {
    // Inputs stay enabled during the write, so Enter can fire again.
    if (isSubmitting) return;
    amountTouched = true;
    if (!amount || amountError || !isValidCurrency(amount)) {
      amountInput?.focus();
      return;
    }
    isSubmitting = true;
    try {
      await addTransaction({
        amount: parseCurrency(amount),
        bucketId,
        date: defaultEntryDate($currentMonthKey),
        note: note || undefined,
      });
      amount = '';
      note = '';
      amountTouched = false;
      onComplete?.();
    } finally {
      isSubmitting = false;
    }
  }
</script>

<div class="space-y-4">
  <div>
    <label for="log-amount" class="label">Amount</label>
    <div class="relative mt-1.5">
      <span class="absolute left-4 top-1/2 -translate-y-1/2 text-lg text-muted dark:text-muted-dark">$</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        id="log-amount"
        type="text"
        inputmode="decimal"
        autofocus
        bind:this={amountInput}
        bind:value={amount}
        on:input={handleAmountInput}
        on:keydown={handleEnter}
        placeholder="0.00"
        class="money w-full rounded-lg border bg-white py-3 pl-9 pr-3 text-3xl font-medium tracking-tight
               transition-shadow focus:outline-none focus:ring-2 focus:ring-primary/20
               dark:bg-gray-800/50 dark:text-gray-100
               {amountError ? 'border-danger focus:border-danger focus:ring-danger/20' : 'border-border focus:border-primary dark:border-border-dark'}"
      />
    </div>
    {#if amountError}
      <p class="mt-1.5 text-sm text-danger dark:text-danger-light">{amountError}</p>
    {:else if showPreview && previewValue !== null}
      <p class="mt-1.5 text-sm text-muted dark:text-muted-dark">= ${previewValue.toFixed(2)}</p>
    {:else}
      <p class="mt-1.5 text-[12.5px] text-muted dark:text-muted-dark">
        {preselectedBucketId ? 'Confirm the amount, then log it' : 'Then tap where it goes, or press Enter and pick with arrows — green fits, red breaks it'}
      </p>
    {/if}
  </div>

  <div>
    <label for="log-note" class="label">Note (optional)</label>
    <input id="log-note" type="text" bind:value={note} on:keydown={handleEnter} placeholder="Add a note…" class="mt-1.5 input-base" />
  </div>

  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    bind:this={list}
    on:keydown={handleListKeydown}
    role="group"
    aria-label="Buckets"
    class="max-h-[42vh] space-y-1.5 overflow-y-auto pr-1"
  >
    {#each rows as row (row.status.bucket.id)}
      <button
        type="button"
        on:click={() => commit(row.status.bucket.id)}
        disabled={isSubmitting}
        class="flex w-full items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left transition-colors
               focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60
               {row.fit === 'fits'
          ? 'border-success/40 bg-success/[0.06] hover:bg-success/10 dark:border-success-light/30'
          : row.fit === 'tight' || row.fit === 'unfunded'
            ? 'border-danger/40 bg-danger/[0.06] hover:bg-danger/10 dark:border-danger-light/30'
            : 'border-border bg-white hover:border-rule dark:border-border-dark dark:bg-surface-dark dark:hover:border-white/20'}"
      >
        <span class="h-4 w-[3px] flex-none rounded-sm" style="background:{row.status.bucket.color}"></span>
        <span class="flex-1 truncate text-[13.5px] font-medium text-gray-900 dark:text-gray-100">
          {row.status.bucket.name}
        </span>
        <span
          class="money flex-none text-[12.5px] font-medium
                 {row.fit === 'fits'
            ? 'text-success dark:text-success-light'
            : row.fit === 'tight' || row.fit === 'unfunded'
              ? 'text-danger dark:text-danger-light'
              : 'text-muted dark:text-muted-dark'}"
        >
          {fitLabel(row)}
        </span>
      </button>
    {/each}
  </div>
</div>
