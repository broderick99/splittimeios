-- Team attendance tracking for coach roster attendance tab.

CREATE TABLE IF NOT EXISTS team_attendance (
  id TEXT PRIMARY KEY NOT NULL,
  team_id TEXT NOT NULL,
  attendance_date TEXT NOT NULL,
  athlete_user_id TEXT,
  athlete_local_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('present', 'late', 'excused', 'absent')),
  note TEXT,
  marked_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (athlete_user_id IS NOT NULL AND athlete_local_id IS NULL) OR
    (athlete_user_id IS NULL AND athlete_local_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_team_attendance_team_date
ON team_attendance(team_id, attendance_date);

CREATE INDEX IF NOT EXISTS idx_team_attendance_team_date_updated
ON team_attendance(team_id, attendance_date, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_attendance_user_unique
ON team_attendance(team_id, attendance_date, athlete_user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_attendance_local_unique
ON team_attendance(team_id, attendance_date, athlete_local_id);
