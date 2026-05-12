<!-- src/lib/components/charts/BarChart.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip } from 'chart.js';
  import { resolvedTheme } from '$lib/stores/themeStore';

  Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

  export let labels: string[];
  export let datasets: { label: string; data: number[]; color: string }[];

  function withAlpha(hex: string, alpha: string): string {
    if (hex.length === 4) {
      const r = hex[1], g = hex[2], b = hex[3];
      return `#${r}${r}${g}${g}${b}${b}${alpha}`;
    }
    return hex + alpha;
  }

  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;
  let unsubscribe: (() => void) | null = null;

  function getThemeColors(theme: string) {
    const isDark = theme === 'dark';
    return {
      tickColor: isDark ? '#9ca3af' : '#6b7280',
      gridColor: isDark ? '#2e2e42' : '#f3f4f6',
    };
  }

  function createChart(theme: string) {
    if (chart) chart.destroy();
    const colors = getThemeColors(theme);
    chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: datasets.map((ds) => ({
          label: ds.label,
          data: ds.data,
          backgroundColor: withAlpha(ds.color, '30'),
          borderColor: ds.color,
          borderWidth: 1.5,
          borderRadius: 6,
          borderSkipped: false,
        })),
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true,
            ticks: { color: colors.tickColor, font: { size: 11 } },
            grid: { color: colors.gridColor },
            border: { display: false },
          },
          x: {
            ticks: { color: colors.tickColor, font: { size: 11 } },
            grid: { display: false },
            border: { display: false },
          },
        },
        plugins: {
          tooltip: {
            backgroundColor: theme === 'dark' ? '#1e1e2e' : '#ffffff',
            titleColor: theme === 'dark' ? '#e5e7eb' : '#111827',
            bodyColor: theme === 'dark' ? '#d1d5db' : '#374151',
            borderColor: theme === 'dark' ? '#2e2e42' : '#e5e7eb',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8,
          },
        },
      },
    });
  }

  $: if (chart && labels && datasets) {
    chart.data.labels = labels;
    chart.data.datasets = datasets.map((ds) => ({
      label: ds.label,
      data: ds.data,
      backgroundColor: withAlpha(ds.color, '30'),
      borderColor: ds.color,
      borderWidth: 1.5,
      borderRadius: 6,
      borderSkipped: false,
    }));
    chart.update();
  }

  onMount(() => {
    unsubscribe = resolvedTheme.subscribe((theme) => {
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
