import { loadData } from './budgetStore';
import { loadCurrency } from './currencyStore';
import { loadGoals } from './goalsStore';
import { loadInvestments } from './investmentStore';
import { loadRecurring, processRecurring } from './recurringStore';

// Everything on screen comes from these stores. After a sync changes the
// database underneath them, reload all of them without a loading screen or a
// repeated currency dialog, then create any recurring items the sync made due.
export async function reloadAllStores(): Promise<void> {
  await loadCurrency({ keepPrompt: true });
  await loadData({ background: true });
  await loadRecurring();
  await loadGoals();
  await loadInvestments();
  await processRecurring();
}
