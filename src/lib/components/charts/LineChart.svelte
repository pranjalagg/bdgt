<!-- src/lib/components/charts/LineChart.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Chart, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler } from 'chart.js';
  import { resolvedTheme } from '$lib/stores/themeStore';

  Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler);

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
  let currentTheme = 'light';

  function getThemeColors(theme: string) {
    const isDark = theme === 'dark';
    return {
      tickColor: isDark ? '#9ca3af' : '#6b7280',
      gridColor: isDark ? '#2e2e42' : '#f3f4f6',
      legendColor: isDark ? '#d1d5db' : '#374151',
    };
  }

  function createChart(theme: string) {
    if (chart) chart.destroy();
    const colors = getThemeColors(theme);
    chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: buildDatasets(theme),
      },
      options: {
        responsive: true,
        interaction: { intersect: false, mode: 'index' },
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
          legend: {
            labels: { color: colors.legendColor, usePointStyle: true, pointStyle: 'circle', padding: 16, font: { size: 12 } },
          },
          tooltip: {
            backgroundColor: theme === 'dark' ? '#1e1e2e' : '#ffffff',
            titleColor: theme === 'dark' ? '#e5e7eb' : '#111827',
            bodyColor: theme === 'dark' ? '#d1d5db' : '#374151',
            borderColor: theme === 'dark' ? '#2e2e42' : '#e5e7eb',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8,
            boxPadding: 4,
          },
        },
      },
    });
  }

  function buildDatasets(theme: string) {
    const borderClr = theme === 'dark' ? '#1e1e2e' : '#ffffff';
    return datasets.map((ds) => ({
      label: ds.label,
      data: ds.data,
      borderColor: ds.color,
      backgroundColor: withAlpha(ds.color, '15'),
      fill: true,
      tension: 0.4,
      pointRadius: 4,
      pointHoverRadius: 6,
      pointBackgroundColor: ds.color,
      pointBorderColor: borderClr,
      pointBorderWidth: 2,
      borderWidth: 2.5,
    }));
  }

  $: if (chart && labels && datasets) {
    chart.data.labels = labels;
    chart.data.datasets = buildDatasets(currentTheme);
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
