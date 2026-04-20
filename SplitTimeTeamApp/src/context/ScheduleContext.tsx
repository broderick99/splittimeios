import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useDatabase } from '@/context/DatabaseContext';
import { useAuth } from '@/context/AuthContext';
import * as scheduleDb from '@/db/schedule';
import { generateId } from '@/utils/id';
import type { ScheduleEvent, ScheduleEventOverride, ScheduleEventType } from '@/types';

interface CreateScheduleEventInput {
  type: ScheduleEventType;
  category: string;
  title: string;
  startsAt: number;
  endsAt: number | null;
  location?: string | null;
  locationLatitude?: number | null;
  locationLongitude?: number | null;
  notes?: string | null;
  isRecurring: boolean;
  recurrenceDays: number[];
  recurrenceEndsAt?: number | null;
}

interface UpdateScheduleEventInput {
  type?: ScheduleEventType;
  category?: string;
  title?: string;
  startsAt?: number;
  endsAt?: number | null;
  location?: string | null;
  locationLatitude?: number | null;
  locationLongitude?: number | null;
  notes?: string | null;
  isRecurring?: boolean;
  recurrenceDays?: number[];
  recurrenceEndsAt?: number | null;
}

interface ScheduleContextValue {
  scheduleEvents: ScheduleEvent[];
  scheduleOverrides: ScheduleEventOverride[];
  isLoadingSchedule: boolean;
  createScheduleEvent: (input: CreateScheduleEventInput) => Promise<ScheduleEvent>;
  updateScheduleEvent: (eventId: string, updates: UpdateScheduleEventInput) => Promise<void>;
  updateScheduleOccurrence: (
    eventId: string,
    occurrenceStartsAt: number,
    updates: CreateScheduleEventInput
  ) => Promise<void>;
  deleteScheduleOccurrence: (eventId: string, occurrenceStartsAt: number) => Promise<void>;
  deleteScheduleEvent: (eventId: string) => Promise<void>;
  deleteAllScheduleEvents: () => Promise<void>;
  refreshScheduleEvents: () => Promise<void>;
}

const ScheduleContext = createContext<ScheduleContextValue | null>(null);

async function parseResponse(response: Response) {
  const text = await response.text();
  const contentType = response.headers.get('content-type') || '';
  const looksLikeJson =
    contentType.includes('application/json') ||
    contentType.includes('text/json') ||
    text.trim().startsWith('{') ||
    text.trim().startsWith('[');

  let data: any = null;

  if (text) {
    if (looksLikeJson) {
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('The schedule service returned invalid JSON.');
      }
    } else {
      const preview = text.trim().slice(0, 120);
      throw new Error(
        response.ok
          ? `The schedule service returned non-JSON content instead of app data.`
          : `The schedule service returned non-JSON content (${response.status}). ${preview.startsWith('<') ? 'It looks like an HTML error page.' : ''}`
      );
    }
  }

  if (!response.ok) {
    throw new Error(data?.error || `Request failed with status ${response.status}.`);
  }

  return data;
}

function mapScheduleEvent(item: any): ScheduleEvent {
  return {
    id: String(item.id),
    teamId: String(item.teamId ?? item.team_id ?? ''),
    type: (item.type ?? 'practice') === 'race' ? 'race' : 'practice',
    category: String(item.category ?? ''),
    title: String(item.title ?? ''),
    startsAt: Number(item.startsAt ?? item.starts_at ?? Date.now()),
    endsAt:
      item.endsAt === null || item.endsAt === undefined
        ? null
        : Number(item.endsAt ?? item.ends_at),
    location: item.location ?? null,
    locationLatitude:
      item.locationLatitude === null || item.locationLatitude === undefined
        ? item.location_latitude === null || item.location_latitude === undefined
          ? null
          : Number(item.location_latitude)
        : Number(item.locationLatitude),
    locationLongitude:
      item.locationLongitude === null || item.locationLongitude === undefined
        ? item.location_longitude === null || item.location_longitude === undefined
          ? null
          : Number(item.location_longitude)
        : Number(item.locationLongitude),
    notes: item.notes ?? null,
    isRecurring: Boolean(item.isRecurring ?? item.is_recurring),
    recurrenceDays: Array.isArray(item.recurrenceDays ?? item.recurrence_days)
      ? (item.recurrenceDays ?? item.recurrence_days).map((day: unknown) => Number(day))
      : [],
    recurrenceEndsAt:
      item.recurrenceEndsAt === null || item.recurrenceEndsAt === undefined
        ? item.recurrence_ends_at === null || item.recurrence_ends_at === undefined
          ? null
          : Number(item.recurrence_ends_at)
        : Number(item.recurrenceEndsAt),
    createdAt: Number(item.createdAt ?? item.created_at ?? Date.now()),
    updatedAt: Number(item.updatedAt ?? item.updated_at ?? Date.now()),
  };
}

function mapScheduleOverride(item: any): ScheduleEventOverride {
  return {
    id: String(item.id),
    eventId: String(item.eventId ?? item.event_id ?? ''),
    teamId: String(item.teamId ?? item.team_id ?? ''),
    occurrenceStartsAt: Number(item.occurrenceStartsAt ?? item.occurrence_starts_at ?? Date.now()),
    type: (item.type ?? 'practice') === 'race' ? 'race' : 'practice',
    category: String(item.category ?? ''),
    title: String(item.title ?? ''),
    startsAt: Number(item.startsAt ?? item.starts_at ?? Date.now()),
    endsAt:
      item.endsAt === null || item.endsAt === undefined
        ? null
        : Number(item.endsAt ?? item.ends_at),
    location: item.location ?? null,
    locationLatitude:
      item.locationLatitude === null || item.locationLatitude === undefined
        ? item.location_latitude === null || item.location_latitude === undefined
          ? null
          : Number(item.location_latitude)
        : Number(item.locationLatitude),
    locationLongitude:
      item.locationLongitude === null || item.locationLongitude === undefined
        ? item.location_longitude === null || item.location_longitude === undefined
          ? null
          : Number(item.location_longitude)
        : Number(item.locationLongitude),
    notes: item.notes ?? null,
    isCancelled: Boolean(item.isCancelled ?? item.is_cancelled),
    createdAt: Number(item.createdAt ?? item.created_at ?? Date.now()),
    updatedAt: Number(item.updatedAt ?? item.updated_at ?? Date.now()),
  };
}

export function ScheduleProvider({ children }: { children: React.ReactNode }) {
  const db = useDatabase();
  const { apiBaseUrl, session } = useAuth();
  const [scheduleEvents, setScheduleEvents] = useState<ScheduleEvent[]>([]);
  const [scheduleOverrides, setScheduleOverrides] = useState<ScheduleEventOverride[]>([]);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(false);

  const teamId = session?.team?.id ?? null;

  const refreshScheduleEvents = useCallback(async () => {
    if (!teamId) {
      setScheduleEvents([]);
      setScheduleOverrides([]);
      return;
    }

    setIsLoadingSchedule(true);
    try {
      if (apiBaseUrl && session) {
        try {
          const response = await fetch(`${apiBaseUrl}/schedule`, {
            headers: {
              Authorization: `Bearer ${session.token}`,
              Accept: 'application/json',
            },
          });
          const data = await parseResponse(response);
          const events = (Array.isArray(data?.events) ? data.events : []).map(mapScheduleEvent);
          const overrides = (Array.isArray(data?.overrides) ? data.overrides : []).map(
            mapScheduleOverride
          );
          setScheduleEvents(events);
          setScheduleOverrides(overrides);
          return;
        } catch (error) {
          console.warn('Falling back to local schedule cache:', error);
        }
      }

      const [events, overrides] = await Promise.all([
        scheduleDb.getScheduleEventsByTeam(db, teamId),
        scheduleDb.getScheduleOverridesByTeam(db, teamId),
      ]);
      setScheduleEvents(events);
      setScheduleOverrides(overrides);
    } finally {
      setIsLoadingSchedule(false);
    }
  }, [apiBaseUrl, db, session, teamId]);

  useEffect(() => {
    void refreshScheduleEvents().catch((error) => {
      console.warn('Could not refresh schedule events:', error);
    });
  }, [refreshScheduleEvents]);

  const createScheduleEvent = useCallback(
    async (input: CreateScheduleEventInput) => {
      if (!teamId) {
        throw new Error('No active team found for schedule.');
      }

      if (apiBaseUrl && session) {
        const response = await fetch(`${apiBaseUrl}/schedule/events`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.token}`,
            'content-type': 'application/json; charset=utf-8',
          },
          body: JSON.stringify(input),
        });
        const data = await parseResponse(response);
        const event = mapScheduleEvent(data);
        await refreshScheduleEvents();
        return event;
      }

      const now = Date.now();
      const event: ScheduleEvent = {
        id: generateId(),
        teamId,
        type: input.type,
        category: input.category.trim(),
        title: input.title.trim(),
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        location: input.location?.trim() || null,
        locationLatitude: input.locationLatitude ?? null,
        locationLongitude: input.locationLongitude ?? null,
        notes: input.notes?.trim() || null,
        isRecurring: input.isRecurring,
        recurrenceDays: input.isRecurring ? input.recurrenceDays : [],
        recurrenceEndsAt: input.isRecurring ? input.recurrenceEndsAt ?? null : null,
        createdAt: now,
        updatedAt: now,
      };

      await scheduleDb.insertScheduleEvent(db, event);
      setScheduleEvents((prev) =>
        [...prev, event].sort((left, right) => left.startsAt - right.startsAt)
      );
      return event;
    },
    [apiBaseUrl, db, refreshScheduleEvents, session, teamId]
  );

  const updateScheduleEvent = useCallback(
    async (eventId: string, updates: UpdateScheduleEventInput) => {
      if (apiBaseUrl && session) {
        const response = await fetch(`${apiBaseUrl}/schedule/events/${eventId}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${session.token}`,
            'content-type': 'application/json; charset=utf-8',
          },
          body: JSON.stringify(updates),
        });
        await parseResponse(response);
        await refreshScheduleEvents();
        return;
      }

      const current = scheduleEvents.find((event) => event.id === eventId);
      if (!current) {
        return;
      }

      const nextEvent: ScheduleEvent = {
        ...current,
        type: updates.type ?? current.type,
        category: updates.category?.trim() ?? current.category,
        title: updates.title?.trim() ?? current.title,
        startsAt: updates.startsAt ?? current.startsAt,
        endsAt: updates.endsAt !== undefined ? updates.endsAt : current.endsAt,
        location: updates.location !== undefined ? updates.location?.trim() || null : current.location,
        locationLatitude:
          updates.locationLatitude !== undefined ? updates.locationLatitude : current.locationLatitude,
        locationLongitude:
          updates.locationLongitude !== undefined ? updates.locationLongitude : current.locationLongitude,
        notes: updates.notes !== undefined ? updates.notes?.trim() || null : current.notes,
        isRecurring: updates.isRecurring ?? current.isRecurring,
        recurrenceDays:
          updates.isRecurring === false
            ? []
            : updates.recurrenceDays ?? current.recurrenceDays,
        recurrenceEndsAt:
          updates.isRecurring === false
            ? null
            : updates.recurrenceEndsAt !== undefined
              ? updates.recurrenceEndsAt
              : current.recurrenceEndsAt,
        updatedAt: Date.now(),
      };

      await scheduleDb.updateScheduleEvent(db, nextEvent);
      setScheduleEvents((prev) =>
        prev
          .map((event) => (event.id === eventId ? nextEvent : event))
          .sort((left, right) => left.startsAt - right.startsAt)
      );
    },
    [apiBaseUrl, db, refreshScheduleEvents, scheduleEvents, session]
  );

  const deleteScheduleEvent = useCallback(
    async (eventId: string) => {
      if (apiBaseUrl && session) {
        const response = await fetch(`${apiBaseUrl}/schedule/events/${eventId}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${session.token}`,
          },
        });
        await parseResponse(response);
        await refreshScheduleEvents();
        return;
      }

      await scheduleDb.deleteScheduleEvent(db, eventId);
      setScheduleEvents((prev) => prev.filter((event) => event.id !== eventId));
      setScheduleOverrides((prev) => prev.filter((override) => override.eventId !== eventId));
    },
    [apiBaseUrl, db, refreshScheduleEvents, session]
  );

  const deleteAllScheduleEvents = useCallback(async () => {
    if (!teamId) {
      return;
    }

    if (apiBaseUrl && session) {
      const response = await fetch(`${apiBaseUrl}/schedule/events`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      });
      await parseResponse(response);
      await refreshScheduleEvents();
      return;
    }

    await scheduleDb.deleteAllScheduleEventsByTeam(db, teamId);
    setScheduleEvents([]);
    setScheduleOverrides([]);
  }, [apiBaseUrl, db, refreshScheduleEvents, session, teamId]);

  const updateScheduleOccurrence = useCallback(
    async (eventId: string, occurrenceStartsAt: number, updates: CreateScheduleEventInput) => {
      if (!teamId) {
        return;
      }

      if (apiBaseUrl && session) {
        const response = await fetch(`${apiBaseUrl}/schedule/occurrences`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.token}`,
            'content-type': 'application/json; charset=utf-8',
          },
          body: JSON.stringify({
            eventId,
            occurrenceStartsAt,
            ...updates,
          }),
        });
        await parseResponse(response);
        await refreshScheduleEvents();
        return;
      }

      const existingOverride = scheduleOverrides.find(
        (override) =>
          override.eventId === eventId && override.occurrenceStartsAt === occurrenceStartsAt
      );
      const now = Date.now();
      const nextOverride: ScheduleEventOverride = {
        id: existingOverride?.id ?? generateId(),
        eventId,
        teamId,
        occurrenceStartsAt,
        type: updates.type,
        category: updates.category.trim(),
        title: updates.title.trim(),
        startsAt: updates.startsAt,
        endsAt: updates.endsAt,
        location: updates.location?.trim() || null,
        locationLatitude: updates.locationLatitude ?? null,
        locationLongitude: updates.locationLongitude ?? null,
        notes: updates.notes?.trim() || null,
        isCancelled: false,
        createdAt: existingOverride?.createdAt ?? now,
        updatedAt: now,
      };

      await scheduleDb.upsertScheduleOverride(db, nextOverride);
      setScheduleOverrides((prev) => {
        const others = prev.filter(
          (override) =>
            !(
              override.eventId === eventId &&
              override.occurrenceStartsAt === occurrenceStartsAt
            )
        );
        return [...others, nextOverride].sort(
          (left, right) => left.occurrenceStartsAt - right.occurrenceStartsAt
        );
      });
    },
    [apiBaseUrl, db, refreshScheduleEvents, scheduleOverrides, session, teamId]
  );

  const deleteScheduleOccurrence = useCallback(
    async (eventId: string, occurrenceStartsAt: number) => {
      if (!teamId) {
        return;
      }

      if (apiBaseUrl && session) {
        const response = await fetch(`${apiBaseUrl}/schedule/occurrences/delete`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.token}`,
            'content-type': 'application/json; charset=utf-8',
          },
          body: JSON.stringify({
            eventId,
            occurrenceStartsAt,
          }),
        });
        await parseResponse(response);
        await refreshScheduleEvents();
        return;
      }

      const existingOverride = scheduleOverrides.find(
        (override) =>
          override.eventId === eventId && override.occurrenceStartsAt === occurrenceStartsAt
      );
      const now = Date.now();
      const nextOverride: ScheduleEventOverride = {
        id: existingOverride?.id ?? generateId(),
        eventId,
        teamId,
        occurrenceStartsAt,
        type: existingOverride?.type ?? 'practice',
        category: existingOverride?.category ?? '',
        title: existingOverride?.title ?? '',
        startsAt: existingOverride?.startsAt ?? occurrenceStartsAt,
        endsAt: existingOverride?.endsAt ?? null,
        location: existingOverride?.location ?? null,
        locationLatitude: existingOverride?.locationLatitude ?? null,
        locationLongitude: existingOverride?.locationLongitude ?? null,
        notes: existingOverride?.notes ?? null,
        isCancelled: true,
        createdAt: existingOverride?.createdAt ?? now,
        updatedAt: now,
      };

      await scheduleDb.upsertScheduleOverride(db, nextOverride);
      setScheduleOverrides((prev) => {
        const others = prev.filter(
          (override) =>
            !(
              override.eventId === eventId &&
              override.occurrenceStartsAt === occurrenceStartsAt
            )
        );
        return [...others, nextOverride].sort(
          (left, right) => left.occurrenceStartsAt - right.occurrenceStartsAt
        );
      });
    },
    [apiBaseUrl, db, refreshScheduleEvents, scheduleOverrides, session, teamId]
  );

  const value = useMemo(
    () => ({
      scheduleEvents,
      scheduleOverrides,
      isLoadingSchedule,
      createScheduleEvent,
      updateScheduleEvent,
      updateScheduleOccurrence,
      deleteScheduleOccurrence,
      deleteScheduleEvent,
      deleteAllScheduleEvents,
      refreshScheduleEvents,
    }),
    [
      createScheduleEvent,
      deleteScheduleOccurrence,
      deleteScheduleEvent,
      deleteAllScheduleEvents,
      isLoadingSchedule,
      refreshScheduleEvents,
      scheduleEvents,
      scheduleOverrides,
      updateScheduleOccurrence,
      updateScheduleEvent,
    ]
  );

  return <ScheduleContext.Provider value={value}>{children}</ScheduleContext.Provider>;
}

export function useSchedule() {
  const context = useContext(ScheduleContext);

  if (!context) {
    throw new Error('useSchedule must be used within ScheduleProvider');
  }

  return context;
}
