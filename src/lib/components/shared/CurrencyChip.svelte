<script lang="ts">
  import { baseCurrency } from '$lib/stores/currencyStore';
  import { currencyInfo } from '$lib/currency/currencies';
  import { openModal } from '$lib/stores/uiStore';

  $: info = currencyInfo($baseCurrency);
</script>

<button
  type="button"
  on:click={() => openModal('currency')}
  aria-label="Change currency, currently {info.code}"
  class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-label-2 transition-colors hover:bg-fill hover:text-label"
>
  <span aria-hidden="true">{info.symbol}</span>
  <span>{info.code}</span>
</button>
