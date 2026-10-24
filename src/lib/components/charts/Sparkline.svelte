<script lang="ts">
  // The small chart on a trend card: bars, pairs of bars or lines, the
  // newest point emphasised. Decorative: the card's text carries the number.

  export let kind: 'bars' | 'pairs' | 'lines';
  export let bars: number[] = [];
  export let pairs: [number, number][] = [];
  export let lines: { color: string; values: (number | null)[] }[] = [];

  const W = 124;
  const H = 48;
  $: barTop = Math.max(1, ...bars);
  $: pairTop = Math.max(1, ...pairs.flat());
  $: lineVals = lines.flatMap((l) => l.values.filter((v): v is number => v !== null));
  $: lineLo = kind === 'lines' && lines.length === 1 && lineVals.length ? Math.min(...lineVals) * 0.9 : 0;
  $: lineHi = Math.max(...lineVals, lineLo + 1);
  $: lx = (i: number, n: number) => (i / Math.max(1, n - 1)) * (W - 6) + 3;
  $: ly = (v: number) => 4 + (1 - (v - lineLo) / (lineHi - lineLo || 1)) * (H - 8);
</script>

<svg class="flex-none overflow-visible" width={W} height={H} viewBox="0 0 {W} {H}" aria-hidden="true">
  {#if kind === 'bars'}
    {#each bars as v, i}
      {@const slot = W / bars.length}
      <rect x={i * slot + slot * 0.22} width={slot * 0.56} y={H - (Math.max(0, v) / barTop) * H} height={(Math.max(0, v) / barTop) * H} rx="2.5" fill={i === bars.length - 1 ? 'rgb(var(--c-tint))' : 'rgb(var(--c-label-2) / 0.25)'} />
    {/each}
  {:else if kind === 'pairs'}
    {#each pairs as [a, b], i}
      {@const slot = W / pairs.length}
      <rect x={i * slot + slot * 0.14} width={slot * 0.32} y={H - (a / pairTop) * H} height={(a / pairTop) * H} rx="2" fill="rgb(var(--c-label-2) / 0.35)" />
      <rect x={i * slot + slot * 0.52} width={slot * 0.32} y={H - (b / pairTop) * H} height={(b / pairTop) * H} rx="2" fill="rgb(var(--c-tint))" />
    {/each}
  {:else}
    {#each lines as l}
      {@const pts = l.values.map((v, i) => [i, v]).filter(([, v]) => v !== null)}
      <polyline points={pts.map(([i, v]) => `${lx(i ?? 0, l.values.length)},${ly(v ?? 0)}`).join(' ')} fill="none" stroke={l.color} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      {#if pts.length}
        {@const last = pts[pts.length - 1]}
        <circle cx={lx(last[0] ?? 0, l.values.length)} cy={ly(last[1] ?? 0)} r="3" fill={l.color} />
      {/if}
    {/each}
  {/if}
</svg>
