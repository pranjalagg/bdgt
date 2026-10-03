import { describe, it, expect } from 'vitest';
import { monthKeyAction, isTypingTarget } from '$lib/utils/keyboard';

const key = (k: string, extra: Partial<Parameters<typeof monthKeyAction>[0]> = {}) => ({
  key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, defaultPrevented: false, target: document.body,
  ...extra,
});

describe('monthKeyAction', () => {
  it('maps arrows and T to month navigation', () => {
    expect(monthKeyAction(key('ArrowLeft'), false)).toBe('previous');
    expect(monthKeyAction(key('ArrowRight'), false)).toBe('next');
    expect(monthKeyAction(key('t'), false)).toBe('current');
    expect(monthKeyAction(key('T'), false)).toBe('current');
  });

  it('ignores other keys', () => {
    expect(monthKeyAction(key('a'), false)).toBeNull();
    expect(monthKeyAction(key('ArrowUp'), false)).toBeNull();
  });

  it('does nothing while a modal is open', () => {
    expect(monthKeyAction(key('ArrowLeft'), true)).toBeNull();
  });

  it('does nothing while typing in a field', () => {
    for (const tag of ['input', 'textarea', 'select']) {
      expect(monthKeyAction(key('ArrowLeft', { target: document.createElement(tag) }), false)).toBeNull();
    }
  });

  it('leaves browser shortcuts alone', () => {
    expect(monthKeyAction(key('ArrowLeft', { metaKey: true }), false)).toBeNull();
    expect(monthKeyAction(key('ArrowLeft', { altKey: true }), false)).toBeNull();
    expect(monthKeyAction(key('t', { ctrlKey: true }), false)).toBeNull();
  });

  it('respects a handler that already claimed the key', () => {
    expect(monthKeyAction(key('ArrowRight', { defaultPrevented: true }), false)).toBeNull();
  });
});

describe('isTypingTarget', () => {
  it('is false for a button and for no target', () => {
    expect(isTypingTarget(document.createElement('button'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
