import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync('splittime.db');
  await db.execAsync('PRAGMA journal_mode = WAL');
  await db.execAsync('PRAGMA foreign_keys = ON');
  await initSchema(db);
  return db;
}

async function initSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#2563EB',
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS athletes (
      id TEXT PRIMARY KEY NOT NULL,
      remote_user_id TEXT,
      name TEXT NOT NULL,
      first_name TEXT,
      last_name TEXT,
      email TEXT,
      phone TEXT,
      age INTEGER,
      grade TEXT,
      group_id TEXT,
      photo_uri TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS workouts (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      date INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS workout_athletes (
      workout_id TEXT NOT NULL,
      athlete_id TEXT NOT NULL,
      group_id TEXT,
      athlete_name TEXT NOT NULL,
      group_name TEXT,
      group_color TEXT,
      PRIMARY KEY (workout_id, athlete_id),
      FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS splits (
      id TEXT PRIMARY KEY NOT NULL,
      workout_id TEXT NOT NULL,
      athlete_id TEXT NOT NULL,
      split_number INTEGER NOT NULL,
      elapsed_ms INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      is_final INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_splits_workout ON splits(workout_id);
    CREATE INDEX IF NOT EXISTS idx_splits_athlete ON splits(workout_id, athlete_id);
    CREATE INDEX IF NOT EXISTS idx_athletes_group ON athletes(group_id);

    CREATE TABLE IF NOT EXISTS workout_templates (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS template_repeat_groups (
      id TEXT PRIMARY KEY NOT NULL,
      template_id TEXT NOT NULL,
      repeat_count INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (template_id) REFERENCES workout_templates(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS template_steps (
      id TEXT PRIMARY KEY NOT NULL,
      template_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      type TEXT NOT NULL DEFAULT 'work',
      distance_value REAL,
      distance_unit TEXT,
      duration_ms INTEGER,
      label TEXT NOT NULL DEFAULT '',
      repeat_group_id TEXT,
      FOREIGN KEY (template_id) REFERENCES workout_templates(id) ON DELETE CASCADE,
      FOREIGN KEY (repeat_group_id) REFERENCES template_repeat_groups(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_template_steps_template ON template_steps(template_id);
    CREATE INDEX IF NOT EXISTS idx_template_repeat_groups_template ON template_repeat_groups(template_id);

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id TEXT PRIMARY KEY NOT NULL,
      team_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      author_name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_announcements_team_created
      ON announcements(team_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS schedule_events (
      id TEXT PRIMARY KEY NOT NULL,
      team_id TEXT NOT NULL,
      type TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      starts_at INTEGER NOT NULL,
      ends_at INTEGER,
      location TEXT,
      location_latitude REAL,
      location_longitude REAL,
      notes TEXT,
      is_recurring INTEGER NOT NULL DEFAULT 0,
      recurrence_days TEXT NOT NULL DEFAULT '',
      recurrence_ends_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_schedule_events_team_start
      ON schedule_events(team_id, starts_at ASC);

    CREATE TABLE IF NOT EXISTS schedule_event_overrides (
      id TEXT PRIMARY KEY NOT NULL,
      event_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      occurrence_starts_at INTEGER NOT NULL,
      type TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      starts_at INTEGER NOT NULL,
      ends_at INTEGER,
      location TEXT,
      location_latitude REAL,
      location_longitude REAL,
      notes TEXT,
      is_cancelled INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_overrides_occurrence
      ON schedule_event_overrides(event_id, occurrence_starts_at);
  `);

  // Migrations for existing databases
  await runMigrations(db);
}

async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    )
  `);

  // Check if photo_uri column exists on athletes table; add it if missing
  const athleteInfo = await db.getAllAsync<{ name: string }>(
    `PRAGMA table_info(athletes)`
  );
  const hasPhotoUri = athleteInfo.some((col) => col.name === 'photo_uri');
  if (!hasPhotoUri) {
    await db.execAsync(`ALTER TABLE athletes ADD COLUMN photo_uri TEXT`);
  }

  const hasRemoteUserId = athleteInfo.some((col) => col.name === 'remote_user_id');
  if (!hasRemoteUserId) {
    await db.execAsync(`ALTER TABLE athletes ADD COLUMN remote_user_id TEXT`);
  }

  const hasFirstName = athleteInfo.some((col) => col.name === 'first_name');
  if (!hasFirstName) {
    await db.execAsync(`ALTER TABLE athletes ADD COLUMN first_name TEXT`);
  }

  const hasLastName = athleteInfo.some((col) => col.name === 'last_name');
  if (!hasLastName) {
    await db.execAsync(`ALTER TABLE athletes ADD COLUMN last_name TEXT`);
  }

  const hasEmail = athleteInfo.some((col) => col.name === 'email');
  if (!hasEmail) {
    await db.execAsync(`ALTER TABLE athletes ADD COLUMN email TEXT`);
  }

  const hasPhone = athleteInfo.some((col) => col.name === 'phone');
  if (!hasPhone) {
    await db.execAsync(`ALTER TABLE athletes ADD COLUMN phone TEXT`);
  }

  const hasAge = athleteInfo.some((col) => col.name === 'age');
  if (!hasAge) {
    await db.execAsync(`ALTER TABLE athletes ADD COLUMN age INTEGER`);
  }

  const hasGrade = athleteInfo.some((col) => col.name === 'grade');
  if (!hasGrade) {
    await db.execAsync(`ALTER TABLE athletes ADD COLUMN grade TEXT`);
  }

  // Add template_id to workouts table
  const workoutInfo = await db.getAllAsync<{ name: string }>(
    `PRAGMA table_info(workouts)`
  );
  const hasTemplateId = workoutInfo.some((col) => col.name === 'template_id');
  if (!hasTemplateId) {
    await db.execAsync(`ALTER TABLE workouts ADD COLUMN template_id TEXT`);
  }

  // Add step metadata columns to splits table
  const splitInfo = await db.getAllAsync<{ name: string }>(
    `PRAGMA table_info(splits)`
  );
  const hasStepType = splitInfo.some((col) => col.name === 'step_type');
  if (!hasStepType) {
    await db.execAsync(`ALTER TABLE splits ADD COLUMN step_type TEXT`);
    await db.execAsync(`ALTER TABLE splits ADD COLUMN step_distance_value REAL`);
    await db.execAsync(`ALTER TABLE splits ADD COLUMN step_distance_unit TEXT`);
    await db.execAsync(`ALTER TABLE splits ADD COLUMN step_label TEXT`);
  }

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schedule_events (
      id TEXT PRIMARY KEY NOT NULL,
      team_id TEXT NOT NULL,
      type TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      starts_at INTEGER NOT NULL,
      ends_at INTEGER,
      location TEXT,
      location_latitude REAL,
      location_longitude REAL,
      notes TEXT,
      is_recurring INTEGER NOT NULL DEFAULT 0,
      recurrence_days TEXT NOT NULL DEFAULT '',
      recurrence_ends_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schedule_event_overrides (
      id TEXT PRIMARY KEY NOT NULL,
      event_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      occurrence_starts_at INTEGER NOT NULL,
      type TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      starts_at INTEGER NOT NULL,
      ends_at INTEGER,
      location TEXT,
      location_latitude REAL,
      location_longitude REAL,
      notes TEXT,
      is_cancelled INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  const scheduleInfo = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(schedule_events)`);
  const hasScheduleCategory = scheduleInfo.some((col) => col.name === 'category');
  if (!hasScheduleCategory) {
    await db.execAsync(`ALTER TABLE schedule_events ADD COLUMN category TEXT NOT NULL DEFAULT ''`);
  }
  const hasScheduleLatitude = scheduleInfo.some((col) => col.name === 'location_latitude');
  if (!hasScheduleLatitude) {
    await db.execAsync(`ALTER TABLE schedule_events ADD COLUMN location_latitude REAL`);
  }
  const hasScheduleLongitude = scheduleInfo.some((col) => col.name === 'location_longitude');
  if (!hasScheduleLongitude) {
    await db.execAsync(`ALTER TABLE schedule_events ADD COLUMN location_longitude REAL`);
  }
  const hasScheduleRecurrenceEnd = scheduleInfo.some((col) => col.name === 'recurrence_ends_at');
  if (!hasScheduleRecurrenceEnd) {
    await db.execAsync(`ALTER TABLE schedule_events ADD COLUMN recurrence_ends_at INTEGER`);
  }

  const scheduleOverrideInfo = await db.getAllAsync<{ name: string }>(
    `PRAGMA table_info(schedule_event_overrides)`
  );
  const hasOverrideCategory = scheduleOverrideInfo.some((col) => col.name === 'category');
  if (!hasOverrideCategory) {
    await db.execAsync(
      `ALTER TABLE schedule_event_overrides ADD COLUMN category TEXT NOT NULL DEFAULT ''`
    );
  }
  const hasOverrideLatitude = scheduleOverrideInfo.some((col) => col.name === 'location_latitude');
  if (!hasOverrideLatitude) {
    await db.execAsync(`ALTER TABLE schedule_event_overrides ADD COLUMN location_latitude REAL`);
  }
  const hasOverrideLongitude = scheduleOverrideInfo.some((col) => col.name === 'location_longitude');
  if (!hasOverrideLongitude) {
    await db.execAsync(`ALTER TABLE schedule_event_overrides ADD COLUMN location_longitude REAL`);
  }
}
