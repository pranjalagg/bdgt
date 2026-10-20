import Dexie from 'dexie';
import { db } from '$lib/db';

// Each real-database test starts from an empty BudgetDB at the latest schema.
export async function resetRealDb(): Promise<void> {
  db.close();
  await Dexie.delete('BudgetDB');
  await db.open();
}
