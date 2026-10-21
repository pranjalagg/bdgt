import { describe, it, expect, beforeEach } from 'vitest';
import { takeCurrencyPrompt, resetCurrencyPrompt, currencyAnsweredElsewhere } from '$lib/stores/currencyStore';

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

describe('currency prompt answered by a sync', () => {
  beforeEach(() => {
    resetCurrencyPrompt();
    currencyAnsweredElsewhere(true, false); // drain anything an earlier test left
  });

  it('closes the dialog once when the account brings an already confirmed currency', () => {
    expect(takeCurrencyPrompt(false)).toBe(true);
    expect(currencyAnsweredElsewhere(false, true)).toBe(false); // still unanswered
    expect(currencyAnsweredElsewhere(true, true)).toBe(true);
    expect(currencyAnsweredElsewhere(true, true)).toBe(false); // only once
  });

  it('does nothing when the person closed the dialog already', () => {
    takeCurrencyPrompt(false);
    expect(currencyAnsweredElsewhere(true, false)).toBe(false);
  });

  it('never closes a dialog the person opened to change the currency', () => {
    expect(currencyAnsweredElsewhere(true, true)).toBe(false);
  });
});
