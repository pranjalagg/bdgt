import { describe, it, expect } from 'vitest';
import { maskDigits, buildLogFile, logFilename } from '$lib/capture/logExport';
import type { KeptItem } from '$lib/capture/native';

describe('maskDigits', () => {
  it('masks references, account and phone numbers to their last two digits', () => {
    expect(maskDigits('UPI Ref 123456789012')).toBe('UPI Ref XXXXXXXXXX12');
    expect(maskDigits('to 9876543210@ybl')).toBe('to XXXXXXXX10@ybl');
    expect(maskDigits('A/c 00001234567890')).toBe('A/c XXXXXXXXXXXX90');
  });

  it('keeps amounts, short numbers and dates', () => {
    expect(maskDigits('Rs.150000.00 debited')).toBe('Rs.150000.00 debited');
    expect(maskDigits('INR 250000 credited')).toBe('INR 250000 credited');
    expect(maskDigits('₹123456 paid')).toBe('₹123456 paid');
    expect(maskDigits('$1000000 wire')).toBe('$1000000 wire');
    expect(maskDigits('Rs.1,23,456.00 from A/c XX1234 on 21-10-26')).toBe('Rs.1,23,456.00 from A/c XX1234 on 21-10-26');
    expect(maskDigits('OTP 4321')).toBe('OTP 4321');
  });

  it('masks a long number that only follows an amount at a distance', () => {
    expect(maskDigits('Rs.250 sent, Ref 123456789012')).toBe('Rs.250 sent, Ref XXXXXXXXXX12');
  });
});

describe('buildLogFile', () => {
  const item: KeptItem = {
    id: 'abc',
    packageName: 'com.google.android.apps.messaging',
    kind: 'sms',
    notificationKey: '0|com.google.android.apps.messaging|987654321|null|10123',
    postedAt: 1_760_000_000_000,
    sender: 'VM-HDFCBK',
    title: 'VM-HDFCBK',
    text: 'Rs.250.00 debited from A/c XX1234 to 9876543210@ybl. UPI Ref 123456789012',
    extras: { personUri: 'tel:+919876543210', channel: 'sms' },
  };

  it('masks every text field and keeps the rest', () => {
    const file = buildLogFile([item], '0.1.7', new Date('2026-10-21T10:00:00Z'));
    expect(file).toMatchObject({ app: 'bdgt', kind: 'capture-log', version: 1, appVersion: '0.1.7', exportedAt: '2026-10-21T10:00:00.000Z' });
    const [out] = file.items;
    expect(out.id).toBe('abc');
    expect(out.postedAt).toBe(item.postedAt);
    expect(out.text).toBe('Rs.250.00 debited from A/c XX1234 to XXXXXXXX10@ybl. UPI Ref XXXXXXXXXX12');
    expect(out.notificationKey).toBe('0|com.google.android.apps.messaging|XXXXXXX21|null|10123');
    expect(out.extras).toEqual({ personUri: 'tel:+XXXXXXXXXX10', channel: 'sms' });
    expect(out.sender).toBe('VM-HDFCBK');
  });

  it('leaves missing fields missing', () => {
    const bare: KeptItem = { ...item, sender: undefined, title: undefined, extras: undefined };
    const [out] = buildLogFile([bare], '0.1.7').items;
    expect(out.sender).toBeUndefined();
    expect(out.title).toBeUndefined();
    expect(out.extras).toBeUndefined();
  });
});

describe('logFilename', () => {
  it('names the file by the local day', () => {
    expect(logFilename(new Date(2026, 9, 21, 23, 30))).toBe('bdgt-capture-log-2026-10-21.json');
  });
});
