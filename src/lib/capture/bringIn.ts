import type { BudgetDatabase } from '$lib/db';
import type { CurrencyCode } from '$lib/currency/currencies';
import { autoTransaction } from '$lib/sync/transactions';
import type { Capture, CaptureRaw } from '$lib/types';
import { findDuplicate, DUPLICATE_WINDOW_MS, type Candidate } from './dedupe';
import type { KeptItem } from './native';
import { parseItem } from './parse';
import { displayMerchant, merchantKind, payeeKey } from './payee';
import { rulesByKey } from './queue';

// Moves what the phone kept into the review queue: read each item, drop what
// is not spending, apply ignore rules, mark duplicates, store, then tell the
// phone the item is done. A run cut off before the last step is safe to
// repeat: items already in the queue are skipped.

export interface Inbox {
  takePending(options?: { limit?: number }): Promise<{ items: KeptItem[] }>;
  ack(options: { ids: string[] }): Promise<void>;
}

const BATCH = 200;
const RAW_KEEP_MS = 30 * 24 * 3600_000; // full text kept this long after a payment is resolved

function localDay(ms: number): Date {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export async function bringIn(db: BudgetDatabase, inbox: Inbox, base: CurrencyCode, now = Date.now()): Promise<{ added: number; read: number }> {
  let added = 0;
  let read = 0;
  for (;;) {
    const { items } = await inbox.takePending({ limit: BATCH });
    if (items.length === 0) break;
    read += items.length;

    const rules = rulesByKey(await db.captureRules.toArray());
    const since = localDay(Math.min(...items.map((i) => i.postedAt)) - DUPLICATE_WINDOW_MS);
    const recent = await db.captures.where('date').aboveOrEqual(since).toArray();
    const recentRaw = await db.captureRaw.bulkGet(recent.map((c) => c.id));
    const candidates: Candidate[] = recent.map((capture, i) => ({ capture, reference: recentRaw[i]?.reference }));

    const captures: Capture[] = [];
    const raws: CaptureRaw[] = [];
    for (const item of items) {
      const result = parseItem(item, base);
      if (!result.ok) continue;
      const p = result.payment;
      const id = `${p.source}:${item.id}`;
      if ((await db.captures.get(id)) || (await db.syncVersions.get(`captures:${id}`))) continue;

      const capture: Capture = {
        id,
        status: 'pending',
        source: p.source,
        sourceLabel: p.sourceLabel,
        postedAt: item.postedAt,
        date: localDay(item.postedAt),
        amount: p.amount,
        currency: p.currency,
        merchant: displayMerchant(p),
      };
      const key = await payeeKey(p);
      const kind = merchantKind(p);
      if (key) capture.payeeKey = key;
      if (kind) capture.kind = kind;
      if (p.accountHint) capture.accountHint = p.accountHint;
      if (p.hint) capture.hint = p.hint;

      const duplicateOf = findDuplicate(capture, p.reference, candidates);
      if (key && rules.get(key)?.action === 'ignore') {
        capture.status = 'dismissed';
        capture.resolvedAt = now;
      } else if (duplicateOf) {
        capture.status = 'duplicate';
        capture.duplicateOf = duplicateOf;
      } else {
        added++;
      }
      captures.push(capture);
      candidates.push({ capture, reference: p.reference });

      // An SMS notification's title is just its sender; an app's title often
      // carries the merchant or the amount.
      const text = item.kind === 'sms' ? item.text : [item.title, item.text].filter(Boolean).join('\n');
      const raw: CaptureRaw = { id, packageName: item.packageName, text, postedAt: item.postedAt };
      if (item.sender) raw.sender = item.sender;
      if (p.reference) raw.reference = p.reference;
      raws.push(raw);
    }

    if (captures.length > 0) {
      // Automatic writes: any person's edit, on any device, beats them.
      await autoTransaction(db, [db.captures, db.captureRaw], async () => {
        await db.captures.bulkPut(captures);
        await db.captureRaw.bulkPut(raws);
      });
    }
    await inbox.ack({ ids: items.map((i) => i.id) });
    if (items.length < BATCH) break;
  }
  await forgetOldRaw(db, now);
  return { added, read };
}

// The full text behind a payment goes 30 days after it was resolved.
async function forgetOldRaw(db: BudgetDatabase, now: number): Promise<void> {
  const cutoff = now - RAW_KEEP_MS;
  const ids = (await db.captureRaw.where('postedAt').below(cutoff).primaryKeys()).map(String);
  if (ids.length === 0) return;
  const captures = await db.captures.bulkGet(ids);
  const stale = ids.filter((_, i) => {
    const c = captures[i];
    return !c || (c.status !== 'pending' && (c.resolvedAt ?? c.postedAt) < cutoff);
  });
  if (stale.length > 0) await db.captureRaw.bulkDelete(stale);
}
