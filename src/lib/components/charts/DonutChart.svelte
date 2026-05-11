<!-- src/lib/components/charts/DonutChart.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Chart, DoughnutController, ArcElement, Tooltip, Legend } from 'chart.js';
  import { resolvedTheme } from '$lib/stores/themeStore';

  Chart.register(DoughnutController, ArcElement, Tooltip, Legend);

  export let data: { label: string; value: number; color: string }[];
  export let showLegend = true;

  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;
  let unsubscribe: (() => void) | null = null;
  let currentTheme = 'light';

  function createChart(theme: string) {
    if (chart) chart.destroy();
    const legendColor = theme === 'dark' ? '#d1d5db' : '#374151';
    const total = data.reduce((sum, d) => sum + d.value, 0);
    chart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: data.map((d) => d.label),
        datasets: [{
          data: data.map((d) => d.value),
          backgroundColor: data.map((d) => d.color),
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            display: showLegend,
            position: 'bottom',
            labels: { color: legendColor },
          },
          tooltip: {
            callbacks: {
              label(context) {
                const value = context.parsed as number;
                const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
                return ` $${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${pct}%)`;
              },
            },
          },
        },
      },
    });
  }

  $: if (canvas && data) {
    createChart(currentTheme);
  }

  onMount(() => {
    unsubscribe = resolvedTheme.subscribe((theme) => {
      currentTheme = theme;
      if (canvas) createChart(theme);
    });
  });

  onDestroy(() => {
    chart?.destroy();
    unsubscribe?.();
  });
</script>

<canvas bind:this={canvas}></canvas>
