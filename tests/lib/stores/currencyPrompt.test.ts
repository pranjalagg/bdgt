import { describe, it, expect, beforeEach } from 'vitest';
import { takeCurrencyPrompt, resetCurrencyPrompt } from '$lib/stores/currencyStore';

describe('currency confirm prompt', () => {
  beforeEach(() => resetCurrencyPrompt());

  it('asks once while unconfirmed, so Escape does not reopen it in a loop', () => {
    expect(takeCurrencyPrompt(false)).toBe(true);
    expect(takeCurrencyPrompt(false)).toBe(false);
  });

  it('never asks when already confirmed', () => {
    expect(takeCurrencyPrompt(true)).toBe(false);
  });

  it('asks again after settings are reloaded (import or reset that leaves the same code)', () => {
    expect(takeCurrencyPrompt(false)).toBe(true);
    resetCurrencyPrompt();
    expect(takeCurrencyPrompt(false)).toBe(true);
  });
});
