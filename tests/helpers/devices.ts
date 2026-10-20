import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { BudgetDatabase } from '$lib/db';
import { setCaptureEnabled } from '$lib/sync/capture';

// A simulated device: its own database, with capture on as it is for a
// signed-in device. (Capture is one switch per process, which is fine
// because every simulated device is signed in.)
export async function makeDevice(name: string): Promise<BudgetDatabase> {
  const device = new BudgetDatabase(name);
  await device.open();
  setCaptureEnabled(true);
  return device;
}

export async function dropDevice(device: BudgetDatabase): Promise<void> {
  setCaptureEnabled(false);
  device.close();
  await Dexie.delete(device.name);
}
