import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';

// Old address, kept for bookmarks and links: Transactions became Activity.
export function load({ url }) {
  redirect(308, `${base}/activity${url.search}`);
}
