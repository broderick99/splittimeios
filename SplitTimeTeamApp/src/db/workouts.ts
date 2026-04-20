import type { SQLiteDatabase } from 'expo-sqlite';
import type { Workout, WorkoutAthlete, WorkoutSummary } from '@/types';

export async function insertWorkout(db: SQLiteDatabase, workout: Workout): Promise<void> {
  await db.runAsync(
    'INSERT INTO workouts (id, name, date, status, template_id) VALUES (?, ?, ?, ?, ?)',
    workout.id,
    workout.name,
    workout.date,
    workout.status,
    workout.templateId
  );
}

export async function insertWorkoutAthlete(
  db: SQLiteDatabase,
  wa: WorkoutAthlete
): Promise<void> {
  await db.runAsync(
    `INSERT INTO workout_athletes (workout_id, athlete_id, group_id, athlete_name, group_name, group_color)
     VALUES (?, ?, ?, ?, ?, ?)`,
    wa.workoutId,
    wa.athleteId,
    wa.groupId,
    wa.athleteName,
    wa.groupName,
    wa.groupColor
  );
}

export async function completeWorkout(db: SQLiteDatabase, workoutId: string): Promise<void> {
  await db.runAsync("UPDATE workouts SET status = 'completed' WHERE id = ?", workoutId);
}

export async function deleteWorkout(db: SQLiteDatabase, workoutId: string): Promise<void> {
  await db.runAsync('DELETE FROM workouts WHERE id = ?', workoutId);
}

export async function getWorkoutSummaries(db: SQLiteDatabase): Promise<WorkoutSummary[]> {
  return db.getAllAsync<WorkoutSummary>(
    `SELECT w.id, w.name, w.date, w.status,
            COUNT(wa.athlete_id) as athleteCount
     FROM workouts w
     LEFT JOIN workout_athletes wa ON w.id = wa.workout_id
     WHERE w.status = 'completed'
     GROUP BY w.id
     ORDER BY w.date DESC`
  );
}

export async function getWorkoutSummariesForAthlete(
  db: SQLiteDatabase,
  athleteId: string
): Promise<WorkoutSummary[]> {
  return db.getAllAsync<WorkoutSummary>(
    `SELECT w.id, w.name, w.date, w.status,
            COUNT(wa_all.athlete_id) as athleteCount
     FROM workouts w
     INNER JOIN workout_athletes wa_target
       ON w.id = wa_target.workout_id AND wa_target.athlete_id = ?
     LEFT JOIN workout_athletes wa_all
       ON w.id = wa_all.workout_id
     WHERE w.status = 'completed'
     GROUP BY w.id
     ORDER BY w.date DESC`,
    athleteId
  );
}

export async function getWorkout(db: SQLiteDatabase, id: string): Promise<Workout | null> {
  const row = await db.getFirstAsync<{
    id: string;
    name: string;
    date: number;
    status: string;
    template_id: string | null;
  }>(
    'SELECT id, name, date, status, template_id FROM workouts WHERE id = ?',
    id
  );
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    date: row.date,
    status: row.status as Workout['status'],
    templateId: row.template_id,
  };
}

export async function getWorkoutAthletes(
  db: SQLiteDatabase,
  workoutId: string
): Promise<WorkoutAthlete[]> {
  const rows = await db.getAllAsync<{
    workout_id: string;
    athlete_id: string;
    group_id: string | null;
    athlete_name: string;
    group_name: string | null;
    group_color: string | null;
  }>(
    `SELECT workout_id, athlete_id, group_id, athlete_name, group_name, group_color
     FROM workout_athletes WHERE workout_id = ? ORDER BY group_name ASC, athlete_name ASC`,
    workoutId
  );
  return rows.map((r) => ({
    workoutId: r.workout_id,
    athleteId: r.athlete_id,
    groupId: r.group_id,
    athleteName: r.athlete_name,
    groupName: r.group_name,
    groupColor: r.group_color,
  }));
}
