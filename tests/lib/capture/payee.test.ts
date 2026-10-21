import { describe, it, expect } from 'vitest';
import { normalizeName, payeeKey, displayMerchant, merchantKind } from '$lib/capture/payee';

describe('normalizeName', () => {
  it('drops card-processor prefixes, store numbers and punctuation', () => {
    expect(normalizeName('SQ *BLUE BOTTLE #12')).toBe('blue bottle');
    expect(normalizeName('Blue Bottle')).toBe('blue bottle');
    expect(normalizeName('TST* Taqueria 1234 SF')).toBe('taqueria sf');
    expect(normalizeName('PAYPAL *SPOTIFY')).toBe('spotify');
    expect(normalizeName('AT&T')).toBe('at&t');
  });
});

describe('payeeKey', () => {
  it('is the same for the same payee however it is written', async () => {
    expect(await payeeKey({ merchant: 'SQ *BLUE BOTTLE #12' })).toBe(await payeeKey({ merchant: 'Blue Bottle' }));
    expect(await payeeKey({ upiId: 'Swiggy@ICICI', merchant: null })).toBe(await payeeKey({ upiId: 'swiggy@icici', merchant: 'SWIGGY' }));
  });

  it('prefers the UPI ID, is a hash, and is absent with nothing to go on', async () => {
    const key = await payeeKey({ upiId: '9876543210@ybl', merchant: 'Rahul' });
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toBe(await payeeKey({ merchant: 'Rahul' }));
    expect(await payeeKey({ merchant: null })).toBeUndefined();
    expect(await payeeKey({ merchant: '#123' })).toBeUndefined();
  });
});

describe('displayMerchant', () => {
  it('shows the name, else the UPI ID with phone numbers masked', () => {
    expect(displayMerchant({ merchant: 'Swiggy', upiId: 'swiggy@icici' })).toBe('Swiggy');
    expect(displayMerchant({ merchant: null, upiId: '9876543210@ybl' })).toBe('XXXXXXXX10@ybl');
    expect(displayMerchant({ merchant: null })).toBe('Unknown payee');
  });
});

describe('merchantKind', () => {
  it('knows common merchants, specific ones first', () => {
    expect(merchantKind({ merchant: 'SWIGGY' })).toBe('dining');
    expect(merchantKind({ merchant: 'Swiggy Instamart' })).toBe('grocery');
    expect(merchantKind({ merchant: null, upiId: 'zepto.payu@hdfcbank' })).toBe('grocery');
    expect(merchantKind({ merchant: 'UBER EATS' })).toBe('dining');
    expect(merchantKind({ merchant: 'Uber Trip' })).toBe('transport');
    expect(merchantKind({ merchant: 'Netflix.com' })).toBe('subscriptions');
    expect(merchantKind({ merchant: 'Coca-Cola' })).toBeUndefined();
    expect(merchantKind({ merchant: 'RAHUL SHARMA' })).toBeUndefined();
  });
});
