import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    paths: {
      // BASE_PATH wins when set (the Android build sets it empty); otherwise
      // GitHub Pages builds serve under /bdgt and local builds at the root.
      base: process.env.BASE_PATH ?? (process.env.GITHUB_ACTIONS ? '/bdgt' : '')
    },
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html',
      precompress: false,
      strict: true
    })
  }
};

export default config;
