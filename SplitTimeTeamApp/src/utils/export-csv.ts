import { formatTime } from '@/utils/format-time';
import { calculatePace, formatPace, paceUnitLabel } from '@/utils/pace';
import type { DistanceUnit, Split } from '@/types';

function csvEscape(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function csvLine(values: string[]): string {
  return values.map((value) => csvEscape(value)).join(',');
}

function blankCsvRow(columnCount: number): string {
  return csvLine(Array(columnCount).fill(''));
}

export function formatExportDate(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDistanceValue(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

function getStepName(split: Split): string {
  const label = split.stepLabel?.trim();
  if (split.isFinal) return label || 'Finish';
  if (label) return label;
  if (split.stepDistanceValue !== null && split.stepDistanceUnit) {
    return `${formatDistanceValue(split.stepDistanceValue)}${split.stepDistanceUnit}`;
  }
  return `Split ${split.splitNumber}`;
}

export interface DetailedSplitExportRow {
  step: string;
  split: string;
  lap: string;
  pace: string;
  stepType: Split['stepType'];
  isFinal: boolean;
}

export interface DetailedSplitExportSection {
  athleteName: string;
  groupName: string;
  rows: DetailedSplitExportRow[];
}

export function buildDetailedSplitSections(options: {
  splits: Split[];
  getAthleteName: (athleteId: string) => string;
  getGroupName?: (athleteId: string) => string;
}): DetailedSplitExportSection[] {
  const splitsByAthlete = new Map<string, Split[]>();
  for (const split of options.splits) {
    const bucket = splitsByAthlete.get(split.athleteId);
    if (bucket) {
      bucket.push(split);
    } else {
      splitsByAthlete.set(split.athleteId, [split]);
    }
  }

  return Array.from(splitsByAthlete.entries()).map(([athleteId, athleteSplits]) => {
    let previousElapsed = 0;
    const rows = athleteSplits.map((split) => {
      const lapTimeMs = Math.max(0, split.elapsedMs - previousElapsed);
      previousElapsed = split.elapsedMs;

      let pace = '--';
      if (split.stepDistanceValue && split.stepDistanceUnit) {
        const paceMinutes = calculatePace(
          lapTimeMs,
          split.stepDistanceValue,
          split.stepDistanceUnit as DistanceUnit,
          'mi'
        );
        pace = `${formatPace(paceMinutes)}${paceUnitLabel('mi')}`;
      }

      return {
        step: getStepName(split),
        split: formatTime(split.elapsedMs),
        lap: formatTime(lapTimeMs),
        pace,
        stepType: split.stepType,
        isFinal: split.isFinal,
      };
    });

    return {
      athleteName: options.getAthleteName(athleteId),
      groupName: options.getGroupName?.(athleteId) ?? '',
      rows,
    };
  });
}

export function buildDetailedSplitCsv(options: {
  workoutDate: number;
  workoutName: string;
  splits: Split[];
  getAthleteName: (athleteId: string) => string;
  getGroupName?: (athleteId: string) => string;
}): string {
  const sections = buildDetailedSplitSections({
    splits: options.splits,
    getAthleteName: options.getAthleteName,
    getGroupName: options.getGroupName,
  });

  const lines: string[] = [
    csvLine(['workout_name', options.workoutName]),
    csvLine(['workout_date', formatExportDate(options.workoutDate)]),
    blankCsvRow(4),
  ];

  sections.forEach((section, athleteIndex) => {
    lines.push(
      csvLine([
        section.athleteName,
        section.groupName,
      ])
    );
    lines.push(csvLine(['step', 'split', 'lap', 'pace']));

    for (const row of section.rows) {
      lines.push(csvLine([row.step, row.split, row.lap, row.pace]));
    }

    if (athleteIndex < sections.length - 1) {
      lines.push(blankCsvRow(4));
    }
  });

  return lines.join('\n');
}
