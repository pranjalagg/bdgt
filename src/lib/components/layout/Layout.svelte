<script lang="ts">
  import Nav from './Nav.svelte';
</script>

<div class="flex h-screen bg-background dark:bg-background-dark">
  <Nav />
  <main class="flex-1 overflow-auto pb-16 md:pb-0">
    <div class="mx-auto max-w-5xl p-6">
      <slot />
    </div>
  </main>
</div>
