// The trend charts that have a page of their own (/insights/<chart>).
export const TREND_CHARTS = ['spending', 'income', 'envelopes', 'savings-rate'] as const;
export type TrendChart = (typeof TREND_CHARTS)[number];

export function isTrendChart(name: string): name is TrendChart {
  return (TREND_CHARTS as readonly string[]).includes(name);
}
