<script lang="ts">
  import { toast, dismissToast } from '$lib/stores/toastStore';
  import { buckets } from '$lib/stores/budgetStore';
  import { envelopeIcon } from '$lib/ui/icons';
  import Icon from './Icon.svelte';
  import { backOut } from 'svelte/easing';

  // The message drops in from the top like a notification; under reduced
  // motion it fades. The live region stays mounted so it is announced.

  $: bucket = $toast?.envelopeId ? $buckets.find((b) => b.id === $toast?.envelopeId) : undefined;

  function act() {
    const action = $toast?.action;
    dismissToast();
    action?.run();
  }

  function drop(_node: Element) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return { duration: 150, css: (t: number) => `opacity: ${t}` };
    return { duration: 420, easing: backOut, css: (t: number) => `opacity: ${Math.min(1, t * 3)}; transform: translateY(${(1 - t) * -140}%)` };
  }
</script>

<div class="pointer-events-none fixed inset-x-0 top-[calc(var(--safe-top)+10px)] z-[90] flex justify-center px-3" role="status" aria-live="polite">
  {#if $toast}
    <div
      class="glass pointer-events-auto flex min-h-[48px] max-w-full items-center gap-3 rounded-full py-2 pl-3 pr-2 text-[15px] font-medium text-label"
      in:drop
      out:drop
    >
      {#if bucket}
        <span class="flex h-7 w-7 flex-none items-center justify-center rounded-[9px] text-white" style="background:{bucket.color}">
          <Icon name={envelopeIcon(bucket.name, bucket.isSystem)} size={16} strokeWidth={2.2} />
        </span>
      {/if}
      <span class="amt min-w-0 truncate pl-1 pr-2">{$toast.message}</span>
      {#if $toast.action}
        <button type="button" class="min-h-[36px] flex-none rounded-full px-3 font-semibold text-tint" on:click={act}>{$toast.action.label}</button>
      {/if}
    </div>
  {/if}
</div>
