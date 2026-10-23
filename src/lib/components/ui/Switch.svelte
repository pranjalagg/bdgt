<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { haptic } from '$lib/ui/haptics';

  // An iOS switch. The visible label sits beside it; `label` names it for
  // screen readers when there is none.
  export let checked = false;
  export let label: string;
  export let id: string | undefined = undefined;

  const dispatch = createEventDispatcher<{ change: boolean }>();
</script>

<button
  {id}
  type="button"
  role="switch"
  aria-checked={checked}
  aria-label={label}
  class="switch relative h-[31px] w-[51px] flex-none rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-tint focus-visible:ring-offset-2"
  on:click={() => {
    checked = !checked;
    haptic('selection');
    dispatch('change', checked);
  }}
></button>

<style>
  .switch {
    background: rgb(var(--c-fill) / var(--fill-alpha));
    transition: background-color 0.25s;
  }

  .switch[aria-checked='true'] {
    background: #34c759;
  }

  .switch::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 27px;
    height: 27px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.15), 0 0 1px rgba(0, 0, 0, 0.2);
    transition: transform var(--ms-bouncy, 400ms) var(--ease-bouncy, ease-out);
  }

  .switch[aria-checked='true']::after {
    transform: translateX(20px);
  }
</style>
