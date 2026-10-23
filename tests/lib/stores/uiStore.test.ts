import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { openModal, closeModal, activeModal, modalStack } from '$lib/stores/uiStore';

beforeEach(() => modalStack.set([]));

describe('modal stack', () => {
  it('stacks modals and closes the top first', () => {
    openModal('a');
    openModal('b');
    expect(get(activeModal)).toBe('b');
    closeModal();
    expect(get(activeModal)).toBe('a');
    closeModal();
    expect(get(activeModal)).toBeNull();
  });

  it('closes a named modal under another', () => {
    openModal('a');
    openModal('b');
    closeModal('a');
    expect(get(modalStack)).toEqual(['b']);
  });

  it('does not stack the same modal twice', () => {
    openModal('a');
    openModal('a');
    expect(get(modalStack)).toEqual(['a']);
  });
});
