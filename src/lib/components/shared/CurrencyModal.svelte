<script lang="ts">
  import Modal from './Modal.svelte';
  import { CURRENCIES, currencyInfo, type CurrencyCode } from '$lib/currency/currencies';
  import { baseCurrency, currencyConfirmed, confirmCurrency } from '$lib/stores/currencyStore';
  import { closeModal, activeModal } from '$lib/stores/uiStore';

  let selected: CurrencyCode = $baseCurrency;
  let saving = false;

  // Start from the current (or detected) currency each time it opens.
  $: if ($activeModal === 'currency') selected = $baseCurrency;

  async function save() {
    saving = true;
    try {
      await confirmCurrency(selected);
      closeModal();
    } finally {
      saving = false;
    }
  }
</script>

<Modal id="currency" title="Currency">
  <div class="space-y-4 pt-4">
    {#if !$currencyConfirmed}
      <p class="text-sm text-label-2">
        Looks like <strong>{currencyInfo($baseCurrency).code}</strong>. Is that right?
      </p>
    {:else}
      <p class="text-sm text-label-2">
        This changes the symbol only. Your amounts stay the same numbers.
      </p>
    {/if}

    <fieldset class="space-y-1">
      <legend class="sr-only">Currency</legend>
      {#each CURRENCIES as c}
        <label class="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-fill">
          <input type="radio" name="currency" value={c.code} bind:group={selected} />
          <span class="w-10 text-sm font-medium text-label">{c.symbol}</span>
          <span class="text-sm text-label">{c.name} ({c.code})</span>
        </label>
      {/each}
    </fieldset>

    <button type="button" class="btn-primary w-full" disabled={saving} on:click={save}>
      {$currencyConfirmed ? 'Save' : 'Confirm'}
    </button>
  </div>
</Modal>
