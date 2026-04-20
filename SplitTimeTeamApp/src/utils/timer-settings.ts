import type { SQLiteDatabase } from 'expo-sqlite';
import { getSetting, setSetting } from '@/db/settings';

export const TIMER_SETTINGS_KEYS = {
  autoReorder: 'timer.autoReorder',
  showTapHints: 'timer.showTapHints',
  showStatusStrip: 'timer.showStatusStrip',
} as const;

export const TIMER_SETTINGS_DEFAULTS = {
  autoReorder: true,
  showTapHints: true,
  showStatusStrip: true,
} as const;

export async function getBooleanTimerSetting(
  db: SQLiteDatabase,
  key: string,
  fallback: boolean
) {
  const value = await getSetting(db, key);
  if (value === null) {
    return fallback;
  }

  return value === '1';
}

export async function setBooleanTimerSetting(
  db: SQLiteDatabase,
  key: string,
  value: boolean
) {
  await setSetting(db, key, value ? '1' : '0');
}
