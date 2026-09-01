<script lang="ts">
  import Modal from '$lib/components/shared/Modal.svelte';
  import { closeModal } from '$lib/stores/uiStore';
  import { lots, sellFromLot } from '$lib/stores/investmentStore';
  import { parseCurrency, isValidCurrency, formatCurrency } from '$lib/utils/currency';
  import { parseLocalDate } from '$lib/utils/dates';

  export let lotId: string;

  let shares = '';
  let pricePerShare = '';
  let sellDate = new Date().toISOString().split('T')[0];
  let note = '';
  let isSubmitting = false;
  let error = '';

  $: lot = $lots.find((l) => l.id === lotId);
  $: availableShares = lot ? lot.shares - lot.soldShares : 0;
  $: sharesNum = parseFloat(shares) || 0;
  $: isValid = sharesNum > 0 && sharesNum <= availableShares && isValidCurrency(pricePerShare) && sellDate;

  async function handleSubmit() {
    if (!isValid || !lot) return;

    isSubmitting = true;
    error = '';

    try {
      await sellFromLot(
        lotId,
        sharesNum,
        parseCurrency(pricePerShare),
        parseLocalDate(sellDate),
        note.trim() || undefined
      );
      closeModal();
      resetForm();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to sell shares';
    } finally {
      isSubmitting = false;
    }
  }

  function resetForm() {
    shares = '';
    pricePerShare = '';
    sellDate = new Date().toISOString().split('T')[0];
    note = '';
  }

  function sellAll() {
    shares = availableShares.toString();
  }
</script>

<Modal id="sell-lot" title="Sell Shares">
  {#if lot}
    <form on:submit|preventDefault={handleSubmit} class="space-y-4 pt-4">
      {#if error}
        <p class="text-sm text-danger">{error}</p>
      {/if}

      <div class="rounded-lg bg-gray-50 p-3 dark:bg-gray-800/50">
        <p class="text-sm font-medium text-gray-800 dark:text-gray-100">
          {lot.symbol} · {availableShares} shares available
        </p>
        <p class="text-xs text-muted">
          Cost basis: {formatCurrency(lot.pricePerShare)}/share
        </p>
      </div>

      <div>
        <div class="flex items-center justify-between">
          <label for="sell-shares" class="label">Shares to Sell</label>
          <button type="button" class="text-xs text-primary hover:underline" on:click={sellAll}>
            Sell all
          </button>
        </div>
        <input
          id="sell-shares"
          type="number"
          step="any"
          min="0"
          max={availableShares}
          bind:value={shares}
          placeholder={availableShares.toString()}
          class="input-base mt-1"
          required
        />
        {#if sharesNum > availableShares}
          <p class="mt-1 text-xs text-danger">Cannot sell more than available shares</p>
        {/if}
      </div>

      <div>
        <label for="sell-price" class="label">Sell Price per Share</label>
        <input
          id="sell-price"
          type="text"
          bind:value={pricePerShare}
          placeholder="$160.00"
          class="input-base mt-1"
          required
        />
      </div>

      <div>
        <label for="sell-date" class="label">Sell Date</label>
        <input
          id="sell-date"
          type="date"
          bind:value={sellDate}
          class="input-base mt-1"
          required
        />
      </div>

      <div>
        <label for="sell-note" class="label">Note (optional)</label>
        <input
          id="sell-note"
          type="text"
          bind:value={note}
          placeholder="Taking profits"
          class="input-base mt-1"
        />
      </div>

      <div class="flex justify-end gap-3 pt-2">
        <button type="button" class="btn-secondary" on:click={closeModal}>
          Cancel
        </button>
        <button type="submit" class="btn-primary" disabled={!isValid || isSubmitting}>
          {isSubmitting ? 'Selling...' : 'Sell Shares'}
        </button>
      </div>
    </form>
  {:else}
    <p class="py-4 text-center text-muted">Lot not found</p>
  {/if}
</Modal>
