<script lang="ts">
  import { base } from '$app/paths';
  import NavBar from '$lib/components/layout/NavBar.svelte';
  import CaptureRulesSection from '$lib/components/capture/CaptureRulesSection.svelte';
</script>

<NavBar title="Capture rules" back={{ href: `${base}/settings`, label: 'Settings' }} />

<div class="mx-auto max-w-2xl">
  <CaptureRulesSection />
</div>
