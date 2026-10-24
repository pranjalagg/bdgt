<script lang="ts">
  import { buckets } from '$lib/stores/budgetStore';
  import { captureRules, setRuleBucket, setRuleIgnore, deleteRule } from '$lib/stores/captureStore';

  // What approving and dismissing captured payments has taught the app, per
  // payee: the Capture rules page under Settings.

  $: assignable = $buckets.filter((b) => !b.isSystem);
  $: sorted = [...$captureRules].sort((a, b) => a.merchant.localeCompare(b.merchant));

  function change(id: string, value: string) {
    if (value === 'ignore') void setRuleIgnore(id);
    else void setRuleBucket(id, value);
  }
</script>

<p class="px-1 pb-3 text-[15px] text-label-2">
  Learned from the payments you approved or dismissed. The next payment to the same payee arrives with this suggestion.
</p>
{#if sorted.length === 0}
  <div class="card px-5 py-10 text-center text-[15px] text-label-2">No rules yet. Approve or dismiss a payment in Review and one appears here.</div>
{:else}
  <div class="group">
    {#each sorted as rule (rule.id)}
      <div class="group-row flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3" style="--row-inset: 16px">
        <span class="min-w-0 flex-1 truncate text-[16px] text-label">{rule.merchant}</span>
        <select
          class="select-base !w-auto max-w-[180px]"
          aria-label="What to do with payments to {rule.merchant}"
          value={rule.action === 'ignore' ? 'ignore' : rule.bucketId}
          on:change={(e) => change(rule.id, e.currentTarget.value)}
        >
          {#each assignable as b (b.id)}<option value={b.id}>{b.name}</option>{/each}
          {#if rule.action === 'suggest' && !assignable.some((b) => b.id === rule.bucketId)}
            <option value={rule.bucketId} disabled>Deleted envelope</option>
          {/if}
          <option value="ignore">Always ignore</option>
        </select>
        <button type="button" class="rounded-full bg-fill px-3 py-1.5 text-[13px] font-semibold text-danger focus:outline-none focus-visible:ring-2 focus-visible:ring-tint" on:click={() => deleteRule(rule.id)}>Forget</button>
      </div>
    {/each}
  </div>
{/if}
