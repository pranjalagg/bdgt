import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';

// Old address, kept for bookmarks and links: Recurring items live under Budget.
export function load({ url }) {
  redirect(308, `${base}/budget/bills${url.search}`);
}
