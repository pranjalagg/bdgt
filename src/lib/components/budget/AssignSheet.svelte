<script lang="ts">
  import { fitText } from '$lib/ui/fit';
  import { tick } from 'svelte';
  import Modal from '$lib/components/shared/Modal.svelte';
  import { bucketStatuses, buckets, currentMonthIncome, setAllocations, getCarryForwardAllocations } from '$lib/stores/budgetStore';
  import { activeModal, closeModal } from '$lib/stores/uiStore';
  import { formatCurrency, currencySymbol } from '$lib/utils/currency';
  import { envelopeIcon } from '$lib/ui/icons';
  import { haptic } from '$lib/ui/haptics';
  import { draftFrom, draftTotal, fieldCents, leftToAssign, restTarget, dollarsText, type AssignDraft } from '$lib/budget/assignDraft';
  import Icon from '$lib/components/ui/Icon.svelte';

  // Give every dollar a job in one sitting: a number field per fixed
  // envelope and a live figure of what is left. Nothing is written until
  // Done; Cancel throws the draft away.

  export let focusEnvelopeId: string | null = null;

  let draft: AssignDraft = {};
  let error = '';
  let saving = false;
  let wasOpen = false;
  let list: HTMLElement;

  // Seeded fresh each time the sheet opens, so Cancel really cancels.
  $: onOpenChange($activeModal === 'assign');
  function onOpenChange(open: boolean) {
    if (open && !wasOpen) void start();
    wasOpen = open;
  }

  async function start() {
    draft = draftFrom($bucketStatuses);
    error = '';
    await tick();
    const field = focusEnvelopeId ? list?.querySelector<HTMLInputElement>(`[data-envelope="${focusEnvelopeId}"]`) : null;
    field?.focus();
  }

  $: fixed = $bucketStatuses.filter((s) => !s.bucket.isSystem && s.bucket.allocationType === 'fixed');
  $: derived = $bucketStatuses.filter((s) => !s.bucket.isSystem && s.bucket.allocationType !== 'fixed');
  $: derivedTotal = derived.reduce((sum, s) => sum + s.allocated, 0);
  $: total = draftTotal(draft, derivedTotal);
  $: left = total === null ? null : leftToAssign($currentMonthIncome, total);
  $: rest = restTarget($buckets);

  function addRest(id: string) {
    if (left === null || left <= 0) return;
    draft = { ...draft, [id]: dollarsText((fieldCents(draft[id]) ?? 0) + left) };
    haptic('success');
  }

  function copyLastMonth() {
    error = '';
    const carried = getCarryForwardAllocations();
    const ids = new Set(fixed.map((s) => s.bucket.id));
    const entries = Object.entries(carried).filter(([id]) => ids.has(id));
    if (entries.length === 0) {
      error = 'Last month has no assignments to copy.';
      return;
    }
    draft = { ...draft, ...Object.fromEntries(entries.map(([id, cents]) => [id, dollarsText(cents)])) };
  }

  async function save() {
    if (total === null) {
      error = "Some amounts aren't valid. Fix the highlighted fields.";
      return;
    }
    saving = true;
    try {
      await setAllocations(Object.fromEntries(Object.entries(draft).map(([id, raw]) => [id, fieldCents(raw) ?? 0])));
      haptic('success');
      closeModal('assign');
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not save the assignment';
    } finally {
      saving = false;
    }
  }

  function nextOnEnter(e: KeyboardEvent) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const fields = [...list.querySelectorAll<HTMLInputElement>('input[data-envelope]')];
    const next = fields[fields.indexOf(e.currentTarget as HTMLInputElement) + 1];
    if (next) next.focus();
    else (e.currentTarget as HTMLInputElement).blur();
  }
</script>

<Modal id="assign" title="Assign money" size="large" surface="plain">
  <button slot="leading" type="button" class="min-h-[44px] px-2 text-[17px] text-tint" on:click={() => closeModal('assign')}>Cancel</button>
  <button slot="trailing" type="button" class="min-h-[44px] px-2 text-[17px] font-semibold text-tint disabled:opacity-40" disabled={saving || total === null} on:click={save}>Done</button>

  <div class="pb-2 pt-3 text-center" aria-live="polite">
    <p class="figure amt text-[44px] {left === null ? 'text-label-2' : left < 0 ? 'text-danger' : left === 0 ? 'text-success' : 'text-label'}" use:fitText={{ text: left === null ? '—' : formatCurrency(Math.abs(left)), max: 44, min: 24 }}>
      {left === null ? '—' : formatCurrency(Math.abs(left))}
    </p>
    <p class="mt-1.5 text-[14px] text-label-2">
      {#if left === null}fix the highlighted fields{:else if left > 0}left to assign{:else if left < 0}assigned beyond your income{:else}Every dollar has a job{/if}
    </p>
  </div>

  <div class="grid gap-2 py-3">
    {#if rest && left !== null && left > 0}
      <button type="button" class="btn-secondary w-full" on:click={() => addRest(rest.id)}><span>Put the rest, <span class="amt">{formatCurrency(left)}</span>, in {rest.name}</span></button>
    {/if}
    <button type="button" class="btn-secondary w-full" on:click={copyLastMonth}>Copy last month's assignments</button>
  </div>

  {#if error}<p class="pb-2 text-sm text-danger" role="alert">{error}</p>{/if}

  <div bind:this={list} class="group" style="--row-inset: 60px">
    {#each fixed as s (s.bucket.id)}
      <div class="group-row flex items-center gap-3 py-2.5 pl-3 pr-2">
        <span class="flex h-9 w-9 flex-none items-center justify-center rounded-[11px] text-white" style="background:{s.bucket.color}">
          <Icon name={envelopeIcon(s.bucket.name)} size={19} strokeWidth={2.2} />
        </span>
        <span class="min-w-0 flex-1">
          <label for="assign-{s.bucket.id}" class="block truncate text-[16px] font-medium text-label">{s.bucket.name}</label>
          {#if left !== null && left > 0}
            <button type="button" class="text-[13px] font-medium text-tint" on:click={() => addRest(s.bucket.id)}>+ rest</button>
          {:else}
            <span class="amt block text-[13px] text-label-2">{s.bucket.isSavings ? 'Set aside' : 'Spent'} {formatCurrency(Math.max(0, s.spent))}</span>
          {/if}
        </span>
        <span class="money-field" class:invalid={fieldCents(draft[s.bucket.id]) === null}>
          <span aria-hidden="true">{currencySymbol()}</span>
          <input
            id="assign-{s.bucket.id}"
            data-envelope={s.bucket.id}
            type="text"
            inputmode="decimal"
            enterkeyhint="next"
            autocomplete="off"
            placeholder="0"
            bind:value={draft[s.bucket.id]}
            on:focus={(e) => e.currentTarget.select()}
            on:keydown={nextOnEnter}
          />
        </span>
      </div>
    {/each}
    {#each derived as s (s.bucket.id)}
      <div class="group-row flex items-center gap-3 py-2.5 pl-3 pr-4">
        <span class="flex h-9 w-9 flex-none items-center justify-center rounded-[11px] text-white" style="background:{s.bucket.color}">
          <Icon name={envelopeIcon(s.bucket.name)} size={19} strokeWidth={2.2} />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-[16px] font-medium text-label">{s.bucket.name}</span>
          <span class="block text-[13px] text-label-2">{s.bucket.percentageAmount}% of income</span>
        </span>
        <span class="money amt text-[16px] text-label-2">{formatCurrency(s.allocated)}</span>
      </div>
    {/each}
  </div>
</Modal>

<style>
  .money-field {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    height: 40px;
    width: 116px;
    flex: none;
    padding: 0 12px;
    border-radius: 12px;
    background: rgb(var(--c-fill) / var(--fill-alpha));
    font-variant-numeric: tabular-nums;
    color: rgb(var(--c-label-2));
  }

  .money-field:focus-within {
    background: rgb(var(--c-surface));
    box-shadow: inset 0 0 0 2px rgb(var(--c-tint));
  }

  .money-field.invalid {
    box-shadow: inset 0 0 0 2px rgb(var(--color-danger));
  }

  .money-field input {
    width: 100%;
    min-width: 0;
    border: 0;
    background: transparent;
    outline: none;
    text-align: right;
    font-size: 17px;
    font-weight: 600;
    color: rgb(var(--c-label));
  }

  :global(:root.privacy) .money-field input:not(:focus) {
    filter: blur(7px);
  }
</style>
