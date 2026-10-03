<script lang="ts">
  // Closing the gap in one sitting: every bucket, one field each, with a
  // live remainder at the top. Previously assigning money meant visiting
  // the Buckets page and editing one field at a time.
  import { bucketStatuses, currentMonthIncome, setAllocations, carryForwardAllocations } from '$lib/stores/budgetStore';
  import { closeModal } from '$lib/stores/uiStore';
  import { formatCurrency, evaluateExpression, centsToDollars } from '$lib/utils/currency';

  export let onDone: (() => void) | undefined = undefined;

  // Local draft so nothing is written until the user commits.
  let draft: Record<string, string> = {};
  let seeded = false;
  let error = '';
  let isSaving = false;

  $: fixedStatuses = $bucketStatuses.filter((s) => !s.bucket.isSystem && s.bucket.allocationType === 'fixed');
  $: derivedStatuses = $bucketStatuses.filter((s) => !s.bucket.isSystem && s.bucket.allocationType !== 'fixed');

  // Seed once from what's already assigned, so reopening doesn't wipe work.
  $: if (!seeded && $bucketStatuses.length > 0) {
    draft = Object.fromEntries(
      $bucketStatuses
        .filter((s) => s.bucket.allocationType === 'fixed')
        .map((s) => [s.bucket.id, s.allocated ? centsToDollars(s.allocated).toFixed(2) : ''])
    );
    seeded = true;
  }

  function cents(raw: string): number | null {
    const trimmed = (raw ?? '').trim();
    if (trimmed === '') return 0;
    const parsed = evaluateExpression(trimmed);
    if (parsed === null || parsed < 0) return null;
    return Math.round(parsed * 100);
  }

  $: invalidIds = Object.entries(draft)
    .filter(([, raw]) => cents(raw) === null)
    .map(([id]) => id);

  // Derived (percentage/hybrid) buckets aren't editable here — they follow
  // income by rule — but they still consume income, so they count.
  $: derivedTotal = derivedStatuses.reduce((sum, s) => sum + s.allocated, 0);
  $: draftTotal = Object.values(draft).reduce((sum, raw) => sum + (cents(raw) ?? 0), 0);
  $: remaining = $currentMonthIncome - draftTotal - derivedTotal;

  async function handleSave() {
    if (invalidIds.length > 0) {
      error = 'Some amounts aren\'t valid. Fix the highlighted fields.';
      return;
    }
    error = '';
    isSaving = true;
    try {
      const allocations: Record<string, number> = {};
      for (const [id, raw] of Object.entries(draft)) {
        allocations[id] = cents(raw) ?? 0;
      }
      await setAllocations(allocations);
      closeModal();
      onDone?.();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not save the assignment';
    } finally {
      isSaving = false;
    }
  }

  async function handleCarryForward() {
    error = '';
    isSaving = true;
    try {
      const count = await carryForwardAllocations();
      if (count === 0) {
        error = 'Last month has no assignments to carry over.';
      } else {
        draft = Object.fromEntries(
          $bucketStatuses
            .filter((s) => s.bucket.allocationType === 'fixed')
            .map((s) => [s.bucket.id, s.allocated ? centsToDollars(s.allocated).toFixed(2) : ''])
        );
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not carry last month forward';
    } finally {
      isSaving = false;
    }
  }

  function assignRest(bucketId: string) {
    if (remaining <= 0) return;
    const current = cents(draft[bucketId]) ?? 0;
    draft = { ...draft, [bucketId]: centsToDollars(current + remaining).toFixed(2) };
  }
</script>

<div class="space-y-4">
  <!-- The remainder leads: it's the number the whole screen is about. -->
  <div
    class="flex items-baseline justify-between gap-4 rounded border px-4 py-3
           {remaining === 0
      ? 'border-success/30 bg-success/5'
      : remaining < 0
        ? 'border-danger/30 bg-danger/5'
        : 'border-border bg-background dark:border-border-dark dark:bg-white/[0.03]'}"
  >
    <span class="eyebrow">
      {remaining === 0 ? 'Fully assigned' : remaining < 0 ? 'Over-assigned by' : 'Left to assign'}
    </span>
    <span
      class="money text-xl font-semibold
             {remaining === 0
        ? 'text-success dark:text-success-light'
        : remaining < 0
          ? 'text-danger dark:text-danger-light'
          : 'text-gray-900 dark:text-gray-50'}"
    >
      {formatCurrency(Math.abs(remaining))}
    </span>
  </div>

  <button type="button" class="btn-secondary w-full" on:click={handleCarryForward} disabled={isSaving}>
    Copy last month's assignments
  </button>

  {#if error}
    <p class="text-sm text-danger dark:text-danger-light">{error}</p>
  {/if}

  <div class="max-h-[45vh] space-y-1 overflow-y-auto pr-1">
    {#each fixedStatuses as s (s.bucket.id)}
      <div class="flex items-center gap-3 rounded px-1 py-1.5">
        <span class="h-4 w-[3px] flex-none rounded-sm" style="background:{s.bucket.color}"></span>
        <label class="flex-1 text-sm text-gray-800 dark:text-gray-200" for="assign-{s.bucket.id}">
          {s.bucket.name}
        </label>
        {#if remaining > 0}
          <button
            type="button"
            class="text-[11px] font-medium text-primary hover:underline"
            on:click={() => assignRest(s.bucket.id)}
            title="Put the remaining {formatCurrency(remaining)} here"
          >
            + rest
          </button>
        {/if}
        <div class="relative w-28 flex-none">
          <span class="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted dark:text-muted-dark">$</span>
          <input
            id="assign-{s.bucket.id}"
            type="text"
            inputmode="decimal"
            bind:value={draft[s.bucket.id]}
            placeholder="0.00"
            class="money w-full rounded border bg-white py-1.5 pl-5 pr-2 text-right text-sm
                   focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20
                   dark:bg-gray-800/50 dark:text-gray-100
                   {invalidIds.includes(s.bucket.id)
              ? 'border-danger'
              : 'border-border dark:border-border-dark'}"
          />
        </div>
      </div>
    {/each}

    {#each derivedStatuses as s (s.bucket.id)}
      <div class="flex items-center gap-3 rounded px-1 py-1.5 opacity-70">
        <span class="h-4 w-[3px] flex-none rounded-sm" style="background:{s.bucket.color}"></span>
        <span class="flex-1 text-sm text-gray-800 dark:text-gray-200">
          {s.bucket.name}
          <span class="text-[11px] text-muted dark:text-muted-dark">
            · {s.bucket.percentageAmount}% of income
          </span>
        </span>
        <span class="money w-28 flex-none pr-2 text-right text-sm text-muted dark:text-muted-dark">
          {formatCurrency(s.allocated)}
        </span>
      </div>
    {/each}
  </div>

  <div class="flex gap-2 border-t border-border pt-3 dark:border-border-dark">
    <button type="button" class="btn-secondary flex-1" on:click={() => closeModal()} disabled={isSaving}>
      Cancel
    </button>
    <button type="button" class="btn-primary flex-1" on:click={handleSave} disabled={isSaving || invalidIds.length > 0}>
      {isSaving ? 'Saving…' : 'Save assignments'}
    </button>
  </div>
</div>
