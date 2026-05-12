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
          borderWidth: 2,
          borderColor: theme === 'dark' ? '#1e1e2e' : '#ffffff',
          hoverBorderColor: theme === 'dark' ? '#1e1e2e' : '#ffffff',
        }],
      },
      options: {
        responsive: true,
        cutout: '65%',
        plugins: {
          legend: {
            display: showLegend,
            position: 'bottom',
            labels: {
              color: legendColor,
              usePointStyle: true,
              pointStyle: 'circle',
              padding: 16,
              font: { size: 12 },
            },
          },
          tooltip: {
            backgroundColor: theme === 'dark' ? '#1e1e2e' : '#ffffff',
            titleColor: theme === 'dark' ? '#e5e7eb' : '#111827',
            bodyColor: theme === 'dark' ? '#d1d5db' : '#374151',
            borderColor: theme === 'dark' ? '#2e2e42' : '#e5e7eb',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8,
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
    if (chart.options.plugins?.legend) {
      chart.options.plugins.legend.display = showLegend;
    }
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

<div class="p-1">
  <canvas bind:this={canvas}></canvas>
</div>
