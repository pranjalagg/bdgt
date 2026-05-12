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
                const dataset = context.dataset.data as number[];
                const total = dataset.reduce((a, b) => a + b, 0);
                const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
                return ` $${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${pct}%)`;
              },
            },
          },
        },
      },
    });
  }

  $: if (chart && data) {
    chart.data.labels = data.map((d) => d.label);
    chart.data.datasets[0].data = data.map((d) => d.value);
    chart.data.datasets[0].backgroundColor = data.map((d) => d.color);
    chart.update();
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
