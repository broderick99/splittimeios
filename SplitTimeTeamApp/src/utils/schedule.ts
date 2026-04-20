import type { ScheduleEvent, ScheduleEventOverride, ScheduleOccurrence } from '@/types';

export const WEEKDAY_OPTIONS = [
  { value: 0, shortLabel: 'Sun', label: 'Sunday' },
  { value: 1, shortLabel: 'Mon', label: 'Monday' },
  { value: 2, shortLabel: 'Tue', label: 'Tuesday' },
  { value: 3, shortLabel: 'Wed', label: 'Wednesday' },
  { value: 4, shortLabel: 'Thu', label: 'Thursday' },
  { value: 5, shortLabel: 'Fri', label: 'Friday' },
  { value: 6, shortLabel: 'Sat', label: 'Saturday' },
] as const;

export const RECURRING_WEEKDAY_OPTIONS = [
  WEEKDAY_OPTIONS[1],
  WEEKDAY_OPTIONS[2],
  WEEKDAY_OPTIONS[3],
  WEEKDAY_OPTIONS[4],
  WEEKDAY_OPTIONS[5],
  WEEKDAY_OPTIONS[6],
  WEEKDAY_OPTIONS[0],
] as const;

export const PRACTICE_CATEGORY_OPTIONS = [
  'Easy Run',
  'Long Run',
  'Speed Workout',
  'Tempo',
  'Recovery',
  'Gym',
  'Team Practice',
  'Other',
] as const;

export const RACE_CATEGORY_OPTIONS = [
  'Meet',
  'Invitational',
  'Championship',
  'Time Trial',
  'Travel',
  'Other',
] as const;

export function getScheduleCategoryOptions(type: ScheduleEvent['type']): readonly string[] {
  return type === 'practice' ? PRACTICE_CATEGORY_OPTIONS : RACE_CATEGORY_OPTIONS;
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function combineDateAndTime(parts: {
  year: number;
  monthIndex: number;
  day: number;
  hour12: number;
  minute: number;
  meridiem: 'AM' | 'PM';
}): number {
  let hour24 = parts.hour12 % 12;
  if (parts.meridiem === 'PM') {
    hour24 += 12;
  }

  return new Date(
    parts.year,
    parts.monthIndex,
    parts.day,
    hour24,
    parts.minute,
    0,
    0
  ).getTime();
}

export function getDateParts(timestamp: number) {
  const date = new Date(timestamp);
  const hours = date.getHours();
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;

  return {
    year: date.getFullYear(),
    monthIndex: date.getMonth(),
    day: date.getDate(),
    hour12,
    minute: date.getMinutes(),
    meridiem: hours >= 12 ? ('PM' as const) : ('AM' as const),
  };
}

export function formatScheduleDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(timestamp));
}

export function formatScheduleMonthYear(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
  }).format(new Date(timestamp));
}

export function getStartOfWeek(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + mondayOffset);
  return date.getTime();
}

export function formatScheduleWeekLabel(weekStart: number, referenceTime = Date.now()): string {
  const currentWeekStart = getStartOfWeek(referenceTime);
  const nextWeekStart = addDays(currentWeekStart, 7);

  if (weekStart === currentWeekStart) {
    return 'This Week';
  }

  if (weekStart === nextWeekStart) {
    return 'Next Week';
  }

  const weekEnd = addDays(weekStart, 6);
  const start = new Date(weekStart);
  const end = new Date(weekEnd);

  const startMonth = new Intl.DateTimeFormat(undefined, { month: 'short' }).format(start);
  const endMonth = new Intl.DateTimeFormat(undefined, { month: 'short' }).format(end);
  const startDay = new Intl.DateTimeFormat(undefined, { day: 'numeric' }).format(start);
  const endDay = new Intl.DateTimeFormat(undefined, { day: 'numeric' }).format(end);

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}-${endDay}`;
  }

  return `${startMonth} ${startDay}-${endMonth} ${endDay}`;
}

export function formatScheduleDateFull(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(timestamp));
}

export function formatScheduleDateShort(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(timestamp));
}

export function formatScheduleTimeRange(startsAt: number, endsAt: number | null): string {
  const timeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  if (!endsAt) {
    return timeFormatter.format(new Date(startsAt));
  }

  return `${timeFormatter.format(new Date(startsAt))} - ${timeFormatter.format(new Date(endsAt))}`;
}

export function getLocationDisplayName(location: string | null): string {
  if (!location) {
    return '';
  }

  return location.split(',')[0]?.trim() || location;
}

export function getLocationDisplayAddress(location: string | null): string | null {
  if (!location) {
    return null;
  }

  const parts = location
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    return null;
  }

  return parts.slice(1).join(', ');
}

export function getScheduleDayNumber(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
  }).format(new Date(timestamp));
}

export function getScheduleWeekdayShort(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
  }).format(new Date(timestamp));
}

export function formatRecurrenceDaysLabel(days: number[]): string | null {
  const normalized = [...new Set(days)]
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((left, right) => left - right);

  if (normalized.length === 0) {
    return null;
  }

  const asKey = normalized.join(',');
  if (asKey === '0,1,2,3,4,5,6') {
    return 'every day';
  }

  if (asKey === '1,2,3,4,5') {
    return 'weekdays';
  }

  if (asKey === '0,6') {
    return 'weekends';
  }

  if (normalized.length === 1) {
    return WEEKDAY_OPTIONS.find((day) => day.value === normalized[0])?.shortLabel ?? null;
  }

  const mondayFirst = [1, 2, 3, 4, 5, 6, 0];
  const ordered = normalized
    .map((day) => mondayFirst.indexOf(day))
    .sort((left, right) => left - right);

  const contiguous = ordered.every((value, index) => index === 0 || value === ordered[index - 1] + 1);
  if (contiguous) {
    const startDay = mondayFirst[ordered[0]];
    const endDay = mondayFirst[ordered[ordered.length - 1]];
    const startLabel = WEEKDAY_OPTIONS.find((day) => day.value === startDay)?.shortLabel;
    const endLabel = WEEKDAY_OPTIONS.find((day) => day.value === endDay)?.shortLabel;
    if (startLabel && endLabel) {
      return `${startLabel}-${endLabel}`;
    }
  }

  return normalized
    .map((day) => WEEKDAY_OPTIONS.find((item) => item.value === day)?.shortLabel)
    .filter(Boolean)
    .join(', ');
}

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function addDays(timestamp: number, amount: number): number {
  const date = new Date(timestamp);
  date.setDate(date.getDate() + amount);
  return date.getTime();
}

export function getRecurrenceSummary(event: ScheduleEvent): string | null {
  if (!event.isRecurring || event.recurrenceDays.length === 0) {
    return null;
  }

  const daysLabel = formatRecurrenceDaysLabel(event.recurrenceDays);
  if (!daysLabel) {
    return null;
  }

  return event.recurrenceEndsAt
    ? `Repeats ${daysLabel} until ${formatScheduleDateShort(event.recurrenceEndsAt)}`
    : `Repeats ${daysLabel}`;
}

export function buildUpcomingOccurrences(
  events: ScheduleEvent[],
  overrides: ScheduleEventOverride[] = [],
  options?: { from?: number; daysAhead?: number; maxCount?: number }
): ScheduleOccurrence[] {
  const from = options?.from ?? Date.now();
  const daysAhead = options?.daysAhead ?? 90;
  const maxCount = options?.maxCount ?? 60;
  const horizon = addDays(startOfDay(from), daysAhead);
  const results: ScheduleOccurrence[] = [];
  const overrideMap = new Map(
    overrides.map((override) => [`${override.eventId}:${override.occurrenceStartsAt}`, override])
  );

  for (const event of events) {
    const duration = event.endsAt ? Math.max(0, event.endsAt - event.startsAt) : null;

    if (!event.isRecurring || event.recurrenceDays.length === 0) {
      if (event.startsAt >= from && event.startsAt <= horizon) {
        results.push({
          id: `${event.id}:${event.startsAt}`,
          eventId: event.id,
          type: event.type,
          category: event.category,
          title: event.title,
          startsAt: event.startsAt,
          endsAt: duration === null ? null : event.startsAt + duration,
          location: event.location,
          locationLatitude: event.locationLatitude,
          locationLongitude: event.locationLongitude,
          notes: event.notes,
          isRecurring: false,
        });
      }
      continue;
    }

    const anchor = new Date(event.startsAt);
    const hours = anchor.getHours();
    const minutes = anchor.getMinutes();
    const eventStartDay = startOfDay(event.startsAt);
    const recurrenceEndDay =
      event.recurrenceEndsAt === null ? horizon : Math.min(horizon, startOfDay(event.recurrenceEndsAt));

    for (let dayCursor = Math.max(startOfDay(from), eventStartDay); dayCursor <= recurrenceEndDay; dayCursor = addDays(dayCursor, 1)) {
      const day = new Date(dayCursor);
      if (!event.recurrenceDays.includes(day.getDay())) {
        continue;
      }

      const occurrenceStart = new Date(dayCursor);
      occurrenceStart.setHours(hours, minutes, 0, 0);
      const startsAt = occurrenceStart.getTime();
      if (startsAt < from) {
        continue;
      }

      const override = overrideMap.get(`${event.id}:${startsAt}`);
      if (override?.isCancelled) {
        continue;
      }

      results.push({
        id: override?.id ?? `${event.id}:${startsAt}`,
        eventId: event.id,
        type: override?.type ?? event.type,
        category: override?.category ?? event.category,
        title: override?.title ?? event.title,
        startsAt: override?.startsAt ?? startsAt,
        endsAt: override ? override.endsAt : duration === null ? null : startsAt + duration,
        location: override?.location ?? event.location,
        locationLatitude: override?.locationLatitude ?? event.locationLatitude,
        locationLongitude: override?.locationLongitude ?? event.locationLongitude,
        notes: override?.notes ?? event.notes,
        isRecurring: true,
      });

      if (results.length >= maxCount * 2) {
        break;
      }
    }
  }

  return results
    .sort((left, right) => left.startsAt - right.startsAt)
    .slice(0, maxCount);
}
