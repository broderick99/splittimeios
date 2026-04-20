import type { DistanceUnit } from '@/types';

const METERS_PER_MILE = 1609.34;
const METERS_PER_KM = 1000;

/**
 * Convert a distance to meters.
 */
function toMeters(value: number, unit: DistanceUnit): number {
  switch (unit) {
    case 'm':
      return value;
    case 'mi':
      return value * METERS_PER_MILE;
    case 'km':
      return value * METERS_PER_KM;
  }
}

/**
 * Convert meters to a target distance unit.
 */
function fromMeters(meters: number, unit: DistanceUnit): number {
  switch (unit) {
    case 'm':
      return meters;
    case 'mi':
      return meters / METERS_PER_MILE;
    case 'km':
      return meters / METERS_PER_KM;
  }
}

/**
 * Calculate pace in minutes per `paceUnit`.
 *
 * @returns pace in minutes (e.g., 6.5 means 6:30/mi)
 */
export function calculatePace(
  elapsedMs: number,
  distanceValue: number,
  distanceUnit: DistanceUnit,
  paceUnit: DistanceUnit = 'mi'
): number {
  if (distanceValue <= 0 || elapsedMs <= 0) return 0;
  const meters = toMeters(distanceValue, distanceUnit);
  const paceDistance = fromMeters(meters, paceUnit);
  const elapsedMinutes = elapsedMs / 60000;
  return elapsedMinutes / paceDistance;
}

/**
 * Format a pace value (in minutes) into "M:SS" string.
 *
 * @example formatPace(6.5) → "6:30"
 * @example formatPace(5.083) → "5:05"
 */
export function formatPace(paceMinutes: number): string {
  if (paceMinutes <= 0 || !isFinite(paceMinutes)) return '--:--';
  const minutes = Math.floor(paceMinutes);
  const seconds = Math.round((paceMinutes - minutes) * 60);
  // Handle edge case where rounding gives 60 seconds
  if (seconds === 60) {
    return `${minutes + 1}:00`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Get the display label for a pace unit.
 */
export function paceUnitLabel(unit: DistanceUnit): string {
  switch (unit) {
    case 'm':
      return '/m';
    case 'mi':
      return '/mi';
    case 'km':
      return '/km';
  }
}
