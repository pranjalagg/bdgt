<script lang="ts">
  // Context for the month's numbers: the trip, the bonus, the family
  // visit. Too coarse to tag on individual transactions, but it is what
  // explains an odd savings rate. Collapsed by default so a month with
  // nothing to say stays quiet.
  import { currentMonthNotes, addMonthNote, updateMonthNote, deleteMonthNote } from '$lib/stores/budgetStore';
  import { currentMonthKey } from '$lib/stores/uiStore';
  import { MAX_NOTE_LENGTH, NOTE_EFFECTS, cleanNoteText } from '$lib/utils/monthNotes';
  import type { MonthNoteEffect } from '$lib/types';

  let open = false;
  let text = '';
  let effect: MonthNoteEffect = 'none';
  let editingId: string | null = null;
  let input: HTMLInputElement | undefined;

  // A different month is a different set of notes; don't carry a half-typed
  // edit across.
  $: $currentMonthKey, resetForm();

  $: canSubmit = cleanNoteText(text) !== null;
  $: summary = $currentMonthNotes.length === 0
    ? 'Add a note for this month'
    : `${$currentMonthNotes.length} ${$currentMonthNotes.length === 1 ? 'note' : 'notes'}`;

  function resetForm() {
    text = '';
    effect = 'none';
    editingId = null;
  }

  async function submit() {
    if (!canSubmit) return;
    if (editingId) await updateMonthNote(editingId, text, effect);
    else await addMonthNote(text, effect);
    resetForm();
    input?.focus();
  }

  function startEdit(id: string) {
    const note = $currentMonthNotes.find((n) => n.id === id);
    if (!note) return;
    editingId = id;
    text = note.text;
    effect = note.effect;
    input?.focus();
  }

  async function remove(id: string) {
    await deleteMonthNote(id);
    if (editingId === id) resetForm();
  }

  const effectLabel = (e: MonthNoteEffect) => NOTE_EFFECTS.find((x) => x.value === e)?.label ?? '';
  const effectColor = (e: MonthNoteEffect) =>
    e === 'up' ? 'text-success dark:text-success-light'
    : e === 'down' ? 'text-danger dark:text-danger-light'
    : 'text-muted dark:text-muted-dark';
</script>

<section class="rounded-xl border border-border bg-white dark:border-border-dark dark:bg-surface-dark">
  <button
    type="button"
    class="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left transition-colors
           hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary
           dark:hover:bg-white/[0.03]"
    aria-expanded={open}
    aria-controls="month-notes-body"
    on:click={() => (open = !open)}
  >
    <span class="flex min-w-0 items-center gap-2.5">
      <span class="text-[13px] font-medium text-gray-900 dark:text-gray-100">Month notes</span>
      <span class="truncate text-[12.5px] text-muted dark:text-muted-dark">{summary}</span>
    </span>
    <span class="flex flex-none items-center gap-2">
      {#if !open}
        {#each $currentMonthNotes as n (n.id)}
          <span class="{effectColor(n.effect)}" title={n.text}>
            {#if n.effect === 'none'}
              <span class="block h-0.5 w-2.5 rounded-full bg-current" aria-hidden="true"></span>
            {:else}
              <svg class="h-3 w-3 {n.effect === 'down' ? 'rotate-180' : ''}" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M6 10V2M2.5 5.5 6 2l3.5 3.5" />
              </svg>
            {/if}
            <span class="sr-only">{effectLabel(n.effect)}: {n.text}</span>
          </span>
        {/each}
      {/if}
      <svg class="h-4 w-4 text-muted transition-transform dark:text-muted-dark {open ? 'rotate-180' : ''}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m6 8 4 4 4-4" />
      </svg>
    </span>
  </button>

  {#if open}
    <div id="month-notes-body" class="space-y-3 border-t border-border px-4 pb-4 pt-3 dark:border-border-dark">
      {#if $currentMonthNotes.length > 0}
        <ul class="space-y-1.5">
          {#each $currentMonthNotes as n (n.id)}
            <li class="group flex items-center gap-2.5 text-[13.5px]">
              <span class="flex w-4 flex-none justify-center {effectColor(n.effect)}" title={effectLabel(n.effect)}>
                {#if n.effect === 'none'}
                  <span class="block h-0.5 w-2.5 rounded-full bg-current" aria-hidden="true"></span>
                {:else}
                  <svg class="h-3.5 w-3.5 {n.effect === 'down' ? 'rotate-180' : ''}" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M6 10V2M2.5 5.5 6 2l3.5 3.5" />
                  </svg>
                {/if}
                <span class="sr-only">{effectLabel(n.effect)}</span>
              </span>
              <span class="min-w-0 flex-1 text-gray-900 dark:text-gray-100">{n.text}</span>
              <span class="flex flex-none items-center gap-3 text-[12.5px]">
                <button type="button" class="rounded text-muted hover:text-gray-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-muted-dark dark:hover:text-gray-100" on:click={() => startEdit(n.id)}>Edit</button>
                <button type="button" class="rounded text-muted hover:text-danger hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-muted-dark dark:hover:text-danger-light" on:click={() => remove(n.id)} aria-label="Delete note: {n.text}">Delete</button>
              </span>
            </li>
          {/each}
        </ul>
      {/if}

      <form class="flex flex-col gap-2 sm:flex-row sm:items-center" on:submit|preventDefault={submit}>
        <label class="sr-only" for="month-note-text">Note</label>
        <input
          id="month-note-text"
          bind:this={input}
          bind:value={text}
          maxlength={MAX_NOTE_LENGTH}
          placeholder="Labor Day weekend, bonus, family visit…"
          class="input-base min-w-0 flex-1 !py-1.5 text-[13.5px]"
        />
        <div class="flex items-center gap-2">
          <label class="sr-only" for="month-note-effect">Effect on savings</label>
          <select id="month-note-effect" bind:value={effect} class="select-base !w-auto !py-1.5 text-[13px]">
            {#each NOTE_EFFECTS as e (e.value)}
              <option value={e.value}>{e.label}</option>
            {/each}
          </select>
          <button type="submit" class="btn-primary !px-3 !py-1.5 text-[13px]" disabled={!canSubmit}>
            {editingId ? 'Save' : 'Add'}
          </button>
          {#if editingId}
            <button type="button" class="btn-secondary !px-3 !py-1.5 text-[13px]" on:click={resetForm}>Cancel</button>
          {/if}
        </div>
      </form>
    </div>
  {/if}
</section>
