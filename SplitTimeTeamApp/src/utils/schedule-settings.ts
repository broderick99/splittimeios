import type { SQLiteDatabase } from 'expo-sqlite';
import { getSetting, setSetting } from '@/db/settings';

export const SCHEDULE_SETTINGS_KEYS = {
  showFilters: 'schedule.showFilters',
  showCategoryOnCards: 'schedule.showCategoryOnCards',
  showLocationOnCards: 'schedule.showLocationOnCards',
} as const;

export const SCHEDULE_SETTINGS_DEFAULTS = {
  showFilters: true,
  showCategoryOnCards: true,
  showLocationOnCards: true,
} as const;

export async function getBooleanScheduleSetting(
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

export async function setBooleanScheduleSetting(
  db: SQLiteDatabase,
  key: string,
  value: boolean
) {
  await setSetting(db, key, value ? '1' : '0');
}
