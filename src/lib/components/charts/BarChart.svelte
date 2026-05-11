<!-- src/lib/components/charts/BarChart.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip } from 'chart.js';
  import { resolvedTheme } from '$lib/stores/themeStore';

  Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

  export let labels: string[];
  export let datasets: { label: string; data: number[]; color: string }[];

  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;
  let unsubscribe: (() => void) | null = null;

  function getThemeColors(theme: string) {
    const isDark = theme === 'dark';
    return {
      tickColor: isDark ? '#d1d5db' : '#374151',
      gridColor: isDark ? '#374151' : '#e5e7eb',
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
          backgroundColor: ds.color,
        })),
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true,
            ticks: { color: colors.tickColor },
            grid: { color: colors.gridColor },
          },
          x: {
            ticks: { color: colors.tickColor },
            grid: { color: colors.gridColor },
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
      backgroundColor: ds.color,
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

<canvas bind:this={canvas}></canvas>
