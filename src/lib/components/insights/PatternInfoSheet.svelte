<script lang="ts">
  import Modal from '$lib/components/shared/Modal.svelte';
</script>

<Modal id="patterns-info" title="How patterns work">
  <div class="card grid gap-3 p-4 text-[15px] leading-relaxed text-label">
    <p>
      Each pair of everyday envelopes is compared month by month: do the months where one is high tend to be the
      months where the other is low (or high too)? Rent, subscriptions, savings and one-off envelopes are left out.
    </p>
    <p>
      It compares which months were high or low, not by how much, so one unusual month can't create a pattern on
      its own. With only a few months of history, a lean is shown as "watching" and not as a finding.
    </p>
    <p class="text-label-2">It describes what happened. It can't tell you why.</p>
  </div>
</Modal>
