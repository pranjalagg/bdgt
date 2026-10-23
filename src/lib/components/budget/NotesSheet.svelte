<script lang="ts">
  import Modal from '$lib/components/shared/Modal.svelte';
  import MonthNotes from '$lib/components/shared/MonthNotes.svelte';
</script>

<Modal id="notes" title="Month notes">
  <MonthNotes startOpen />
</Modal>
