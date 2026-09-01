<script lang="ts">
  import Modal from '$lib/components/shared/Modal.svelte';
  import { closeModal } from '$lib/stores/uiStore';
  import { addLot } from '$lib/stores/investmentStore';
  import { parseCurrency, isValidCurrency } from '$lib/utils/currency';
  import { parseLocalDate } from '$lib/utils/dates';

  let symbol = '';
  let shares = '';
  let pricePerShare = '';
  let purchaseDate = new Date().toISOString().split('T')[0];
  let note = '';
  let isSubmitting = false;
  let error = '';

  $: isValid = symbol.trim() && parseFloat(shares) > 0 && isValidCurrency(pricePerShare) && purchaseDate;

  async function handleSubmit() {
    if (!isValid) return;

    isSubmitting = true;
    error = '';

    try {
      await addLot({
        symbol: symbol.trim().toUpperCase(),
        shares: parseFloat(shares),
        pricePerShare: parseCurrency(pricePerShare),
        purchaseDate: parseLocalDate(purchaseDate),
        note: note.trim() || undefined,
        soldShares: 0,
      });
      closeModal();
      resetForm();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to add purchase';
    } finally {
      isSubmitting = false;
    }
  }

  function resetForm() {
    symbol = '';
    shares = '';
    pricePerShare = '';
    purchaseDate = new Date().toISOString().split('T')[0];
    note = '';
  }
</script>

<Modal id="add-lot" title="Add Purchase">
  <form on:submit|preventDefault={handleSubmit} class="space-y-4 pt-4">
    {#if error}
      <p class="text-sm text-danger">{error}</p>
    {/if}

    <div>
      <label for="symbol" class="label">Symbol</label>
      <input
        id="symbol"
        type="text"
        bind:value={symbol}
        placeholder="AAPL"
        class="input-base mt-1 uppercase"
        required
      />
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="shares" class="label">Shares</label>
        <input
          id="shares"
          type="number"
          step="any"
          min="0"
          bind:value={shares}
          placeholder="10"
          class="input-base mt-1"
          required
        />
      </div>
      <div>
        <label for="price" class="label">Price per Share</label>
        <input
          id="price"
          type="text"
          bind:value={pricePerShare}
          placeholder="$150.00"
          class="input-base mt-1"
          required
        />
      </div>
    </div>

    <div>
      <label for="date" class="label">Purchase Date</label>
      <input
        id="date"
        type="date"
        bind:value={purchaseDate}
        class="input-base mt-1"
        required
      />
    </div>

    <div>
      <label for="note" class="label">Note (optional)</label>
      <input
        id="note"
        type="text"
        bind:value={note}
        placeholder="First purchase"
        class="input-base mt-1"
      />
    </div>

    <div class="flex justify-end gap-3 pt-2">
      <button type="button" class="btn-secondary" on:click={closeModal}>
        Cancel
      </button>
      <button type="submit" class="btn-primary" disabled={!isValid || isSubmitting}>
        {isSubmitting ? 'Adding...' : 'Add Purchase'}
      </button>
    </div>
  </form>
</Modal>
