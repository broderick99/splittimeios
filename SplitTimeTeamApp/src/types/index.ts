// ============================================================
// Domain Entities (persisted to SQLite)
// ============================================================

export interface Athlete {
  id: string;
  remoteUserId: string | null;
  name: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  age: number | null;
  grade: string | null;
  groupId: string | null;
  photoUri: string | null;
  createdAt: number;
}

export interface Announcement {
  id: string;
  teamId: string;
  title: string;
  body: string;
  authorName: string;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  teamId: string;
  senderUserId: string;
  senderName: string;
  senderRole: 'coach' | 'athlete';
  body: string;
  imageUrl: string | null;
  createdAt: number;
}

export type ScheduleEventType = 'practice' | 'race';

export interface ScheduleEvent {
  id: string;
  teamId: string;
  type: ScheduleEventType;
  category: string;
  title: string;
  startsAt: number;
  endsAt: number | null;
  location: string | null;
  locationLatitude: number | null;
  locationLongitude: number | null;
  notes: string | null;
  isRecurring: boolean;
  recurrenceDays: number[];
  recurrenceEndsAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface ScheduleEventOverride {
  id: string;
  eventId: string;
  teamId: string;
  occurrenceStartsAt: number;
  type: ScheduleEventType;
  category: string;
  title: string;
  startsAt: number;
  endsAt: number | null;
  location: string | null;
  locationLatitude: number | null;
  locationLongitude: number | null;
  notes: string | null;
  isCancelled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ScheduleOccurrence {
  id: string;
  eventId: string;
  type: ScheduleEventType;
  category: string;
  title: string;
  startsAt: number;
  endsAt: number | null;
  location: string | null;
  locationLatitude: number | null;
  locationLongitude: number | null;
  notes: string | null;
  isRecurring: boolean;
}

export interface Group {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
}

export interface Workout {
  id: string;
  name: string;
  date: number;
  status: WorkoutStatus;
  templateId: string | null;
}

export type WorkoutStatus = 'active' | 'completed';

export interface WorkoutAthlete {
  workoutId: string;
  athleteId: string;
  groupId: string | null;
  athleteName: string;
  groupName: string | null;
  groupColor: string | null;
}

export interface Split {
  id: string;
  workoutId: string;
  athleteId: string;
  splitNumber: number;
  elapsedMs: number;
  timestamp: number;
  isFinal: boolean;
  stepType: TemplateStepType | null;
  stepDistanceValue: number | null;
  stepDistanceUnit: DistanceUnit | null;
  stepLabel: string | null;
}

// ============================================================
// Runtime State (in-memory during active workout)
// ============================================================

export interface AthleteTimerState {
  athleteId: string;
  athleteName: string;
  photoUri: string | null;
  groupId: string | null;
  groupName: string | null;
  groupColor: string | null;
  status: TimerStatus;
  startedAt: number | null;
  stoppedAt: number | null;
  splits: RuntimeSplit[];
}

export type TimerStatus = 'idle' | 'running' | 'stopped';

export interface RuntimeSplit {
  splitNumber: number;
  elapsedMs: number;
  timestamp: number;
  isFinal: boolean;
  isRecoveryEnd?: boolean;
}

// ============================================================
// Grouped view helpers
// ============================================================

export interface GroupTimerBlock {
  groupId: string | null;
  groupName: string;
  groupColor: string;
  athletes: AthleteTimerState[];
  groupStatus: TimerStatus;
  groupStartedAt: number | null;
  groupStoppedAt: number | null;
}

// ============================================================
// History view
// ============================================================

export interface WorkoutSummary {
  id: string;
  name: string;
  date: number;
  athleteCount: number;
  status: WorkoutStatus;
}

export interface WorkoutDetail {
  workout: Workout;
  athletes: WorkoutAthleteResult[];
}

export interface WorkoutAthleteResult {
  athleteId: string;
  athleteName: string;
  groupName: string | null;
  groupColor: string | null;
  splits: Split[];
  totalTimeMs: number | null;
}

// ============================================================
// Workout Templates (persisted to SQLite)
// ============================================================

export type DistanceUnit = 'm' | 'mi' | 'km';
export type TemplateStepType = 'work' | 'recovery';

export interface WorkoutTemplate {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface TemplateRepeatGroup {
  id: string;
  templateId: string;
  repeatCount: number;
  sortOrder: number;
}

export interface TemplateStep {
  id: string;
  templateId: string;
  sortOrder: number;
  type: TemplateStepType;
  distanceValue: number | null;
  distanceUnit: DistanceUnit | null;
  durationMs: number | null;
  label: string;
  repeatGroupId: string | null;
}

// ============================================================
// Template Builder (in-memory editing state)
// ============================================================

export interface BuilderStep {
  id: string;
  type: TemplateStepType;
  distanceValue: number | null;
  distanceUnit: DistanceUnit | null;
  durationMs: number | null;
  label: string;
}

export interface BuilderRepeatGroup {
  id: string;
  repeatCount: number;
  steps: BuilderStep[];
}

export type BuilderItem =
  | { kind: 'step'; step: BuilderStep }
  | { kind: 'repeat'; group: BuilderRepeatGroup };

// ============================================================
// Expanded step (runtime — flattened from template)
// ============================================================

export interface ExpandedStep {
  index: number;
  type: TemplateStepType;
  distanceValue: number | null;
  distanceUnit: DistanceUnit | null;
  durationMs: number | null;
  label: string;
  repeatIteration: number | null;
  repeatTotal: number | null;
}

// ============================================================
// Structured workout runtime state (per athlete)
// ============================================================

export type AthleteStepStatus =
  | 'pending'
  | 'active'
  | 'recovery_countdown'
  | 'recovery_waiting'
  | 'completed';

export interface AthleteWorkoutProgress {
  currentStepIndex: number;
  stepStatus: AthleteStepStatus;
  recoveryStartedAt: number | null;
}

// ============================================================
// Template summary (for list view)
// ============================================================

export interface TemplateSummary {
  id: string;
  name: string;
  stepCount: number;
  createdAt: number;
  updatedAt: number;
}
