<script lang="ts">
  // The signature element. One bar the width of the month's income,
  // segmented by each bucket's own color, with the unassigned remainder
  // left visibly open. Closing that gap is the whole job of a zero-based
  // budget, so it's the only thing on screen that looks unfinished.
  import { formatCurrency } from '$lib/utils/currency';
  import type { BucketStatus } from '$lib/types';

  export let statuses: BucketStatus[] = [];
  export let income = 0;
  export let unallocated = 0;
  export let onAssign: (() => void) | undefined = undefined;
  export let compact = false;

  let showAll = false;

  $: assigned = income - unallocated;
  $: segments = statuses
    .filter((s) => s.allocated > 0)
    .sort((a, b) => b.allocated - a.allocated);
  // Over-assigned is its own state: there is no gap left to show, and the
  // number needs to read as a problem rather than an invitation.
  $: overAssigned = unallocated < 0;
  $: denominator = overAssigned ? assigned : Math.max(income, assigned);
  $: pct = (n: number) => (denominator > 0 ? (n / denominator) * 100 : 0);
</script>

{#if compact}
  <!-- Recurs beside the month picker: same object, 3px tall, no labels. -->
  <div
    class="flex h-[3px] w-20 overflow-hidden rounded-full bg-rule dark:bg-white/10"
    role="img"
    aria-label={overAssigned
      ? `Over-assigned by ${formatCurrency(Math.abs(unallocated))}`
      : unallocated === 0
        ? 'Every dollar assigned'
        : `${formatCurrency(unallocated)} still unassigned`}
  >
    {#each segments as s (s.bucket.id)}
      <span style="flex:{s.allocated};background:{s.bucket.color}"></span>
    {/each}
    {#if unallocated > 0}
      <span style="flex:{unallocated}" class="bg-transparent"></span>
    {/if}
  </div>
{:else}
  <section class="card p-5">
    <div class="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
      <h2 class="eyebrow">Assigned this month</h2>
      <p class="text-sm text-muted dark:text-muted-dark">
        <span class="money font-semibold text-gray-900 dark:text-gray-50">{formatCurrency(assigned)}</span>
        of <span class="money text-gray-700 dark:text-gray-300">{formatCurrency(income)}</span>
        {#if overAssigned}
          &middot; <span class="money font-semibold text-danger dark:text-danger-light"
            >{formatCurrency(Math.abs(unallocated))}</span
          > over
        {:else if unallocated > 0}
          &middot; <span class="money font-semibold text-gray-900 dark:text-gray-50"
            >{formatCurrency(unallocated)}</span
          > still unassigned
        {:else if income > 0}
          &middot; <span class="font-semibold text-success dark:text-success-light">every dollar has a place</span>
        {/if}
      </p>
    </div>

    <div
      class="flex h-11 overflow-hidden rounded bg-rule dark:bg-white/[0.07]"
      role="img"
      aria-label={`${formatCurrency(assigned)} of ${formatCurrency(income)} assigned across ${segments.length} buckets`}
    >
      {#each segments as s (s.bucket.id)}
        <!-- Card-colored hairline between segments so neighbours with
             similar hues stay separable. -->
        <span
          class="border-r-[1.5px] border-white last:border-r-0 dark:border-surface-dark"
          style="flex:{s.allocated};background:{s.bucket.color}"
          title="{s.bucket.name} — {formatCurrency(s.allocated)}"
        ></span>
      {/each}
      {#if income === 0 && segments.length === 0}
        <!-- Nothing to measure yet: hatched like the gap, not a solid slab. -->
        <span
          class="flex-1 bg-[repeating-linear-gradient(135deg,theme(colors.rule),theme(colors.rule)_5px,transparent_5px,transparent_10px)] dark:bg-[repeating-linear-gradient(135deg,rgba(255,255,255,.16),rgba(255,255,255,.16)_5px,transparent_5px,transparent_10px)]"
          aria-hidden="true"
        ></span>
      {/if}
      {#if unallocated > 0}
        <!-- The gap. Hatched so it reads as absence, not as another bucket. -->
        <button
          type="button"
          style="flex:{unallocated}"
          on:click={onAssign}
          title="Assign {formatCurrency(unallocated)}"
          class="group relative min-w-[3px] cursor-pointer border-l-2 border-muted bg-[repeating-linear-gradient(135deg,theme(colors.rule),theme(colors.rule)_5px,transparent_5px,transparent_10px)] transition-colors hover:bg-[repeating-linear-gradient(135deg,theme(colors.muted),theme(colors.muted)_5px,transparent_5px,transparent_10px)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-muted-dark dark:bg-[repeating-linear-gradient(135deg,rgba(255,255,255,.16),rgba(255,255,255,.16)_5px,transparent_5px,transparent_10px)]"
          aria-label="Assign {formatCurrency(unallocated)} to buckets"
        ></button>
      {/if}
    </div>

    {#if segments.length > 0}
      <ul class="mt-4 flex flex-wrap gap-x-5 gap-y-1">
        {#each showAll ? segments : segments.slice(0, 6) as s (s.bucket.id)}
          <li class="flex items-center gap-2 text-[13px] text-muted dark:text-muted-dark">
            <span class="h-2 w-2 flex-none rounded-[2px]" style="background:{s.bucket.color}"></span>
            {s.bucket.name}
            <span class="money text-[12.5px] font-medium text-gray-800 dark:text-gray-200"
              >{formatCurrency(s.allocated)}</span
            >
          </li>
        {/each}
        {#if segments.length > 6}
          <li class="text-[13px]">
            <button
              type="button"
              class="rounded text-muted underline-offset-2 hover:text-gray-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-muted-dark dark:hover:text-gray-100"
              aria-expanded={showAll}
              on:click={() => (showAll = !showAll)}
            >
              {showAll ? 'Show less' : `+${segments.length - 6} more`}
            </button>
          </li>
        {/if}
      </ul>
    {/if}

    {#if onAssign && (unallocated !== 0 || segments.length === 0)}
      <button type="button" class="btn-primary mt-4 w-full sm:w-auto" on:click={onAssign}>
        {segments.length === 0 ? 'Assign your income' : overAssigned ? 'Rebalance buckets' : 'Assign the rest'}
      </button>
    {/if}
  </section>
{/if}
