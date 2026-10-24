<script lang="ts">
  // Logging is amount-first, on a keypad: type what you paid (sums work:
  // 12 + 8.5), pick the envelope, and each envelope says whether it fits
  // before you save. A physical keyboard types into the keypad, arrows move
  // between envelopes and Enter saves.
  import { get } from 'svelte/store';
  import { bucketStatuses, transactions, addTransaction, deleteTransaction } from '$lib/stores/budgetStore';
  import { currentMonthKey, activeModal, openModal, closeModal } from '$lib/stores/uiStore';
  import { showToast } from '$lib/stores/toastStore';
  import { parseCurrency, isValidCurrency, isExpression, formatCurrency, formatMoney } from '$lib/utils/currency';
  import { defaultEntryDate } from '$lib/utils/dates';
  import { calculateBucketFit } from '$lib/utils/calculations';
  import { baseCurrency } from '$lib/stores/currencyStore';
  import { currencyInfo, type CurrencyCode } from '$lib/currency/currencies';
  import { parseRate, convertToBase } from '$lib/currency/conversion';
  import { applyKey, keyFromKeyboard, type KeypadKey } from '$lib/ui/keypad';
  import { orderByUse } from '$lib/log/envelopeOrder';
  import { haptic } from '$lib/ui/haptics';
  import Keypad from '$lib/components/log/Keypad.svelte';
  import EnvelopeChips from '$lib/components/log/EnvelopeChips.svelte';
  import Modal from './Modal.svelte';
  import ForeignCurrencyField from './ForeignCurrencyField.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import { fitText } from '$lib/ui/fit';

  export let preselectedBucketId: string | undefined = undefined;
  export let onComplete: (() => void) | undefined = undefined;
  // Bound to the date chip in the sheet's header. A new sheet starts on
  // today, or on the first of the month being viewed.
  export let date: Date = defaultEntryDate(get(currentMonthKey));
  date = defaultEntryDate(get(currentMonthKey));

  let expr = '';
  let note = '';
  let selected: string | null = preselectedBucketId ?? null;
  let saving = false;
  let currency: CurrencyCode = $baseCurrency;
  let rate = '';
  let chipsRef: EnvelopeChips;

  // A trailing operator or point does not count yet: "12+" reads as 12.
  $: settled = expr.replace(/[+\-*/.]$/, '');
  $: typedMinor = isValidCurrency(settled) ? parseCurrency(settled) : 0;
  $: isForeign = currency !== $baseCurrency;
  $: parsedRate = isForeign ? parseRate(rate) : null;
  $: baseCents = !isForeign ? typedMinor : parsedRate !== null ? convertToBase(typedMinor, parsedRate) : 0;
  $: rateValid = !isForeign || parsedRate !== null;

  $: statuses = $bucketStatuses.filter((s) => !s.bucket.isSystem);
  $: order = orderByUse(statuses.map((s) => s.bucket.id), $transactions);
  $: chips = order
    .map((id) => statuses.find((s) => s.bucket.id === id)!)
    .map((s) => {
      const fit = calculateBucketFit(baseCents, s.remaining, s.allocated);
      if (fit === 'fits') return { bucket: s.bucket, text: `${formatCurrency(s.remaining - baseCents)} left after`, tone: 'good' as const };
      if (fit === 'tight') return { bucket: s.bucket, text: `${formatCurrency(baseCents - s.remaining)} over`, tone: 'bad' as const };
      if (fit === 'unfunded') return { bucket: s.bucket, text: 'Nothing assigned', tone: baseCents ? ('bad' as const) : ('plain' as const) };
      return { bucket: s.bucket, text: `${formatCurrency(s.remaining)} left`, tone: 'plain' as const };
    });
  $: chosen = statuses.find((s) => s.bucket.id === selected)?.bucket ?? null;
  $: canSave = typedMinor !== 0 && rateValid && !!chosen && !saving;

  // What the big figure shows: what was typed, grouped, or the sum when
  // there is an operator (the sum written out above it).
  const OPS: Record<string, string> = { '+': ' + ', '-': ' − ', '*': ' × ', '/': ' ÷ ' };
  $: symbol = currencyInfo(currency).symbol;
  $: hasOp = isExpression(settled) || /[+\-*/]/.test(expr);
  $: expressionLine = hasOp ? expr.replace(/[+\-*/]/g, (o) => OPS[o]) : '';
  $: figure = !expr ? `${symbol}0` : hasOp ? formatMoney(typedMinor, currency) : symbol + groupWhole(expr);
  // The currency symbol sits smaller and grey before the number, as Apple Cash shows it.
  $: [lead, rest] = figure.startsWith(symbol) ? [symbol, figure.slice(symbol.length)] : ['', figure];

  function groupWhole(s: string) {
    const [whole, rest] = s.split('.');
    return Number(whole).toLocaleString('en-US') + (rest !== undefined ? '.' + rest : '');
  }

  // A refused key shakes the figure and flashes it red (only the red under
  // reduced motion).
  let shaking = false;
  let shakeTimer: ReturnType<typeof setTimeout> | undefined;
  function press(key: KeypadKey) {
    const next = applyKey(expr, key);
    if (next.rejected) {
      haptic('warning');
      shaking = true;
      clearTimeout(shakeTimer);
      shakeTimer = setTimeout(() => (shaking = false), 400);
      return;
    }
    expr = next.expr;
  }

  // Typing on a keyboard. The note and date fields keep their own keys;
  // a focused button that is not part of the keypad or envelopes keeps
  // Enter (so Cancel and Paid in still work from the keyboard).
  function onWindowKeydown(e: KeyboardEvent) {
    if ($activeModal !== 'log' || e.isComposing) return;
    const target = e.target as HTMLElement;
    const inField = target.closest('input, select, textarea');
    if (e.key === 'Enter') {
      if (inField && target.id !== 'log-note') return;
      if (!inField && target.closest('button') && !target.closest('.keypad, [role=radiogroup], [data-save]')) return;
      e.preventDefault();
      save();
      return;
    }
    if (inField) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      chipsRef?.move(e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    const key = keyFromKeyboard(e);
    if (!key) return;
    e.preventDefault();
    press(key);
  }

  async function save() {
    if (!canSave || !chosen) {
      if (!saving) haptic('warning');
      return;
    }
    saving = true;
    const bucket = chosen;
    const amount = baseCents;
    try {
      const foreign = isForeign ? { amount: typedMinor, currency, rate: parsedRate!, base: $baseCurrency } : undefined;
      const id = await addTransaction({
        amount,
        ...(foreign ? { foreign } : {}),
        bucketId: bucket.id,
        date,
        note: note.trim() || undefined,
      });
      haptic('success');
      showToast({
        message: `Added ${formatCurrency(amount)} to ${bucket.name}`,
        envelopeId: bucket.id,
        action: { label: 'Undo', run: () => deleteTransaction(id) },
      });
      onComplete?.();
    } finally {
      saving = false;
    }
  }
</script>

<svelte:window on:keydown={onWindowKeydown} />

<div class="flex min-h-full flex-col gap-3 pb-2">
  <output
    class="amt flex min-h-[132px] flex-col items-center justify-center text-center focus:outline-none"
    tabindex="-1"
    data-autofocus
    aria-live="polite"
    aria-label="Amount {figure}"
  >
    <span class="money h-6 text-[17px] text-label-2">{expressionLine}</span>
    <span
      class="figure money block w-full leading-[1.1] {shaking ? 'text-danger' : expr ? 'text-label' : 'text-label-2'}"
      class:shake={shaking}
      style="letter-spacing: -0.03em"
      use:fitText={{ text: figure, max: 64, min: 30 }}
    >{#if lead}<span class="symbol">{lead}</span>{/if}{rest}</span>
    <button type="button" class="mt-2 flex h-8 items-center gap-1 rounded-full px-3 text-[15px] font-medium text-tint focus:outline-none focus-visible:ring-2 focus-visible:ring-tint" on:click={() => openModal('paid-in')}>
      {#if isForeign && typedMinor}<span class="money text-label-2">{rateValid ? `≈ ${formatCurrency(baseCents)} ·` : 'Rate needed ·'}</span>{/if}
      Paid in {currency}<Icon name="chevron-down" size={14} strokeWidth={2.4} />
    </button>
  </output>

  <EnvelopeChips bind:this={chipsRef} {chips} bind:selected />

  <label class="flex h-11 items-center gap-2.5 rounded-[12px] bg-fill px-3.5 focus-within:ring-2 focus-within:ring-tint">
    <span class="text-label-2" aria-hidden="true"><Icon name="pencil" size={17} /></span>
    <span class="sr-only">Note</span>
    <input id="log-note" type="text" bind:value={note} placeholder="Add a note" autocomplete="off" class="h-full min-w-0 flex-1 bg-transparent text-[16px] text-label placeholder:text-label-2 focus:outline-none" />
  </label>

  <div class="mt-auto grid gap-2">
    <Keypad on:key={(e) => press(e.detail)} />
    <button type="button" data-save class="btn-primary h-[52px] w-full rounded-full text-[17px]" disabled={!canSave} on:click={save}>
      {#if !typedMinor}
        Enter an amount
      {:else if !rateValid}
        Add a rate for {currency}
      {:else if !chosen}
        Choose an envelope
      {:else}
        <span class="truncate">Add <span class="amt">{formatCurrency(baseCents)}</span> to {chosen.name}</span>
      {/if}
    </button>
  </div>
</div>

<Modal id="paid-in" title="Paid in">
  <p class="pb-1 text-[15px] text-label-2">For a payment in another currency: the amount you type is in this currency, and saved in {$baseCurrency} at the rate below.</p>
  <ForeignCurrencyField id="log" bind:currency bind:rate foreignMinor={typedMinor} />
  <button type="button" class="btn-primary mt-4 w-full" disabled={!rateValid} on:click={() => closeModal('paid-in')}>Done</button>
</Modal>

<style>
  @media (prefers-reduced-motion: no-preference) {
    .shake {
      animation: shake 360ms cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
    }
  }

  .symbol {
    margin-right: 0.04em;
    font-size: 0.55em;
    vertical-align: 0.62em;
    color: rgb(var(--c-label-2));
    font-weight: 600;
  }

  @keyframes shake {
    20%,
    60% {
      transform: translateX(-7px);
    }
    40%,
    80% {
      transform: translateX(7px);
    }
  }
</style>
