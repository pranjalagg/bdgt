import { describe, it, expect } from 'vitest';
import { detectCurrency } from '$lib/currency/detect';

describe('detectCurrency', () => {
  it.each([
    ['Asia/Kolkata', 'INR'],
    ['Asia/Calcutta', 'INR'],
    ['America/New_York', 'USD'],
    ['America/Los_Angeles', 'USD'],
    ['US/Pacific', 'USD'],
    ['Pacific/Honolulu', 'USD'],
    ['America/Toronto', 'CAD'],
    ['America/Vancouver', 'CAD'],
    ['Europe/London', 'GBP'],
    ['Europe/Berlin', 'EUR'],
    ['Europe/Dublin', 'EUR'],
    ['Australia/Sydney', 'AUD'],
    ['Asia/Singapore', 'SGD'],
    ['Asia/Dubai', 'AED'],
  ])('time zone %s gives %s', (tz, expected) => {
    expect(detectCurrency(tz, 'en-US')).toBe(expected);
  });

  it('time zone wins over the browser language', () => {
    expect(detectCurrency('Asia/Kolkata', 'en-US')).toBe('INR');
    expect(detectCurrency('America/Chicago', 'en-IN')).toBe('USD');
  });

  it('falls back to the language region when the time zone is not mapped', () => {
    expect(detectCurrency('UTC', 'en-IN')).toBe('INR');
    expect(detectCurrency('Etc/GMT', 'en-GB')).toBe('GBP');
    expect(detectCurrency(undefined, 'de-DE')).toBe('EUR');
  });

  it('falls back to USD when nothing maps', () => {
    expect(detectCurrency('UTC', 'en')).toBe('USD');
    expect(detectCurrency(undefined, undefined)).toBe('USD');
    expect(detectCurrency('Asia/Tokyo', 'ja-JP')).toBe('USD');
  });
});
