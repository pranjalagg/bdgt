import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';

// Old address, kept for bookmarks and links: Buckets became the Budget tab.
export function load({ url }) {
  redirect(308, `${base}/budget${url.search}`);
}
