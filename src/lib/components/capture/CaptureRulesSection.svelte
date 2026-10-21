<script lang="ts">
  import { buckets } from '$lib/stores/budgetStore';
  import { captureRules, setRuleBucket, setRuleIgnore, deleteRule } from '$lib/stores/captureStore';

  // What approving and dismissing captured payments has taught the app, per
  // payee. Shown once there is at least one rule.

  $: assignable = $buckets.filter((b) => !b.isSystem);
  $: sorted = [...$captureRules].sort((a, b) => a.merchant.localeCompare(b.merchant));

  function change(id: string, value: string) {
    if (value === 'ignore') void setRuleIgnore(id);
    else void setRuleBucket(id, value);
  }
</script>

{#if sorted.length > 0}
  <div class="card">
    <div class="border-b border-gray-100 px-5 py-4 dark:border-border-dark">
      <h2 class="section-title">Capture rules</h2>
    </div>
    <div class="space-y-3 px-5 py-4">
      <p class="text-sm text-muted dark:text-muted-dark">
        Learned from the payments you approved or dismissed. The next payment to the same payee arrives with this suggestion.
      </p>
      <ul class="divide-y divide-gray-100 dark:divide-border-dark">
        {#each sorted as rule (rule.id)}
          <li class="flex flex-wrap items-center justify-between gap-3 py-2.5">
            <span class="min-w-0 truncate text-sm font-medium text-gray-900 dark:text-gray-100">{rule.merchant}</span>
            <div class="flex items-center gap-2">
              <select
                class="select-base max-w-[180px]"
                aria-label="What to do with payments to {rule.merchant}"
                value={rule.action === 'ignore' ? 'ignore' : rule.bucketId}
                on:change={(e) => change(rule.id, e.currentTarget.value)}
              >
                {#each assignable as b (b.id)}<option value={b.id}>{b.name}</option>{/each}
                {#if rule.action === 'suggest' && !assignable.some((b) => b.id === rule.bucketId)}
                  <option value={rule.bucketId} disabled>Deleted bucket</option>
                {/if}
                <option value="ignore">Always ignore</option>
              </select>
              <button type="button" class="btn-secondary" on:click={() => deleteRule(rule.id)}>Forget</button>
            </div>
          </li>
        {/each}
      </ul>
    </div>
  </div>
{/if}
