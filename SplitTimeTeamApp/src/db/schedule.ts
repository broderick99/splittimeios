import type { SQLiteDatabase } from 'expo-sqlite';
import type { ScheduleEvent, ScheduleEventOverride } from '@/types';

type ScheduleRow = {
  id: string;
  team_id: string;
  type: ScheduleEvent['type'];
  category: string;
  title: string;
  starts_at: number;
  ends_at: number | null;
  location: string | null;
  location_latitude: number | null;
  location_longitude: number | null;
  notes: string | null;
  is_recurring: number;
  recurrence_days: string;
  recurrence_ends_at: number | null;
  created_at: number;
  updated_at: number;
};

type ScheduleOverrideRow = {
  id: string;
  event_id: string;
  team_id: string;
  occurrence_starts_at: number;
  type: ScheduleEvent['type'];
  category: string;
  title: string;
  starts_at: number;
  ends_at: number | null;
  location: string | null;
  location_latitude: number | null;
  location_longitude: number | null;
  notes: string | null;
  is_cancelled: number;
  created_at: number;
  updated_at: number;
};

function parseRecurrenceDays(value: string): number[] {
  if (!value.trim()) {
    return [];
  }

  return value
    .split(',')
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6);
}

function serializeRecurrenceDays(days: number[]): string {
  return [...new Set(days)].sort((left, right) => left - right).join(',');
}

function mapRow(row: ScheduleRow): ScheduleEvent {
  return {
    id: row.id,
    teamId: row.team_id,
    type: row.type,
    category: row.category,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    location: row.location,
    locationLatitude: row.location_latitude,
    locationLongitude: row.location_longitude,
    notes: row.notes,
    isRecurring: row.is_recurring === 1,
    recurrenceDays: parseRecurrenceDays(row.recurrence_days),
    recurrenceEndsAt: row.recurrence_ends_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapOverrideRow(row: ScheduleOverrideRow): ScheduleEventOverride {
  return {
    id: row.id,
    eventId: row.event_id,
    teamId: row.team_id,
    occurrenceStartsAt: row.occurrence_starts_at,
    type: row.type,
    category: row.category,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    location: row.location,
    locationLatitude: row.location_latitude,
    locationLongitude: row.location_longitude,
    notes: row.notes,
    isCancelled: row.is_cancelled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getScheduleEventsByTeam(
  db: SQLiteDatabase,
  teamId: string
): Promise<ScheduleEvent[]> {
  const rows = await db.getAllAsync<ScheduleRow>(
    `SELECT id, team_id, type, category, title, starts_at, ends_at, location, location_latitude,
            location_longitude, notes, is_recurring, recurrence_days, recurrence_ends_at,
            created_at, updated_at
     FROM schedule_events
     WHERE team_id = ?
     ORDER BY starts_at ASC, created_at ASC`,
    teamId
  );

  return rows.map(mapRow);
}

export async function insertScheduleEvent(
  db: SQLiteDatabase,
  event: ScheduleEvent
): Promise<void> {
  await db.runAsync(
    `INSERT INTO schedule_events (
      id, team_id, type, category, title, starts_at, ends_at, location, location_latitude,
      location_longitude, notes, is_recurring, recurrence_days, recurrence_ends_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    event.id,
    event.teamId,
    event.type,
    event.category,
    event.title,
    event.startsAt,
    event.endsAt,
    event.location,
    event.locationLatitude,
    event.locationLongitude,
    event.notes,
    event.isRecurring ? 1 : 0,
    serializeRecurrenceDays(event.recurrenceDays),
    event.recurrenceEndsAt,
    event.createdAt,
    event.updatedAt
  );
}

export async function updateScheduleEvent(
  db: SQLiteDatabase,
  event: ScheduleEvent
): Promise<void> {
  await db.runAsync(
    `UPDATE schedule_events
     SET type = ?, category = ?, title = ?, starts_at = ?, ends_at = ?, location = ?,
         location_latitude = ?, location_longitude = ?, notes = ?,
         is_recurring = ?, recurrence_days = ?, recurrence_ends_at = ?, updated_at = ?
     WHERE id = ?`,
    event.type,
    event.category,
    event.title,
    event.startsAt,
    event.endsAt,
    event.location,
    event.locationLatitude,
    event.locationLongitude,
    event.notes,
    event.isRecurring ? 1 : 0,
    serializeRecurrenceDays(event.recurrenceDays),
    event.recurrenceEndsAt,
    event.updatedAt,
    event.id
  );
}

export async function deleteScheduleEvent(
  db: SQLiteDatabase,
  eventId: string
): Promise<void> {
  await db.runAsync(`DELETE FROM schedule_events WHERE id = ?`, eventId);
  await db.runAsync(`DELETE FROM schedule_event_overrides WHERE event_id = ?`, eventId);
}

export async function deleteAllScheduleEventsByTeam(
  db: SQLiteDatabase,
  teamId: string
): Promise<void> {
  await db.runAsync(`DELETE FROM schedule_event_overrides WHERE team_id = ?`, teamId);
  await db.runAsync(`DELETE FROM schedule_events WHERE team_id = ?`, teamId);
}

export async function getScheduleOverridesByTeam(
  db: SQLiteDatabase,
  teamId: string
): Promise<ScheduleEventOverride[]> {
  const rows = await db.getAllAsync<ScheduleOverrideRow>(
    `SELECT id, event_id, team_id, occurrence_starts_at, type, category, title, starts_at,
            ends_at, location, location_latitude, location_longitude, notes, is_cancelled,
            created_at, updated_at
     FROM schedule_event_overrides
     WHERE team_id = ?
     ORDER BY occurrence_starts_at ASC`,
    teamId
  );

  return rows.map(mapOverrideRow);
}

export async function upsertScheduleOverride(
  db: SQLiteDatabase,
  override: ScheduleEventOverride
): Promise<void> {
  await db.runAsync(
    `INSERT INTO schedule_event_overrides (
      id, event_id, team_id, occurrence_starts_at, type, category, title, starts_at,
      ends_at, location, location_latitude, location_longitude, notes, is_cancelled, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(event_id, occurrence_starts_at) DO UPDATE SET
      type = excluded.type,
      category = excluded.category,
      title = excluded.title,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      location = excluded.location,
      location_latitude = excluded.location_latitude,
      location_longitude = excluded.location_longitude,
      notes = excluded.notes,
      is_cancelled = excluded.is_cancelled,
      updated_at = excluded.updated_at`,
    override.id,
    override.eventId,
    override.teamId,
    override.occurrenceStartsAt,
    override.type,
    override.category,
    override.title,
    override.startsAt,
    override.endsAt,
    override.location,
    override.locationLatitude,
    override.locationLongitude,
    override.notes,
    override.isCancelled ? 1 : 0,
    override.createdAt,
    override.updatedAt
  );
}
