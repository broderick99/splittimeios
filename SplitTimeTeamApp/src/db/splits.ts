import type { SQLiteDatabase } from 'expo-sqlite';
import type { Split } from '@/types';

export async function insertSplit(db: SQLiteDatabase, split: Split): Promise<void> {
  await db.runAsync(
    `INSERT INTO splits (id, workout_id, athlete_id, split_number, elapsed_ms, timestamp, is_final,
      step_type, step_distance_value, step_distance_unit, step_label)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    split.id,
    split.workoutId,
    split.athleteId,
    split.splitNumber,
    split.elapsedMs,
    split.timestamp,
    split.isFinal ? 1 : 0,
    split.stepType,
    split.stepDistanceValue,
    split.stepDistanceUnit,
    split.stepLabel
  );
}

export async function bulkInsertSplits(db: SQLiteDatabase, splits: Split[]): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const split of splits) {
      await insertSplit(db, split);
    }
  });
}

export async function getSplitsForWorkout(db: SQLiteDatabase, workoutId: string): Promise<Split[]> {
  const rows = await db.getAllAsync<{
    id: string;
    workout_id: string;
    athlete_id: string;
    split_number: number;
    elapsed_ms: number;
    timestamp: number;
    is_final: number;
    step_type: string | null;
    step_distance_value: number | null;
    step_distance_unit: string | null;
    step_label: string | null;
  }>(
    `SELECT id, workout_id, athlete_id, split_number, elapsed_ms, timestamp, is_final,
            step_type, step_distance_value, step_distance_unit, step_label
     FROM splits WHERE workout_id = ? ORDER BY athlete_id, split_number ASC`,
    workoutId
  );
  return rows.map((r) => ({
    id: r.id,
    workoutId: r.workout_id,
    athleteId: r.athlete_id,
    splitNumber: r.split_number,
    elapsedMs: r.elapsed_ms,
    timestamp: r.timestamp,
    isFinal: r.is_final === 1,
    stepType: r.step_type as Split['stepType'],
    stepDistanceValue: r.step_distance_value,
    stepDistanceUnit: r.step_distance_unit as Split['stepDistanceUnit'],
    stepLabel: r.step_label,
  }));
}
