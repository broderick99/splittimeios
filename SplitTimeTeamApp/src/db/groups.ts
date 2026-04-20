import type { SQLiteDatabase } from 'expo-sqlite';
import type { Group } from '@/types';

export async function getAllGroups(db: SQLiteDatabase): Promise<Group[]> {
  const rows = await db.getAllAsync<{
    id: string;
    name: string;
    color: string;
    sort_order: number;
  }>('SELECT id, name, color, sort_order FROM groups ORDER BY sort_order ASC, name ASC');
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    sortOrder: row.sort_order,
  }));
}

export async function insertGroup(db: SQLiteDatabase, group: Group): Promise<void> {
  await db.runAsync(
    'INSERT INTO groups (id, name, color, sort_order) VALUES (?, ?, ?, ?)',
    group.id,
    group.name,
    group.color,
    group.sortOrder
  );
}

export async function updateGroup(
  db: SQLiteDatabase,
  id: string,
  updates: { name?: string; color?: string; sortOrder?: number }
): Promise<void> {
  const sets: string[] = [];
  const values: (string | number)[] = [];
  if (updates.name !== undefined) {
    sets.push('name = ?');
    values.push(updates.name);
  }
  if (updates.color !== undefined) {
    sets.push('color = ?');
    values.push(updates.color);
  }
  if (updates.sortOrder !== undefined) {
    sets.push('sort_order = ?');
    values.push(updates.sortOrder);
  }
  if (sets.length === 0) return;
  values.push(id);
  await db.runAsync(`UPDATE groups SET ${sets.join(', ')} WHERE id = ?`, ...values);
}

export async function deleteGroup(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM groups WHERE id = ?', id);
}
