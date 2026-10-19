import { DEFAULT_CURRENCY, isSupportedCurrency, type CurrencyCode } from './currencies';

export interface CurrencySettings {
  baseCurrency: CurrencyCode;
  currencyConfirmed: boolean;
}

export interface SettingRow {
  key: string;
  value: string | boolean;
}

const UNCONFIRMED_DEFAULT: CurrencySettings = { baseCurrency: DEFAULT_CURRENCY, currencyConfirmed: false };

// Anything from a backup or storage is untrusted: an unknown code or a
// wrong type becomes unconfirmed USD, which makes the confirm modal appear.
export function normalizeCurrencySettings(raw: unknown): CurrencySettings {
  if (!raw || typeof raw !== 'object') return { ...UNCONFIRMED_DEFAULT };
  const { baseCurrency, currencyConfirmed } = raw as Record<string, unknown>;
  if (!isSupportedCurrency(baseCurrency)) return { ...UNCONFIRMED_DEFAULT };
  return { baseCurrency, currencyConfirmed: currencyConfirmed === true };
}

export function settingsToRows(s: CurrencySettings): SettingRow[] {
  return [
    { key: 'baseCurrency', value: s.baseCurrency },
    { key: 'currencyConfirmed', value: s.currencyConfirmed },
  ];
}

export function rowsToSettings(rows: SettingRow[]): CurrencySettings | null {
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  if (!byKey.has('baseCurrency')) return null;
  return normalizeCurrencySettings({
    baseCurrency: byKey.get('baseCurrency'),
    currencyConfirmed: byKey.get('currencyConfirmed'),
  });
}

// v10 upgrade. A database that already holds data was entered in dollars
// before currencies existed, so it stays USD (asking once to confirm). An
// empty one writes nothing and gets device detection on first load.
export function migrationSettingsRows(hasData: boolean): SettingRow[] {
  return hasData ? settingsToRows({ baseCurrency: DEFAULT_CURRENCY, currencyConfirmed: false }) : [];
}

export function resolveStartupSettings(stored: CurrencySettings | null, detected: CurrencyCode): CurrencySettings {
  return stored ?? { baseCurrency: detected, currencyConfirmed: false };
}
