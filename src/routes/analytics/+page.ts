import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';

// Old address, kept for bookmarks and links: Analytics became Insights.
export function load({ url }) {
  redirect(308, `${base}/insights${url.search}`);
}
