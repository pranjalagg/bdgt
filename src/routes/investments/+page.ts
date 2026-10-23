import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';

// Old address, kept for bookmarks and links: Investments live under Insights.
export function load({ url }) {
  redirect(308, `${base}/insights/investments${url.search}`);
}
