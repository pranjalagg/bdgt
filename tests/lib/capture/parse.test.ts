import { describe, it, expect } from 'vitest';
import { parseItem, findAmount, isBusinessSender, bankLabel, type ParseResult } from '$lib/capture/parse';
import type { KeptItem } from '$lib/capture/native';

// Made-up messages in the shapes banks and payment apps are known to use
// (references, accounts and numbers are invented). Real samples from the
// capture log join these as they arrive.

const WALLET = 'com.google.android.apps.walletnfcrel';
const GPAY = 'com.google.android.apps.nbu.paisa.user';
const PHONEPE = 'com.phonepe.app';
const PAYTM = 'net.one97.paytm';

const sms = (sender: string, text: string): KeptItem => ({
  id: 'i', packageName: 'com.google.android.apps.messaging', kind: 'sms', notificationKey: 'k', postedAt: 1, sender, title: sender, text,
});
const app = (packageName: string, title: string, text: string): KeptItem => ({
  id: 'i', packageName, kind: 'app', notificationKey: 'k', postedAt: 1, title, text,
});

const payment = (r: ParseResult) => {
  if (!r.ok) throw new Error(`skipped: ${r.reason}`);
  return r.payment;
};

describe('bank SMS', () => {
  it('HDFC UPI, newer format', () => {
    const p = payment(parseItem(sms('VM-HDFCBK', 'Sent Rs.120.00\nFrom HDFC Bank A/C *1234\nTo RAHUL SHARMA\nOn 21/10/26\nRef 612345678901\nNot You?\nCall 18002586161/SMS BLOCK UPI to 7308080808'), 'INR'));
    expect(p).toMatchObject({ source: 'sms', sourceLabel: 'HDFC Bank SMS', amount: 12000, currency: 'INR', merchant: 'RAHUL SHARMA', accountHint: '1234', reference: '612345678901' });
  });

  it('HDFC UPI to a UPI ID', () => {
    const p = payment(parseItem(sms('VM-HDFCBK', 'Rs.250.00 debited from A/c XX1234 on 21-10-26 to VPA swiggy@icici. UPI Ref 612345678902. Not you? Call 18002586161'), 'INR'));
    expect(p).toMatchObject({ amount: 25000, merchant: null, upiId: 'swiggy@icici', accountHint: '1234', reference: '612345678902' });
  });

  it('HDFC card', () => {
    const p = payment(parseItem(sms('AD-HDFCBK-S', 'Spent Rs.500.00 On HDFC Bank Card 1234 At AMAZON On 2026-10-21:12:00:00 Bal Rs.45,000.00 Not You? Call 18002586161'), 'INR'));
    expect(p).toMatchObject({ amount: 50000, merchant: 'AMAZON', accountHint: '1234' });
  });

  it('ICICI UPI', () => {
    const p = payment(parseItem(sms('AX-ICICIB-S', 'ICICI Bank Acct XX123 debited for Rs 250.00 on 21-Oct-26; SWIGGY credited. UPI:612345678903. Call 18002662 for dispute. SMS BLOCK 123 to 9215676766'), 'INR'));
    expect(p).toMatchObject({ sourceLabel: 'ICICI Bank SMS', amount: 25000, merchant: 'SWIGGY', accountHint: '123', reference: '612345678903' });
  });

  it('ICICI card, skipping the credit limit and the footer', () => {
    const p = payment(parseItem(sms('JD-ICICIT', 'INR 1,000.00 spent on ICICI Bank Card XX9876 on 21-Oct-26 at AMAZON PAY INDIA. Avl Lmt: INR 49,000.00. If not you, call 1800 2662/SMS BLOCK 9876 to 9215676766'), 'INR'));
    expect(p).toMatchObject({ amount: 100000, merchant: 'AMAZON PAY INDIA', accountHint: '9876' });
  });

  it('SBI UPI, with the amount written without a currency', () => {
    const p = payment(parseItem(sms('VM-SBIUPI', 'Dear UPI user A/C X1234 debited by 250.0 on date 21Oct26 trf to SWIGGY Refno 612345678904. If not u? call 1800111109. -SBI'), 'INR'));
    expect(p).toMatchObject({ sourceLabel: 'SBI SMS', amount: 25000, currency: 'INR', merchant: 'SWIGGY', accountHint: '1234', reference: '612345678904' });
  });

  it('reads an SBI amount as rupees whatever the budget\'s currency', () => {
    const p = payment(parseItem(sms('VM-SBIUPI', 'Dear UPI user A/C X1234 debited by 250.0 on date 21Oct26 trf to SWIGGY Refno 612345678904'), 'USD'));
    expect(p).toMatchObject({ amount: 25000, currency: 'INR' });
  });

  it('Axis UPI', () => {
    const p = payment(parseItem(sms('AX-AXISBK', 'INR 250.00 debited\nA/c no. XX1234\n21-10-26, 12:00:00\nUPI/P2M/612345678905/SWIGGY\nNot you? SMS BLOCKUPI Cust ID to 919951860002\nAxis Bank'), 'INR'));
    expect(p).toMatchObject({ amount: 25000, merchant: 'SWIGGY', accountHint: '1234', reference: '612345678905' });
  });

  it('Kotak UPI', () => {
    const p = payment(parseItem(sms('VK-KOTAKB', 'Sent Rs.250.00 from Kotak Bank AC X1234 to swiggy@icici on 21-10-26.UPI Ref 612345678906. Not you, https://kotak.com/KBANKT/Fraud'), 'INR'));
    expect(p).toMatchObject({ sourceLabel: 'Kotak Bank SMS', amount: 25000, upiId: 'swiggy@icici', merchant: null, accountHint: '1234', reference: '612345678906' });
  });

  it('a US card alert from a short code', () => {
    const p = payment(parseItem(sms('24273', 'Chase: You made a $25.00 transaction with AMAZON MKTPLACE on Oct 21, 2026 at 3:45 PM ET on your CHASE SAPPHIRE card ending in 1234.'), 'USD'));
    expect(p).toMatchObject({ sourceLabel: 'Bank SMS', amount: 2500, currency: 'USD', merchant: 'AMAZON MKTPLACE', accountHint: '1234' });
  });

  it('hints: card bill, cash, UPI Lite top-up', () => {
    expect(payment(parseItem(sms('VM-HDFCBK', 'Rs.12,500.00 debited from A/c XX4321 on 21-10-26 to VPA cred.club@axisb. UPI Ref 612345678910'), 'INR')).hint).toBe('card-bill');
    expect(payment(parseItem(sms('VM-HDFCBK', 'Rs.2,000.00 withdrawn at ATM S1AB1234 from A/c XX1234 on 21-10-26'), 'INR')).hint).toBe('atm');
    expect(payment(parseItem(sms('VM-HDFCBK', 'Rs.500.00 debited from A/c XX1234 for UPI Lite top up. Ref 612345678911'), 'INR')).hint).toBe('upi-lite-topup');
  });

  it('skips money coming in, failures, refunds, upcoming debits and statements', () => {
    const skip = (sender: string, text: string) => {
      const r = parseItem(sms(sender, text), 'INR');
      return r.ok ? 'payment' : r.reason;
    };
    expect(skip('VM-HDFCBK', 'Money Received - INR 500.00 in your HDFC Bank A/c xx1234 on 21-10-26 by A/c linked to VPA rahul@okicici (UPI Ref No 612345678907)')).toBe('credit');
    expect(skip('VM-SBIINB', 'Dear SBI User, your A/c X1234-credited by Rs.500 on 21Oct26 transfer from RAHUL Ref No 612345678908 -SBI')).toBe('credit');
    expect(skip('VM-HDFCBK', 'Refund of Rs.250.00 credited to your A/c XX1234 for txn on 20-10-26')).toBe('credit');
    expect(skip('VM-HDFCBK', 'Your UPI transaction of Rs.250 to swiggy@icici failed. Ref 612345678909')).toBe('failed');
    expect(skip('VM-HDFCBK', 'Rs.199.00 will be debited from your A/c XX1234 on 25-10-26 for NETFLIX via e-mandate')).toBe('upcoming');
    expect(skip('AX-ICICIB', 'ICICI Bank Credit Card XX9876 statement: Total Amt Due INR 5,432.00; Min Amt Due INR 272.00; due by 05-Nov-26')).toBe('upcoming');
  });

  it('never reads people, only banks', () => {
    expect(parseItem(sms('Rahul', 'I paid Rs.500 for the cab, UPI me back'), 'INR')).toEqual({ ok: false, reason: 'not-a-bank' });
    expect(parseItem(sms('+91 98765 43210', 'Rs.250 debited, ref 612345678901'), 'INR')).toEqual({ ok: false, reason: 'not-a-bank' });
  });
});

describe('Google Wallet', () => {
  it('takes the merchant from the title and the card from the dots', () => {
    const p = payment(parseItem(app(WALLET, 'Blue Bottle Coffee', '$6.50 with Visa •••• 1234'), 'USD'));
    expect(p).toMatchObject({ source: 'wallet', sourceLabel: 'Google Wallet', amount: 650, currency: 'USD', merchant: 'Blue Bottle Coffee', accountHint: '1234' });
  });

  it('keeps the currency charged, and reads $ as the budget\'s own dollar', () => {
    expect(payment(parseItem(app(WALLET, 'Café de Flore', '€4.50 with Mastercard •••• 9999'), 'USD'))).toMatchObject({ amount: 450, currency: 'EUR' });
    expect(payment(parseItem(app(WALLET, 'Tim Hortons', '$3.25 with Visa •••• 1234'), 'CAD')).currency).toBe('CAD');
    expect(payment(parseItem(app(WALLET, 'Starbucks', '$5.00 with Visa •••• 1234'), 'INR')).currency).toBe('USD');
  });

  it('skips refunds, declines and notifications without an amount', () => {
    expect(parseItem(app(WALLET, 'Refund', '$12.00 refund from Amazon to Visa •••• 1234'), 'USD')).toEqual({ ok: false, reason: 'credit' });
    expect(parseItem(app(WALLET, 'Payment declined', '$5.00 at Starbucks'), 'USD')).toEqual({ ok: false, reason: 'failed' });
    expect(parseItem(app(WALLET, 'Starbucks', 'Payment approved'), 'USD')).toEqual({ ok: false, reason: 'no-amount' });
  });
});

describe('UPI apps', () => {
  it('reads payments', () => {
    expect(payment(parseItem(app(GPAY, 'Payment successful', '₹250 paid to Swiggy'), 'INR'))).toMatchObject({ source: 'upi-app', sourceLabel: 'Google Pay', amount: 25000, merchant: 'Swiggy' });
    expect(payment(parseItem(app(PHONEPE, 'Paid ₹120 to RAHUL S', 'UPI transaction successful'), 'INR'))).toMatchObject({ sourceLabel: 'PhonePe', amount: 12000, merchant: 'RAHUL S' });
    expect(payment(parseItem(app(PAYTM, 'Rs.1,23,456 paid to Landlord', 'Payment successful'), 'INR')).amount).toBe(12345600);
  });

  it('skips money coming in, requests and offers', () => {
    expect(parseItem(app(GPAY, 'Rahul sent you ₹500', 'Tap to view'), 'INR')).toEqual({ ok: false, reason: 'credit' });
    expect(parseItem(app(PHONEPE, 'Received ₹100 from Priya', 'Credited to your bank account'), 'INR')).toEqual({ ok: false, reason: 'credit' });
    expect(parseItem(app(GPAY, 'Rahul has requested ₹500', 'Tap to pay'), 'INR')).toEqual({ ok: false, reason: 'request' });
    expect(parseItem(app(PAYTM, 'Cashback alert!', 'Win up to ₹100 cashback on your next bill'), 'INR')).toEqual({ ok: false, reason: 'promotion' });
  });

  it('ignores apps it does not know', () => {
    expect(parseItem(app('com.whatsapp', 'Rahul', 'Paid ₹500 to you'), 'INR')).toEqual({ ok: false, reason: 'unknown-app' });
  });
});

describe('helpers', () => {
  it('finds the first amount that is not a balance', () => {
    expect(findAmount('Avl Bal Rs.12,345.67 after Rs.250.00 debited', 'INR')).toEqual({ amount: 25000, currency: 'INR' });
    expect(findAmount('₹1,23,456 sent', 'USD')).toEqual({ amount: 12345600, currency: 'INR' });
    expect(findAmount('See you in 2 hours', 'INR')).toBeNull();
  });

  it('tells banks from people and names the bank', () => {
    expect(['VM-HDFCBK', 'AX-KOTAKB-S', 'HDFCBK', '24273', 'HDFC Bank'].every(isBusinessSender)).toBe(true);
    expect(['Mom', 'Rahul Sharma', '+91 98765 43210', '', undefined].some(isBusinessSender)).toBe(false);
    expect(bankLabel('AX-KOTAKB-S')).toBe('Kotak Bank SMS');
    expect(bankLabel('HDFC Bank')).toBe('HDFC Bank SMS');
    expect(bankLabel('JM-XYZBNK')).toBe('Bank SMS');
  });
});
