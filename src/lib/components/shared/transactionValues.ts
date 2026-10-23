import type { ForeignAmount } from '$lib/types';

// What TransactionForm hands back on submit.
export interface TransactionValues {
  typedMinor: number; // what was typed, in minor units of the chosen currency
  baseCents: number; // the same in the base currency (equal when not foreign)
  foreign?: ForeignAmount;
  bucketId: string;
  date: Date;
  note?: string;
}
