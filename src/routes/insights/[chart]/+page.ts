import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';
import { isTrendChart } from '$lib/insights/charts';

// One of the four trend charts; any other name goes back to Insights.
export function load({ params }) {
  if (!isTrendChart(params.chart)) redirect(307, `${base}/insights`);
  return { chart: params.chart };
}
