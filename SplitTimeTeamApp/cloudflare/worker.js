const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'access-control-allow-headers': 'Content-Type, Authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: jsonHeaders,
  });
}

function error(message, status = 400) {
  return json({ error: message }, status);
}

async function sha256Hex(input) {
  const buffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input)
  );
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function hashPassword(password, salt) {
  return sha256Hex(`${salt}:${password}`);
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function normalizeCode(code) {
  return code.trim().toUpperCase();
}

function normalizeSocialProvider(provider) {
  const value = String(provider ?? '')
    .trim()
    .toLowerCase();

  if (value === 'google' || value === 'apple' || value === 'strava') {
    return value;
  }

  return null;
}

function randomNumericCode(length = 6) {
  const size = Math.max(4, Math.min(10, Number(length) || 6));
  const digits = crypto.getRandomValues(new Uint8Array(size));
  let code = '';

  for (let index = 0; index < size; index += 1) {
    code += String(digits[index] % 10);
  }

  return code;
}

function decodeJWTPayload(token) {
  const parts = String(token ?? '').split('.');
  if (parts.length < 2) {
    return null;
  }

  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4 || 4)) % 4);

  try {
    const jsonText = atob(padded);
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function createJoinCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  const bytes = crypto.getRandomValues(new Uint8Array(6));

  for (let i = 0; i < 6; i += 1) {
    code += alphabet[bytes[i] % alphabet.length];
  }

  return code;
}

async function createUniqueJoinCode(env) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = createJoinCode();
    const existing = await env.DB.prepare(
      'SELECT id FROM join_codes WHERE code = ? LIMIT 1'
    )
      .bind(code)
      .first();

    if (!existing) {
      return code;
    }
  }

  throw new Error('Could not generate a unique join code.');
}

async function createSession(env, user) {
  const rawToken = crypto.randomUUID() + crypto.randomUUID().replaceAll('-', '');
  const tokenHash = await sha256Hex(rawToken);
  const sessionId = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO auth_sessions (id, user_id, token_hash)
     VALUES (?, ?, ?)`
  )
    .bind(sessionId, user.id, tokenHash)
    .run();

  return {
    token: rawToken,
    user,
  };
}

async function getPrimaryTeam(env, userId) {
  const row = await env.DB.prepare(
    `SELECT teams.id, teams.name
     FROM team_members
     INNER JOIN teams ON teams.id = team_members.team_id
     WHERE team_members.user_id = ?
     ORDER BY team_members.joined_at ASC
     LIMIT 1`
  )
    .bind(userId)
    .first();

  if (!row) {
    return null;
  }

  const joinCodeRow = await env.DB.prepare(
    `SELECT code
     FROM join_codes
     WHERE team_id = ? AND is_active = 1
     ORDER BY created_at DESC
     LIMIT 1`
  )
    .bind(row.id)
    .first();

  return {
    id: row.id,
    name: row.name,
    joinCode: joinCodeRow?.code ?? null,
  };
}

function mapUser(row) {
  return {
    id: row.id,
    role: row.role,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone ?? null,
    age: row.age ?? null,
    grade: row.grade ?? null,
  };
}

function mapAnnouncement(row) {
  return {
    id: row.id,
    teamId: row.team_id,
    title: row.title,
    body: row.body,
    authorUserId: row.author_user_id,
    authorName: row.author_name,
    createdAt: row.created_at,
  };
}

function mapAnnouncementComment(row) {
  return {
    id: row.id,
    announcementId: row.announcement_id,
    authorUserId: row.author_user_id,
    authorName: row.author_name,
    body: row.body,
    createdAt: row.created_at,
  };
}

function mapChatMessage(row) {
  return {
    id: row.id,
    teamId: row.team_id,
    senderUserId: row.sender_user_id,
    senderName: row.sender_name,
    senderRole: row.sender_role,
    body: row.body,
    imageUrl: row.image_url ?? null,
    createdAt: row.created_at,
  };
}

function parseRecurrenceDays(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split(',')
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6);
}

function serializeRecurrenceDays(days) {
  if (!Array.isArray(days)) {
    return '';
  }

  return [...new Set(days.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 0 && item <= 6))]
    .sort((left, right) => left - right)
    .join(',');
}

function mapScheduleEvent(row) {
  return {
    id: row.id,
    teamId: row.team_id,
    type: row.type,
    category: row.category ?? '',
    title: row.title,
    startsAt: Number(row.starts_at),
    endsAt: row.ends_at === null ? null : Number(row.ends_at),
    location: row.location ?? null,
    locationLatitude: row.location_latitude === null ? null : Number(row.location_latitude),
    locationLongitude: row.location_longitude === null ? null : Number(row.location_longitude),
    notes: row.notes ?? null,
    isRecurring: Number(row.is_recurring) === 1,
    recurrenceDays: parseRecurrenceDays(row.recurrence_days),
    recurrenceEndsAt:
      row.recurrence_ends_at === null ? null : Number(row.recurrence_ends_at),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function mapScheduleOverride(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    teamId: row.team_id,
    occurrenceStartsAt: Number(row.occurrence_starts_at),
    type: row.type,
    category: row.category ?? '',
    title: row.title,
    startsAt: Number(row.starts_at),
    endsAt: row.ends_at === null ? null : Number(row.ends_at),
    location: row.location ?? null,
    locationLatitude: row.location_latitude === null ? null : Number(row.location_latitude),
    locationLongitude: row.location_longitude === null ? null : Number(row.location_longitude),
    notes: row.notes ?? null,
    isCancelled: Number(row.is_cancelled) === 1,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function parseSchedulePayload(payload) {
  const startsAt = Number(payload.startsAt);
  const endsAt =
    payload.endsAt === null || payload.endsAt === undefined || payload.endsAt === ''
      ? null
      : Number(payload.endsAt);
  const locationLatitude =
    payload.locationLatitude === null || payload.locationLatitude === undefined || payload.locationLatitude === ''
      ? null
      : Number(payload.locationLatitude);
  const locationLongitude =
    payload.locationLongitude === null || payload.locationLongitude === undefined || payload.locationLongitude === ''
      ? null
      : Number(payload.locationLongitude);

  const normalized = {
    type: payload.type === 'race' ? 'race' : payload.type === 'practice' ? 'practice' : null,
    category: String(payload.category ?? '').trim(),
    title: String(payload.title ?? '').trim(),
    startsAt,
    endsAt,
    location: String(payload.location ?? '').trim() || null,
    locationLatitude,
    locationLongitude,
    notes: String(payload.notes ?? '').trim() || null,
    isRecurring: Boolean(payload.isRecurring),
    recurrenceDays: Array.isArray(payload.recurrenceDays) ? payload.recurrenceDays : [],
    recurrenceEndsAt:
      payload.recurrenceEndsAt === null ||
      payload.recurrenceEndsAt === undefined ||
      payload.recurrenceEndsAt === ''
        ? null
        : Number(payload.recurrenceEndsAt),
  };

  if (!normalized.type) {
    throw new Error('Event type is required.');
  }

  if (!normalized.title) {
    throw new Error('Event title is required.');
  }

  if (!Number.isFinite(normalized.startsAt)) {
    throw new Error('Start time is required.');
  }

  if (normalized.endsAt !== null && !Number.isFinite(normalized.endsAt)) {
    throw new Error('End time is invalid.');
  }

  if (normalized.endsAt !== null && normalized.endsAt <= normalized.startsAt) {
    throw new Error('End time must be after start time.');
  }

  if (normalized.locationLatitude !== null && !Number.isFinite(normalized.locationLatitude)) {
    throw new Error('Location latitude is invalid.');
  }

  if (normalized.locationLongitude !== null && !Number.isFinite(normalized.locationLongitude)) {
    throw new Error('Location longitude is invalid.');
  }

  if (normalized.recurrenceEndsAt !== null && !Number.isFinite(normalized.recurrenceEndsAt)) {
    throw new Error('Repeat until date is invalid.');
  }

  return normalized;
}

async function requireAuthenticatedTeam(env, request) {
  const auth = await getAuthenticatedUser(env, request);

  if (auth.error) {
    return { error: auth.error, status: auth.status };
  }

  const currentUser = mapUser(auth.row);
  const team = await getPrimaryTeam(env, currentUser.id);

  if (!team) {
    return { error: 'Team not found.', status: 404 };
  }

  return { currentUser, team };
}

function sqlPlaceholders(count) {
  return new Array(count).fill('?').join(', ');
}

function normalizeGroupColorHex(value) {
  const raw = String(value ?? '')
    .trim()
    .replace(/^#/, '')
    .toUpperCase();

  if (/^[0-9A-F]{6}$/.test(raw)) {
    return raw;
  }

  return '3B82F6';
}

function normalizeOptionalText(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

function normalizeOptionalInt(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.round(parsed);
}

function normalizeCreatedAt(value) {
  if (!value && value !== 0) {
    return new Date().toISOString();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    return new Date(millis).toISOString();
  }

  const parsed = Date.parse(String(value));
  if (Number.isFinite(parsed)) {
    return new Date(parsed).toISOString();
  }

  return new Date().toISOString();
}

function normalizeOptionalTimestamp(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    return new Date(millis).toISOString();
  }

  const parsed = Date.parse(String(value));
  if (Number.isFinite(parsed)) {
    return new Date(parsed).toISOString();
  }

  return null;
}

function normalizeRequiredTimestamp(value, fallback = new Date().toISOString()) {
  return normalizeOptionalTimestamp(value) ?? fallback;
}

function normalizeOptionalNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeAttendanceDate(value, fallback = new Date().toISOString().slice(0, 10)) {
  const raw = String(value ?? '')
    .trim()
    .slice(0, 10);

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  return fallback;
}

function normalizeAttendanceMonth(value) {
  const raw = String(value ?? '')
    .trim()
    .slice(0, 7);

  if (/^\d{4}-\d{2}$/.test(raw)) {
    return raw;
  }

  return null;
}

function attendanceMonthBounds(monthValue) {
  const [yearToken, monthToken] = String(monthValue ?? '').split('-');
  const year = Number(yearToken);
  const month = Number(monthToken);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  const startDate = `${yearToken}-${monthToken}-01`;
  const nextMonthStart = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);

  return { startDate, nextMonthStart };
}

function normalizeNameKey(value) {
  const normalized = String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
  return normalized || null;
}

function normalizeEmailKey(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  return normalized || null;
}

function normalizePhoneKey(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits || null;
}

function composeFullName(firstName, lastName) {
  return `${String(firstName ?? '').trim()} ${String(lastName ?? '').trim()}`.trim();
}

function distanceUnitToMeters(unit) {
  const normalized = String(unit ?? '')
    .trim()
    .toLowerCase();

  if (normalized === 'km') return 1000;
  if (normalized === 'mi') return 1609.344;
  if (normalized === 'm') return 1;
  return null;
}

function mapTeamGroup(row) {
  return {
    id: row.id,
    name: row.name,
    colorHex: row.color_hex ?? '3B82F6',
    sortOrder: Number(row.sort_order ?? 0),
  };
}

function mapAttendanceRecord(row) {
  return {
    id: row.id,
    date: row.attendance_date,
    athleteUserId: row.athlete_user_id ?? null,
    athleteLocalId: row.athlete_local_id ?? null,
    status: row.status,
    note: row.note ?? null,
    markedByUserId: row.marked_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTeamAthleteFromUserRow(row) {
  const firstName = row.first_name ?? '';
  const lastName = row.last_name ?? '';
  const displayName = `${firstName} ${lastName}`.trim() || row.email || 'Athlete';

  return {
    id: row.id,
    remoteUserId: row.id,
    name: displayName,
    firstName: firstName || null,
    lastName: lastName || null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    age: row.age ?? null,
    grade: row.grade ?? null,
    groupId: row.group_id ?? null,
    photoUrl: null,
    createdAt: row.joined_at ?? new Date().toISOString(),
  };
}

function mapTeamAthleteFromProfileRow(row) {
  const firstName = row.first_name ?? '';
  const lastName = row.last_name ?? '';
  const displayName = (row.name ?? `${firstName} ${lastName}`.trim()) || row.email || 'Athlete';

  return {
    id: row.id,
    remoteUserId: null,
    name: displayName,
    firstName: firstName || null,
    lastName: lastName || null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    age: row.age ?? null,
    grade: row.grade ?? null,
    groupId: row.group_id ?? null,
    photoUrl: row.photo_url ?? null,
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

async function loadTeamStateSnapshot(env, teamId) {
  const [groupsResult, userAthletesResult, managedAthletesResult] = await Promise.all([
    env.DB.prepare(
      `SELECT id, name, color_hex, sort_order
       FROM team_groups
       WHERE team_id = ?
       ORDER BY sort_order ASC, lower(name) ASC`
    )
      .bind(teamId)
      .all(),
    env.DB.prepare(
      `SELECT users.id, users.first_name, users.last_name, users.email, users.phone, users.age, users.grade,
              team_members.group_id, team_members.joined_at
       FROM team_members
       INNER JOIN users ON users.id = team_members.user_id
       WHERE team_members.team_id = ? AND team_members.role = 'athlete'
       ORDER BY lower(users.last_name) ASC, lower(users.first_name) ASC`
    )
      .bind(teamId)
      .all(),
    env.DB.prepare(
      `SELECT id, team_id, name, first_name, last_name, email, phone, age, grade, group_id, photo_url, created_at
       FROM team_athletes
       WHERE team_id = ?
       ORDER BY lower(name) ASC, created_at ASC`
    )
      .bind(teamId)
      .all(),
  ]);

  return {
    groups: (groupsResult.results ?? []).map(mapTeamGroup),
    athletes: [
      ...(userAthletesResult.results ?? []).map(mapTeamAthleteFromUserRow),
      ...(managedAthletesResult.results ?? []).map(mapTeamAthleteFromProfileRow),
    ],
  };
}

function mapTemplateLibraryTemplate(row) {
  return {
    id: row.id,
    name: row.name,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
  };
}

function mapTemplateLibraryRepeatGroup(row) {
  return {
    id: row.id,
    templateId: row.template_id,
    repeatCount: Number(row.repeat_count ?? 1),
    sortOrder: Number(row.sort_order ?? 0),
  };
}

function mapTemplateLibraryStep(row) {
  return {
    id: row.id,
    templateId: row.template_id,
    sortOrder: Number(row.sort_order ?? 0),
    type: row.type === 'recovery' ? 'recovery' : 'work',
    distanceValue: row.distance_value === null ? null : Number(row.distance_value),
    distanceUnit: row.distance_unit ?? null,
    durationMilliseconds: row.duration_ms === null ? null : Number(row.duration_ms),
    label: String(row.label ?? ''),
    repeatGroupId: row.repeat_group_id ?? null,
  };
}

async function loadTemplateLibrarySnapshot(env, teamId) {
  const [templatesResult, repeatGroupsResult, stepsResult] = await Promise.all([
    env.DB.prepare(
      `SELECT id, name, created_at, updated_at
       FROM team_templates
       WHERE team_id = ?
       ORDER BY datetime(updated_at) DESC, lower(name) ASC`
    )
      .bind(teamId)
      .all(),
    env.DB.prepare(
      `SELECT id, template_id, repeat_count, sort_order
       FROM team_template_repeat_groups
       WHERE team_id = ?
       ORDER BY template_id ASC, sort_order ASC`
    )
      .bind(teamId)
      .all(),
    env.DB.prepare(
      `SELECT id, template_id, sort_order, type, distance_value, distance_unit, duration_ms, label, repeat_group_id
       FROM team_template_steps
       WHERE team_id = ?
       ORDER BY template_id ASC, repeat_group_id IS NOT NULL ASC, repeat_group_id ASC, sort_order ASC`
    )
      .bind(teamId)
      .all(),
  ]);

  return {
    templates: (templatesResult.results ?? []).map(mapTemplateLibraryTemplate),
    repeatGroups: (repeatGroupsResult.results ?? []).map(mapTemplateLibraryRepeatGroup),
    steps: (stepsResult.results ?? []).map(mapTemplateLibraryStep),
  };
}

function normalizeTemplateLibraryPayload(payload) {
  const templatesRaw = Array.isArray(payload?.templates) ? payload.templates : [];
  const repeatGroupsRaw = Array.isArray(payload?.repeatGroups) ? payload.repeatGroups : [];
  const stepsRaw = Array.isArray(payload?.steps) ? payload.steps : [];

  const templates = [];
  const seenTemplateIDs = new Set();

  for (const rawTemplate of templatesRaw) {
    const name = String(rawTemplate?.name ?? '').trim();
    if (!name) continue;

    let id = String(rawTemplate?.id ?? '').trim();
    if (!id || seenTemplateIDs.has(id)) {
      id = crypto.randomUUID();
    }

    seenTemplateIDs.add(id);
    const createdAt = normalizeRequiredTimestamp(rawTemplate?.createdAt);
    templates.push({
      id,
      name,
      createdAt,
      updatedAt: normalizeRequiredTimestamp(rawTemplate?.updatedAt, createdAt),
    });
  }

  const validTemplateIDs = new Set(templates.map((template) => template.id));
  const repeatGroups = [];
  const seenRepeatGroupIDs = new Set();

  for (let index = 0; index < repeatGroupsRaw.length; index += 1) {
    const rawGroup = repeatGroupsRaw[index] ?? {};
    const templateId = String(rawGroup.templateId ?? '').trim();
    if (!templateId || !validTemplateIDs.has(templateId)) continue;

    let id = String(rawGroup.id ?? '').trim();
    if (!id || seenRepeatGroupIDs.has(id)) {
      id = crypto.randomUUID();
    }

    seenRepeatGroupIDs.add(id);
    const repeatCount = Math.max(1, normalizeOptionalInt(rawGroup.repeatCount) ?? 1);
    const sortOrder = Number.isFinite(Number(rawGroup.sortOrder)) ? Number(rawGroup.sortOrder) : index;
    repeatGroups.push({
      id,
      templateId,
      repeatCount,
      sortOrder,
    });
  }

  const validRepeatGroupIDs = new Set(repeatGroups.map((group) => group.id));
  const steps = [];
  const seenStepIDs = new Set();

  for (let index = 0; index < stepsRaw.length; index += 1) {
    const rawStep = stepsRaw[index] ?? {};
    const templateId = String(rawStep.templateId ?? '').trim();
    if (!templateId || !validTemplateIDs.has(templateId)) continue;

    let id = String(rawStep.id ?? '').trim();
    if (!id || seenStepIDs.has(id)) {
      id = crypto.randomUUID();
    }

    seenStepIDs.add(id);
    const typeRaw = String(rawStep.type ?? '')
      .trim()
      .toLowerCase();
    const type = typeRaw === 'recovery' ? 'recovery' : 'work';
    const repeatGroupIdRaw = String(rawStep.repeatGroupId ?? '').trim();
    const repeatGroupId =
      repeatGroupIdRaw && validRepeatGroupIDs.has(repeatGroupIdRaw) ? repeatGroupIdRaw : null;

    const distanceUnitRaw = String(rawStep.distanceUnit ?? '')
      .trim()
      .toLowerCase();
    const distanceUnit =
      distanceUnitRaw === 'm' || distanceUnitRaw === 'km' || distanceUnitRaw === 'mi'
        ? distanceUnitRaw
        : null;

    steps.push({
      id,
      templateId,
      sortOrder: Number.isFinite(Number(rawStep.sortOrder)) ? Number(rawStep.sortOrder) : index,
      type,
      distanceValue: normalizeOptionalNumber(rawStep.distanceValue),
      distanceUnit,
      durationMilliseconds: normalizeOptionalInt(rawStep.durationMilliseconds),
      label: String(rawStep.label ?? ''),
      repeatGroupId,
    });
  }

  return {
    templates,
    repeatGroups,
    steps,
  };
}

async function listTeamState(env, request) {
  const auth = await requireAuthenticatedTeam(env, request);

  if (auth.error) {
    return error(auth.error, auth.status);
  }

  const snapshot = await loadTeamStateSnapshot(env, auth.team.id);
  return json(snapshot);
}

async function listTemplateLibrary(env, request) {
  const auth = await requireAuthenticatedTeam(env, request);
  if (auth.error) return error(auth.error, auth.status);

  const snapshot = await loadTemplateLibrarySnapshot(env, auth.team.id);
  return json(snapshot);
}

async function syncTemplateLibrary(env, request) {
  const auth = await requireAuthenticatedTeam(env, request);
  if (auth.error) return error(auth.error, auth.status);
  if (auth.currentUser.role !== 'coach') {
    return error('Only coaches can sync templates.', 403);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return error('Invalid JSON payload.');
  }

  const normalized = normalizeTemplateLibraryPayload(payload);

  await env.DB.batch([
    env.DB.prepare(`DELETE FROM team_template_steps WHERE team_id = ?`).bind(auth.team.id),
    env.DB.prepare(`DELETE FROM team_template_repeat_groups WHERE team_id = ?`).bind(auth.team.id),
    env.DB.prepare(`DELETE FROM team_templates WHERE team_id = ?`).bind(auth.team.id),
  ]);

  for (const template of normalized.templates) {
    await env.DB.prepare(
      `INSERT INTO team_templates (
        id, team_id, name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?)`
    )
      .bind(template.id, auth.team.id, template.name, template.createdAt, template.updatedAt)
      .run();
  }

  for (const group of normalized.repeatGroups) {
    await env.DB.prepare(
      `INSERT INTO team_template_repeat_groups (
        id, team_id, template_id, repeat_count, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        group.id,
        auth.team.id,
        group.templateId,
        group.repeatCount,
        group.sortOrder,
        new Date().toISOString(),
        new Date().toISOString()
      )
      .run();
  }

  for (const step of normalized.steps) {
    await env.DB.prepare(
      `INSERT INTO team_template_steps (
        id, team_id, template_id, sort_order, type, distance_value, distance_unit, duration_ms, label, repeat_group_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        step.id,
        auth.team.id,
        step.templateId,
        step.sortOrder,
        step.type,
        step.distanceValue,
        step.distanceUnit,
        step.durationMilliseconds,
        step.label,
        step.repeatGroupId,
        new Date().toISOString(),
        new Date().toISOString()
      )
      .run();
  }

  const snapshot = await loadTemplateLibrarySnapshot(env, auth.team.id);
  return json(snapshot);
}

async function syncTeamState(env, request) {
  const auth = await requireAuthenticatedTeam(env, request);

  if (auth.error) {
    return error(auth.error, auth.status);
  }

  if (auth.currentUser.role !== 'coach') {
    return error('Only coaches can sync team data.', 403);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return error('Invalid JSON payload.');
  }

  const incomingGroupsRaw = Array.isArray(payload.groups) ? payload.groups : [];
  const incomingAthletesRaw = Array.isArray(payload.athletes) ? payload.athletes : [];

  const normalizedGroups = [];
  const seenGroupIds = new Set();

  for (let index = 0; index < incomingGroupsRaw.length; index += 1) {
    const raw = incomingGroupsRaw[index] ?? {};
    const name = String(raw.name ?? '').trim();
    if (!name) continue;

    let id = String(raw.id ?? '').trim();
    if (!id || seenGroupIds.has(id)) {
      id = crypto.randomUUID();
    }

    seenGroupIds.add(id);
    normalizedGroups.push({
      id,
      name,
      colorHex: normalizeGroupColorHex(raw.colorHex),
      sortOrder: Number.isFinite(Number(raw.sortOrder)) ? Number(raw.sortOrder) : index,
    });
  }

  const existingGroupRows = await env.DB.prepare(
    `SELECT id FROM team_groups WHERE team_id = ?`
  )
    .bind(auth.team.id)
    .all();
  const existingGroupIDs = new Set((existingGroupRows.results ?? []).map((row) => row.id));
  const nextGroupIDs = new Set(normalizedGroups.map((group) => group.id));
  const deletedGroupIDs = [...existingGroupIDs].filter((groupID) => !nextGroupIDs.has(groupID));

  for (const group of normalizedGroups) {
    await env.DB.prepare(
      `INSERT INTO team_groups (
        id, team_id, name, color_hex, sort_order, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        color_hex = excluded.color_hex,
        sort_order = excluded.sort_order,
        updated_at = excluded.updated_at`
    )
      .bind(
        group.id,
        auth.team.id,
        group.name,
        group.colorHex,
        group.sortOrder,
        new Date().toISOString(),
        new Date().toISOString()
      )
      .run();
  }

  if (deletedGroupIDs.length > 0) {
    const placeholders = sqlPlaceholders(deletedGroupIDs.length);
    await env.DB.prepare(
      `UPDATE team_members
       SET group_id = NULL
       WHERE team_id = ? AND group_id IN (${placeholders})`
    )
      .bind(auth.team.id, ...deletedGroupIDs)
      .run();

    await env.DB.prepare(
      `UPDATE team_athletes
       SET group_id = NULL, updated_at = ?
       WHERE team_id = ? AND group_id IN (${placeholders})`
    )
      .bind(new Date().toISOString(), auth.team.id, ...deletedGroupIDs)
      .run();

    await env.DB.prepare(
      `DELETE FROM team_groups
       WHERE team_id = ? AND id IN (${placeholders})`
    )
      .bind(auth.team.id, ...deletedGroupIDs)
      .run();
  }

  const validGroupIDs = new Set(normalizedGroups.map((group) => group.id));
  const managedAthleteIDs = new Set();

  for (const rawAthlete of incomingAthletesRaw) {
    const remoteUserId = String(rawAthlete?.remoteUserId ?? '').trim() || null;
    const requestedGroupID = String(rawAthlete?.groupId ?? '').trim() || null;
    const groupID = requestedGroupID && validGroupIDs.has(requestedGroupID) ? requestedGroupID : null;

    if (remoteUserId) {
      await env.DB.prepare(
        `UPDATE team_members
         SET group_id = ?
         WHERE team_id = ? AND user_id = ? AND role = 'athlete'`
      )
        .bind(groupID, auth.team.id, remoteUserId)
        .run();
      continue;
    }

    let athleteID = String(rawAthlete?.id ?? '').trim();
    if (!athleteID) {
      athleteID = crypto.randomUUID();
    }

    const name = String(rawAthlete?.name ?? '').trim();
    const firstName = normalizeOptionalText(rawAthlete?.firstName);
    const lastName = normalizeOptionalText(rawAthlete?.lastName);
    const fallbackName = `${firstName ?? ''} ${lastName ?? ''}`.trim();
    const normalizedName = name || fallbackName;

    if (!normalizedName) {
      continue;
    }

    managedAthleteIDs.add(athleteID);

    await env.DB.prepare(
      `INSERT INTO team_athletes (
        id, team_id, name, first_name, last_name, email, phone, age, grade, group_id, photo_url, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        email = excluded.email,
        phone = excluded.phone,
        age = excluded.age,
        grade = excluded.grade,
        group_id = excluded.group_id,
        photo_url = excluded.photo_url,
        updated_at = excluded.updated_at`
    )
      .bind(
        athleteID,
        auth.team.id,
        normalizedName,
        firstName,
        lastName,
        normalizeOptionalText(rawAthlete?.email),
        normalizeOptionalText(rawAthlete?.phone),
        normalizeOptionalInt(rawAthlete?.age),
        normalizeOptionalText(rawAthlete?.grade),
        groupID,
        normalizeOptionalText(rawAthlete?.photoUrl),
        normalizeCreatedAt(rawAthlete?.createdAt),
        new Date().toISOString()
      )
      .run();
  }

  const existingManagedResult = await env.DB.prepare(
    `SELECT id FROM team_athletes WHERE team_id = ?`
  )
    .bind(auth.team.id)
    .all();
  const existingManagedIDs = (existingManagedResult.results ?? []).map((row) => row.id);
  const staleManagedIDs = existingManagedIDs.filter((id) => !managedAthleteIDs.has(id));

  if (staleManagedIDs.length > 0) {
    const placeholders = sqlPlaceholders(staleManagedIDs.length);
    await env.DB.prepare(
      `DELETE FROM team_athletes
       WHERE team_id = ? AND id IN (${placeholders})`
    )
      .bind(auth.team.id, ...staleManagedIDs)
      .run();
  }

  const snapshot = await loadTeamStateSnapshot(env, auth.team.id);
  return json(snapshot);
}

async function listAttendance(env, request) {
  const auth = await requireAuthenticatedTeam(env, request);
  if (auth.error) return error(auth.error, auth.status);
  if (auth.currentUser.role !== 'coach') {
    return error('Only coaches can view attendance.', 403);
  }

  const url = new URL(request.url);
  const month = normalizeAttendanceMonth(url.searchParams.get('month'));

  if (month) {
    const bounds = attendanceMonthBounds(month);
    if (!bounds) {
      return error('Invalid attendance month.');
    }

    const result = await env.DB.prepare(
      `SELECT id, attendance_date, athlete_user_id, athlete_local_id, status, note,
              marked_by_user_id, created_at, updated_at
       FROM team_attendance
       WHERE team_id = ?
         AND attendance_date >= ?
         AND attendance_date < ?
       ORDER BY attendance_date ASC, datetime(updated_at) DESC, id ASC`
    )
      .bind(auth.team.id, bounds.startDate, bounds.nextMonthStart)
      .all();

    return json({
      month,
      records: (result.results ?? []).map(mapAttendanceRecord),
    });
  }

  const date = normalizeAttendanceDate(url.searchParams.get('date'));

  const result = await env.DB.prepare(
    `SELECT id, attendance_date, athlete_user_id, athlete_local_id, status, note,
            marked_by_user_id, created_at, updated_at
     FROM team_attendance
     WHERE team_id = ? AND attendance_date = ?
     ORDER BY datetime(updated_at) DESC, id ASC`
  )
    .bind(auth.team.id, date)
    .all();

  return json({
    date,
    records: (result.results ?? []).map(mapAttendanceRecord),
  });
}

async function markAttendance(env, request) {
  const auth = await requireAuthenticatedTeam(env, request);
  if (auth.error) return error(auth.error, auth.status);
  if (auth.currentUser.role !== 'coach') {
    return error('Only coaches can update attendance.', 403);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return error('Invalid JSON payload.');
  }

  const date = normalizeAttendanceDate(payload?.date);
  const athleteUserId = normalizeOptionalText(payload?.athleteUserId);
  const athleteLocalId = normalizeOptionalText(payload?.athleteLocalId);
  const note = normalizeOptionalText(payload?.note);
  const statusRaw = String(payload?.status ?? '')
    .trim()
    .toLowerCase();
  const status =
    statusRaw === 'present' || statusRaw === 'late' || statusRaw === 'excused' || statusRaw === 'absent'
      ? statusRaw
      : null;

  if (!athleteUserId && !athleteLocalId) {
    return error('Athlete id is required.');
  }

  if (athleteUserId) {
    const member = await env.DB.prepare(
      `SELECT user_id
       FROM team_members
       WHERE team_id = ? AND user_id = ? AND role = 'athlete'
       LIMIT 1`
    )
      .bind(auth.team.id, athleteUserId)
      .first();

    if (!member) {
      return error('Athlete not found.', 404);
    }
  } else if (athleteLocalId) {
    const managed = await env.DB.prepare(
      `SELECT id
       FROM team_athletes
       WHERE team_id = ? AND id = ?
       LIMIT 1`
    )
      .bind(auth.team.id, athleteLocalId)
      .first();

    if (!managed) {
      return error('Athlete not found.', 404);
    }
  }

  if (!status) {
    if (athleteUserId) {
      await env.DB.prepare(
        `DELETE FROM team_attendance
         WHERE team_id = ? AND attendance_date = ? AND athlete_user_id = ?`
      )
        .bind(auth.team.id, date, athleteUserId)
        .run();
    } else {
      await env.DB.prepare(
        `DELETE FROM team_attendance
         WHERE team_id = ? AND attendance_date = ? AND athlete_local_id = ?`
      )
        .bind(auth.team.id, date, athleteLocalId)
        .run();
    }

    return json({ deleted: true, record: null });
  }

  const nowISO = new Date().toISOString();
  const id = crypto.randomUUID();

  if (athleteUserId) {
    await env.DB.prepare(
      `INSERT INTO team_attendance (
         id, team_id, attendance_date, athlete_user_id, athlete_local_id, status, note,
         marked_by_user_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)
       ON CONFLICT(team_id, attendance_date, athlete_user_id) DO UPDATE SET
         status = excluded.status,
         note = excluded.note,
         marked_by_user_id = excluded.marked_by_user_id,
         updated_at = excluded.updated_at`
    )
      .bind(
        id,
        auth.team.id,
        date,
        athleteUserId,
        status,
        note,
        auth.currentUser.id,
        nowISO,
        nowISO
      )
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO team_attendance (
         id, team_id, attendance_date, athlete_user_id, athlete_local_id, status, note,
         marked_by_user_id, created_at, updated_at
       ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(team_id, attendance_date, athlete_local_id) DO UPDATE SET
         status = excluded.status,
         note = excluded.note,
         marked_by_user_id = excluded.marked_by_user_id,
         updated_at = excluded.updated_at`
    )
      .bind(
        id,
        auth.team.id,
        date,
        athleteLocalId,
        status,
        note,
        auth.currentUser.id,
        nowISO,
        nowISO
      )
      .run();
  }

  const saved = await env.DB.prepare(
    `SELECT id, attendance_date, athlete_user_id, athlete_local_id, status, note,
            marked_by_user_id, created_at, updated_at
     FROM team_attendance
     WHERE team_id = ?
       AND attendance_date = ?
       AND (
         (? IS NOT NULL AND athlete_user_id = ?)
         OR
         (? IS NOT NULL AND athlete_local_id = ?)
       )
     LIMIT 1`
  )
    .bind(auth.team.id, date, athleteUserId, athleteUserId, athleteLocalId, athleteLocalId)
    .first();

  return json({
    deleted: false,
    record: saved ? mapAttendanceRecord(saved) : null,
  });
}

async function getTeamBranding(env, request) {
  const auth = await requireAuthenticatedTeam(env, request);
  if (auth.error) return error(auth.error, auth.status);

  const row = await env.DB.prepare(
    `SELECT logo_base64
     FROM teams
     WHERE id = ?
     LIMIT 1`
  )
    .bind(auth.team.id)
    .first();

  return json({
    logoBase64: row?.logo_base64 ?? null,
  });
}

async function updateTeamBranding(env, request) {
  const auth = await requireAuthenticatedTeam(env, request);
  if (auth.error) return error(auth.error, auth.status);
  if (auth.currentUser.role !== 'coach') {
    return error('Only coaches can update team branding.', 403);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return error('Invalid JSON payload.');
  }

  const rawLogo = payload?.logoBase64;
  let logoBase64 = null;
  if (typeof rawLogo === 'string') {
    const trimmed = rawLogo.trim();
    if (trimmed) {
      logoBase64 = trimmed;
    }
  }

  if (logoBase64 && logoBase64.length > 2_000_000) {
    return error('Logo image is too large.', 413);
  }

  await env.DB.prepare(
    `UPDATE teams
     SET logo_base64 = ?
     WHERE id = ?`
  )
    .bind(logoBase64, auth.team.id)
    .run();

  return json({ logoBase64 });
}

function normalizeCompletedWorkoutPayload(payload) {
  const id = String(payload?.id ?? '').trim();
  const name = String(payload?.name ?? '').trim() || 'Workout';
  const workoutAt = normalizeOptionalTimestamp(payload?.workoutAt);
  const templateId = normalizeOptionalText(payload?.templateId);
  const athletesRaw = Array.isArray(payload?.athletes) ? payload.athletes : [];

  if (!id) {
    throw new Error('Workout id is required.');
  }

  if (!workoutAt) {
    throw new Error('Workout date is required.');
  }

  const athletes = athletesRaw
    .map((rawAthlete) => {
      const athleteId = String(rawAthlete?.athleteId ?? '').trim();
      const athleteUserId = normalizeOptionalText(rawAthlete?.athleteUserId);
      const athleteEmail = normalizeOptionalText(rawAthlete?.athleteEmail);
      const athletePhone = normalizeOptionalText(rawAthlete?.athletePhone);
      const athleteName = String(rawAthlete?.athleteName ?? '').trim();
      const groupId = normalizeOptionalText(rawAthlete?.groupId);
      const groupName = normalizeOptionalText(rawAthlete?.groupName);
      const groupColorHex = normalizeOptionalText(rawAthlete?.groupColorHex);
      const startedAt = normalizeOptionalTimestamp(rawAthlete?.startedAt);
      const stoppedAt = normalizeOptionalTimestamp(rawAthlete?.stoppedAt);
      const rawTotalElapsed = normalizeOptionalInt(rawAthlete?.totalElapsedMilliseconds);
      const splitsRaw = Array.isArray(rawAthlete?.splits) ? rawAthlete.splits : [];

      if (!athleteId || !athleteName) {
        return null;
      }

      const splits = splitsRaw
        .map((rawSplit, index) => {
          const splitNumber = normalizeOptionalInt(rawSplit?.splitNumber) ?? index + 1;
          const elapsedMilliseconds = Math.max(0, normalizeOptionalInt(rawSplit?.elapsedMilliseconds) ?? 0);
          const timestamp = normalizeRequiredTimestamp(rawSplit?.timestamp, workoutAt);
          const isFinal = Boolean(rawSplit?.isFinal);
          const stepTypeRaw = String(rawSplit?.stepType ?? '')
            .trim()
            .toLowerCase();
          const stepType = stepTypeRaw === 'work' || stepTypeRaw === 'recovery' ? stepTypeRaw : null;
          const stepDistanceValue = normalizeOptionalNumber(rawSplit?.stepDistanceValue);
          const stepDistanceUnitRaw = String(rawSplit?.stepDistanceUnit ?? '')
            .trim()
            .toLowerCase();
          const stepDistanceUnit =
            stepDistanceUnitRaw === 'm' || stepDistanceUnitRaw === 'km' || stepDistanceUnitRaw === 'mi'
              ? stepDistanceUnitRaw
              : null;

          return {
            splitNumber,
            elapsedMilliseconds,
            timestamp,
            isFinal,
            stepType,
            stepDistanceValue,
            stepDistanceUnit,
            stepLabel: normalizeOptionalText(rawSplit?.stepLabel),
          };
        })
        .sort((left, right) => left.splitNumber - right.splitNumber);

      const derivedElapsed = splits.reduce((maxElapsed, split) => Math.max(maxElapsed, split.elapsedMilliseconds), 0);

      return {
        athleteId,
        athleteUserId,
        athleteEmail,
        athletePhone,
        athleteName,
        groupId,
        groupName,
        groupColorHex,
        startedAt,
        stoppedAt,
        totalElapsedMilliseconds: rawTotalElapsed ?? (derivedElapsed > 0 ? derivedElapsed : null),
        splits,
      };
    })
    .filter(Boolean);

  return {
    id,
    name,
    workoutAt,
    templateId,
    athletes,
  };
}

function workoutDistanceMetersFromSplits(splits) {
  return splits.reduce((total, split) => {
    if (split.stepType === 'recovery') {
      return total;
    }
    if (split.stepDistanceValue === null || split.stepDistanceUnit === null) {
      return total;
    }
    const multiplier = distanceUnitToMeters(split.stepDistanceUnit);
    if (!multiplier) {
      return total;
    }
    return total + split.stepDistanceValue * multiplier;
  }, 0);
}

async function uploadCompletedWorkout(env, request) {
  const auth = await requireAuthenticatedTeam(env, request);
  if (auth.error) return error(auth.error, auth.status);
  if (auth.currentUser.role !== 'coach') {
    return error('Only coaches can save completed workouts.', 403);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return error('Invalid JSON payload.');
  }

  let workout;
  try {
    workout = normalizeCompletedWorkoutPayload(payload);
  } catch (err) {
    return error(err instanceof Error ? err.message : 'Invalid workout payload.');
  }

  const existingWorkout = await env.DB.prepare(
    `SELECT team_id
     FROM team_workouts
     WHERE id = ?
     LIMIT 1`
  )
    .bind(workout.id)
    .first();

  if (existingWorkout && existingWorkout.team_id !== auth.team.id) {
    return error('Workout id already belongs to a different team.', 403);
  }

  const athleteUserRows = await env.DB.prepare(
    `SELECT team_members.user_id, users.first_name, users.last_name, users.email, users.phone
     FROM team_members
     INNER JOIN users ON users.id = team_members.user_id
     WHERE team_members.team_id = ? AND team_members.role = 'athlete'`
  )
    .bind(auth.team.id)
    .all();
  const validAthleteUserIds = new Set();
  const athleteUserIdsByName = new Map();
  const athleteUserIdsByEmail = new Map();
  const athleteUserIdsByPhone = new Map();

  for (const row of athleteUserRows.results ?? []) {
    const userId = String(row.user_id ?? '').trim();
    if (!userId) continue;
    validAthleteUserIds.add(userId);

    const nameKey = normalizeNameKey(composeFullName(row.first_name, row.last_name));
    if (nameKey) {
      const existing = athleteUserIdsByName.get(nameKey) ?? [];
      existing.push(userId);
      athleteUserIdsByName.set(nameKey, existing);
    }

    const emailKey = normalizeEmailKey(row.email);
    if (emailKey) {
      const existingByEmail = athleteUserIdsByEmail.get(emailKey) ?? [];
      existingByEmail.push(userId);
      athleteUserIdsByEmail.set(emailKey, existingByEmail);
    }

    const phoneKey = normalizePhoneKey(row.phone);
    if (phoneKey) {
      const existingByPhone = athleteUserIdsByPhone.get(phoneKey) ?? [];
      existingByPhone.push(userId);
      athleteUserIdsByPhone.set(phoneKey, existingByPhone);
    }
  }

  const nowISO = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO team_workouts (
      id, team_id, name, workout_at, template_id, source, created_by_user_id, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, 'timer', ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      workout_at = excluded.workout_at,
      template_id = excluded.template_id,
      source = excluded.source,
      created_by_user_id = excluded.created_by_user_id,
      updated_at = excluded.updated_at`
  )
    .bind(
      workout.id,
      auth.team.id,
      workout.name,
      workout.workoutAt,
      workout.templateId,
      auth.currentUser.id,
      nowISO,
      nowISO
    )
    .run();

  const existingResultRows = await env.DB.prepare(
    `SELECT id
     FROM team_workout_results
     WHERE workout_id = ? AND team_id = ?`
  )
    .bind(workout.id, auth.team.id)
    .all();
  const existingResultIds = (existingResultRows.results ?? []).map((row) => row.id);

  if (existingResultIds.length > 0) {
    const splitPlaceholders = sqlPlaceholders(existingResultIds.length);
    await env.DB.prepare(
      `DELETE FROM team_workout_splits
       WHERE team_id = ? AND workout_result_id IN (${splitPlaceholders})`
    )
      .bind(auth.team.id, ...existingResultIds)
      .run();
  }

  await env.DB.prepare(
    `DELETE FROM team_workout_results
     WHERE workout_id = ? AND team_id = ?`
  )
    .bind(workout.id, auth.team.id)
    .run();

  let syncedAthletes = 0;
  let feedItemsUpserted = 0;

  for (const athlete of workout.athletes) {
    let athleteUserId = null;
    if (athlete.athleteUserId && validAthleteUserIds.has(athlete.athleteUserId)) {
      athleteUserId = athlete.athleteUserId;
    } else if (athlete.athleteId && validAthleteUserIds.has(athlete.athleteId)) {
      athleteUserId = athlete.athleteId;
    } else {
      const emailKey = normalizeEmailKey(athlete.athleteEmail);
      if (emailKey) {
        const matches = athleteUserIdsByEmail.get(emailKey) ?? [];
        if (matches.length === 1) {
          athleteUserId = matches[0];
        }
      }
    }

    if (!athleteUserId) {
      const phoneKey = normalizePhoneKey(athlete.athletePhone);
      if (phoneKey) {
        const matches = athleteUserIdsByPhone.get(phoneKey) ?? [];
        if (matches.length === 1) {
          athleteUserId = matches[0];
        }
      }
    }

    if (!athleteUserId) {
      const nameKey = normalizeNameKey(athlete.athleteName);
      if (nameKey) {
        const matches = athleteUserIdsByName.get(nameKey) ?? [];
        if (matches.length === 1) {
          athleteUserId = matches[0];
        }
      }
    }

    const resultId = crypto.randomUUID();
    const totalElapsedMilliseconds =
      athlete.totalElapsedMilliseconds !== null && athlete.totalElapsedMilliseconds !== undefined
        ? athlete.totalElapsedMilliseconds
        : null;

    await env.DB.prepare(
      `INSERT INTO team_workout_results (
        id, workout_id, team_id, athlete_local_id, athlete_user_id, athlete_name, group_id, group_name, group_color_hex,
        started_at, stopped_at, total_elapsed_ms, split_count, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        resultId,
        workout.id,
        auth.team.id,
        athlete.athleteId,
        athleteUserId,
        athlete.athleteName,
        athlete.groupId,
        athlete.groupName,
        athlete.groupColorHex,
        athlete.startedAt,
        athlete.stoppedAt,
        totalElapsedMilliseconds,
        athlete.splits.length,
        nowISO
      )
      .run();

    for (const split of athlete.splits) {
      await env.DB.prepare(
        `INSERT INTO team_workout_splits (
          id, workout_result_id, team_id, split_number, elapsed_ms, timestamp, is_final,
          step_type, step_distance_value, step_distance_unit, step_label, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          crypto.randomUUID(),
          resultId,
          auth.team.id,
          split.splitNumber,
          split.elapsedMilliseconds,
          split.timestamp,
          split.isFinal ? 1 : 0,
          split.stepType,
          split.stepDistanceValue,
          split.stepDistanceUnit,
          split.stepLabel,
          nowISO
        )
        .run();
    }

    syncedAthletes += 1;

    if (!athleteUserId) {
      continue;
    }

    const distanceMeters = workoutDistanceMetersFromSplits(athlete.splits);
    const movingSeconds =
      totalElapsedMilliseconds !== null && totalElapsedMilliseconds !== undefined
        ? Math.round(totalElapsedMilliseconds / 1000)
        : null;
    const averageSpeedMps =
      distanceMeters > 0 && movingSeconds && movingSeconds > 0 ? distanceMeters / movingSeconds : null;
    const externalId = `${workout.id}:${athleteUserId}`;
    const startAt = athlete.startedAt ?? athlete.stoppedAt ?? workout.workoutAt;

    await env.DB.prepare(
      `INSERT INTO activity_feed_items (
        id, team_id, user_id, source, external_id, title, activity_type, start_at, distance_m, moving_seconds,
        elapsed_seconds, elevation_gain_m, average_speed_mps, polyline, created_at, updated_at
      ) VALUES (?, ?, ?, 'workout', ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?)
      ON CONFLICT(user_id, source, external_id) DO UPDATE SET
        title = excluded.title,
        activity_type = excluded.activity_type,
        start_at = excluded.start_at,
        distance_m = excluded.distance_m,
        moving_seconds = excluded.moving_seconds,
        elapsed_seconds = excluded.elapsed_seconds,
        average_speed_mps = excluded.average_speed_mps,
        updated_at = excluded.updated_at`
    )
      .bind(
        crypto.randomUUID(),
        auth.team.id,
        athleteUserId,
        externalId,
        workout.name,
        'Workout',
        startAt,
        distanceMeters > 0 ? distanceMeters : null,
        movingSeconds,
        movingSeconds,
        averageSpeedMps,
        nowISO,
        nowISO
      )
      .run();

    feedItemsUpserted += 1;
  }

  return json({
    workoutId: workout.id,
    syncedAthletes,
    feedItemsUpserted,
  });
}

function mapActivityFeedItem(row) {
  const ownerName = String(row.owner_name ?? '').trim();
  return {
    id: row.id,
    teamId: row.team_id,
    ownerUserId: row.user_id,
    ownerName: ownerName || 'Team Athlete',
    source: row.source,
    externalId: row.external_id ?? null,
    title: row.title,
    activityType: row.activity_type ?? '',
    startAt: row.start_at,
    distanceMeters: row.distance_m === null ? null : Number(row.distance_m),
    movingSeconds: row.moving_seconds === null ? null : Number(row.moving_seconds),
    elapsedSeconds: row.elapsed_seconds === null ? null : Number(row.elapsed_seconds),
    elevationGainMeters: row.elevation_gain_m === null ? null : Number(row.elevation_gain_m),
    averageSpeedMps: row.average_speed_mps === null ? null : Number(row.average_speed_mps),
    polyline: row.polyline ?? null,
    commentCount: Number(row.comment_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapActivityComment(row) {
  return {
    id: row.id,
    activityId: row.activity_id,
    authorUserId: row.author_user_id,
    authorName: row.author_name,
    body: row.body,
    createdAt: row.created_at,
  };
}

function parseWorkoutExternalId(value) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return {
      workoutId: null,
      athleteUserId: null,
    };
  }

  const separatorIndex = raw.lastIndexOf(':');
  if (separatorIndex <= 0 || separatorIndex >= raw.length - 1) {
    return {
      workoutId: raw,
      athleteUserId: null,
    };
  }

  const workoutId = raw.slice(0, separatorIndex).trim();
  const athleteUserId = raw.slice(separatorIndex + 1).trim();

  return {
    workoutId: workoutId || null,
    athleteUserId: athleteUserId || null,
  };
}

async function getWorkoutActivityDetail(env, request, activityId) {
  const auth = await requireAuthenticatedTeam(env, request);
  if (auth.error) return error(auth.error, auth.status);

  const activity = await env.DB.prepare(
    `SELECT id, team_id, user_id, source, external_id
     FROM activity_feed_items
     WHERE id = ? AND team_id = ?
     LIMIT 1`
  )
    .bind(activityId, auth.team.id)
    .first();

  if (!activity) {
    return error('Activity not found.', 404);
  }

  if (activity.source !== 'workout') {
    return error('This activity is not a timed workout.', 400);
  }

  if (auth.currentUser.role !== 'coach' && auth.currentUser.id !== activity.user_id) {
    return error('You do not have access to this workout detail.', 403);
  }

  const parsedExternal = parseWorkoutExternalId(activity.external_id);
  const workoutId = parsedExternal.workoutId;
  const athleteUserId = parsedExternal.athleteUserId || String(activity.user_id ?? '').trim() || null;

  if (!athleteUserId) {
    return error('Workout athlete could not be resolved.', 404);
  }

  let resultRow = null;

  if (workoutId) {
    resultRow = await env.DB.prepare(
      `SELECT results.id AS workout_result_id,
              results.athlete_name,
              results.started_at,
              results.stopped_at,
              results.total_elapsed_ms,
              work.id AS workout_id,
              work.name AS workout_name
       FROM team_workout_results results
       INNER JOIN team_workouts work
         ON work.id = results.workout_id
        AND work.team_id = results.team_id
       WHERE results.team_id = ?
         AND results.athlete_user_id = ?
         AND results.workout_id = ?
       ORDER BY datetime(results.created_at) DESC
       LIMIT 1`
    )
      .bind(auth.team.id, athleteUserId, workoutId)
      .first();
  } else {
    resultRow = await env.DB.prepare(
      `SELECT results.id AS workout_result_id,
              results.athlete_name,
              results.started_at,
              results.stopped_at,
              results.total_elapsed_ms,
              work.id AS workout_id,
              work.name AS workout_name
       FROM team_workout_results results
       INNER JOIN team_workouts work
         ON work.id = results.workout_id
        AND work.team_id = results.team_id
       WHERE results.team_id = ?
         AND results.athlete_user_id = ?
       ORDER BY datetime(work.workout_at) DESC, datetime(results.created_at) DESC
       LIMIT 1`
    )
      .bind(auth.team.id, athleteUserId)
      .first();
  }

  if (!resultRow) {
    return error('Workout detail not found.', 404);
  }

  const splitRows = await env.DB.prepare(
    `SELECT split_number, elapsed_ms, timestamp, is_final,
            step_type, step_distance_value, step_distance_unit, step_label
     FROM team_workout_splits
     WHERE team_id = ? AND workout_result_id = ?
     ORDER BY split_number ASC, datetime(created_at) ASC`
  )
    .bind(auth.team.id, resultRow.workout_result_id)
    .all();

  let previousElapsed = 0;
  const splits = (splitRows.results ?? []).map((row) => {
    const elapsedMilliseconds = Math.max(0, Number(row.elapsed_ms ?? 0));
    const lapMilliseconds = Math.max(0, elapsedMilliseconds - previousElapsed);
    previousElapsed = elapsedMilliseconds;

    return {
      splitNumber: Number(row.split_number ?? 0),
      elapsedMilliseconds,
      lapMilliseconds,
      isFinal: Number(row.is_final ?? 0) === 1,
      stepType: row.step_type ?? null,
      stepDistanceValue:
        row.step_distance_value === null ? null : Number(row.step_distance_value),
      stepDistanceUnit: row.step_distance_unit ?? null,
      stepLabel: row.step_label ?? null,
    };
  });

  const totalElapsedMilliseconds =
    resultRow.total_elapsed_ms === null || resultRow.total_elapsed_ms === undefined
      ? splits.length > 0
        ? splits[splits.length - 1].elapsedMilliseconds
        : null
      : Number(resultRow.total_elapsed_ms);

  return json({
    activityId,
    workoutId: resultRow.workout_id,
    workoutName: resultRow.workout_name ?? 'Workout',
    athleteName: resultRow.athlete_name ?? 'Athlete',
    startedAt: resultRow.started_at ?? null,
    stoppedAt: resultRow.stopped_at ?? null,
    totalElapsedMilliseconds,
    splits,
  });
}

function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'access-control-allow-origin': '*',
    },
  });
}

function stravaResultPage(ok, message) {
  const title = ok ? 'Strava Connected' : 'Connection Failed';
  const tone = ok ? '#16a34a' : '#dc2626';
  const body = String(message ?? '').replace(/[<>]/g, '');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    :root { color-scheme: light dark; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0b1220; color: #fff; }
    .wrap { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
    .card { max-width: 520px; width: 100%; background: #111827; border: 1px solid #1f2937; border-radius: 18px; padding: 24px; }
    h1 { margin: 0 0 8px; font-size: 24px; color: ${tone}; }
    p { margin: 0; color: #d1d5db; line-height: 1.5; }
    .hint { margin-top: 14px; font-size: 14px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>${title}</h1>
      <p>${body}</p>
      <p class="hint">You can close this page and return to the app.</p>
    </div>
  </div>
</body>
</html>`;
}

function socialResultPage(ok, message) {
  const title = ok ? 'Sign-In Complete' : 'Sign-In Failed';
  const tone = ok ? '#16a34a' : '#dc2626';
  const body = String(message ?? '').replace(/[<>]/g, '');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    :root { color-scheme: light dark; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0b1220; color: #fff; }
    .wrap { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
    .card { max-width: 540px; width: 100%; background: #111827; border: 1px solid #1f2937; border-radius: 18px; padding: 24px; }
    h1 { margin: 0 0 8px; font-size: 24px; color: ${tone}; }
    p { margin: 0; color: #d1d5db; line-height: 1.5; }
    .hint { margin-top: 14px; font-size: 14px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>${title}</h1>
      <p>${body}</p>
      <p class="hint">You can close this page and return to the app.</p>
    </div>
  </div>
</body>
</html>`;
}

function requireGoogleConfig(env) {
  const clientId = String(env.GOOGLE_CLIENT_ID ?? '').trim();
  const clientSecret = String(env.GOOGLE_CLIENT_SECRET ?? '').trim();

  if (!clientId || !clientSecret) {
    throw new Error('Google sign-in is not configured on the server.');
  }

  return { clientId, clientSecret };
}

function requireAppleConfig(env) {
  const clientId = String(env.APPLE_CLIENT_ID ?? '').trim();
  const clientSecret = String(env.APPLE_CLIENT_SECRET ?? '').trim();

  if (!clientId || !clientSecret) {
    throw new Error('Apple sign-in is not configured on the server.');
  }

  return { clientId, clientSecret };
}

function canonicalPublicOrigin(env, request) {
  const configured = String(env.PUBLIC_BASE_URL ?? '').trim().replace(/\/+$/, '');
  if (configured) {
    return configured;
  }

  const url = new URL(request.url);
  return url.origin;
}

function requireStravaConfig(env) {
  const clientId = String(env.STRAVA_CLIENT_ID ?? '').trim();
  const clientSecret = String(env.STRAVA_CLIENT_SECRET ?? '').trim();

  if (!clientId || !clientSecret) {
    throw new Error('Strava integration is not configured on the server.');
  }

  return { clientId, clientSecret };
}

function buildStravaRedirectURI(env, request) {
  const configured = String(env.STRAVA_REDIRECT_BASE_URL ?? '').trim().replace(/\/+$/, '');
  if (configured) {
    return `${configured}/integrations/strava/callback`;
  }

  const url = new URL(request.url);
  return `${url.origin}/integrations/strava/callback`;
}

function buildSocialProviderRedirectURI(env, request, provider) {
  return `${canonicalPublicOrigin(env, request)}/auth/social/${provider}/callback`;
}

function buildSocialFinishURI(env, request) {
  return `${canonicalPublicOrigin(env, request)}/auth/social/finish`;
}

function buildSocialAppRedirectURI(env) {
  const configured = String(env.SOCIAL_APP_REDIRECT_URI ?? '').trim();
  if (configured) {
    return configured;
  }

  return 'splittimeteamnative://auth/social/callback';
}

function socialProviderResultRedirect(env, request, payload = {}) {
  const state = String(payload.state ?? '').trim();
  const exchangeCode = String(payload.exchangeCode ?? '').trim();
  const message = String(payload.error ?? '').trim();

  try {
    const appURL = new URL(buildSocialAppRedirectURI(env));

    if (state) {
      appURL.searchParams.set('state', state);
    }

    if (exchangeCode) {
      appURL.searchParams.set('exchangeCode', exchangeCode);
    }

    if (message) {
      appURL.searchParams.set('error', message);
    }

    return Response.redirect(appURL.toString(), 302);
  } catch {
    const finishURL = new URL(buildSocialFinishURI(env, request));

    if (exchangeCode) {
      finishURL.searchParams.set('exchangeCode', exchangeCode);
    }

    if (message) {
      finishURL.searchParams.set('error', message);
    }

    return Response.redirect(finishURL.toString(), 302);
  }
}

async function linkSocialAccount(env, userId, provider, providerUserId) {
  await env.DB.prepare(
    `INSERT INTO user_social_accounts (
      id, user_id, provider, provider_user_id, created_at
     ) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(provider, provider_user_id) DO UPDATE SET
      user_id = excluded.user_id`
  )
    .bind(crypto.randomUUID(), userId, provider, providerUserId, new Date().toISOString())
    .run();
}

async function createSocialAuthExchangeCode(env, userId) {
  const exchangeCode = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
  const expiresAt = Math.floor(Date.now() / 1000) + 5 * 60;

  await env.DB.prepare(
    `INSERT INTO auth_exchange_codes (
      id, code, user_id, expires_at, created_at
     ) VALUES (?, ?, ?, ?, ?)`
  )
    .bind(crypto.randomUUID(), exchangeCode, userId, expiresAt, new Date().toISOString())
    .run();

  return exchangeCode;
}

async function resolveUserFromSocialProfile(env, profile) {
  const provider = String(profile.provider ?? '').trim();
  const providerUserId = String(profile.providerUserId ?? '').trim();
  const email = String(profile.email ?? '').trim().toLowerCase() || null;

  if (!provider || !providerUserId) {
    throw new Error('Could not identify social account.');
  }

  const linked = await env.DB.prepare(
    `SELECT users.id, users.role, users.first_name, users.last_name, users.email,
            users.phone, users.age, users.grade
     FROM user_social_accounts
     INNER JOIN users ON users.id = user_social_accounts.user_id
     WHERE user_social_accounts.provider = ? AND user_social_accounts.provider_user_id = ?
     LIMIT 1`
  )
    .bind(provider, providerUserId)
    .first();

  if (linked) {
    return mapUser(linked);
  }

  let user = null;

  if (provider === 'strava') {
    const fromConnection = await env.DB.prepare(
      `SELECT users.id, users.role, users.first_name, users.last_name, users.email,
              users.phone, users.age, users.grade
       FROM strava_connections
       INNER JOIN users ON users.id = strava_connections.user_id
       WHERE strava_connections.strava_athlete_id = ?
       LIMIT 1`
    )
      .bind(providerUserId)
      .first();

    if (fromConnection) {
      user = mapUser(fromConnection);
    }
  }

  if (!user && email) {
    const byEmail = await env.DB.prepare(
      `SELECT id, role, first_name, last_name, email, phone, age, grade
       FROM users
       WHERE email = ?
       LIMIT 1`
    )
      .bind(email)
      .first();

    if (byEmail) {
      user = mapUser(byEmail);
    }
  }

  if (!user) {
    throw new Error('No account matched this social login. Create your account first, then try again.');
  }

  await linkSocialAccount(env, user.id, provider, providerUserId);
  return user;
}

function socialProviderErrorRedirect(env, request, message, state = '') {
  return socialProviderResultRedirect(env, request, {
    state,
    error: message,
  });
}

async function refreshStravaTokenIfNeeded(env, connectionRow) {
  const config = requireStravaConfig(env);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = Number(connectionRow.expires_at ?? 0);

  if (expiresAt > now + 120) {
    return {
      ...connectionRow,
      access_token: connectionRow.access_token,
      refresh_token: connectionRow.refresh_token,
      expires_at: expiresAt,
    };
  }

  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: connectionRow.refresh_token,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload.access_token) {
    throw new Error(payload.message || 'Could not refresh Strava token.');
  }

  const next = {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? connectionRow.refresh_token,
    expiresAt: Number(payload.expires_at ?? 0),
    scope: String(payload.scope ?? connectionRow.scope ?? ''),
  };

  await env.DB.prepare(
    `UPDATE strava_connections
     SET access_token = ?, refresh_token = ?, expires_at = ?, scope = ?, updated_at = ?
     WHERE user_id = ?`
  )
    .bind(
      next.accessToken,
      next.refreshToken,
      next.expiresAt,
      next.scope,
      new Date().toISOString(),
      connectionRow.user_id
    )
    .run();

  return {
    ...connectionRow,
    access_token: next.accessToken,
    refresh_token: next.refreshToken,
    expires_at: next.expiresAt,
    scope: next.scope,
  };
}

async function fetchStravaActivities(accessToken) {
  const all = [];
  const perPage = 50;

  for (let page = 1; page <= 3; page += 1) {
    const response = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?per_page=${perPage}&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const payload = await response.json().catch(() => []);
    if (!response.ok || !Array.isArray(payload)) {
      throw new Error(payload?.message || 'Could not fetch Strava activities.');
    }

    all.push(...payload);
    if (payload.length < perPage) {
      break;
    }
  }

  return all;
}

async function upsertStravaActivities(env, teamId, userId, activities) {
  let imported = 0;

  for (const activity of activities) {
    const externalId = String(activity?.id ?? '').trim();
    if (!externalId) continue;

    const startAt = activity?.start_date ? new Date(activity.start_date).toISOString() : new Date().toISOString();
    const existing = await env.DB.prepare(
      `SELECT id, created_at
       FROM activity_feed_items
       WHERE team_id = ? AND user_id = ? AND source = 'strava' AND external_id = ?
       LIMIT 1`
    )
      .bind(teamId, userId, externalId)
      .first();

    if (!existing) {
      imported += 1;
    }

    await env.DB.prepare(
      `INSERT INTO activity_feed_items (
        id, team_id, user_id, source, external_id, title, activity_type, start_at, distance_m, moving_seconds,
        elapsed_seconds, elevation_gain_m, average_speed_mps, polyline, created_at, updated_at
       ) VALUES (?, ?, ?, 'strava', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, source, external_id) DO UPDATE SET
        title = excluded.title,
        activity_type = excluded.activity_type,
        start_at = excluded.start_at,
        distance_m = excluded.distance_m,
        moving_seconds = excluded.moving_seconds,
        elapsed_seconds = excluded.elapsed_seconds,
        elevation_gain_m = excluded.elevation_gain_m,
        average_speed_mps = excluded.average_speed_mps,
        polyline = excluded.polyline,
        updated_at = excluded.updated_at`
    )
      .bind(
        existing?.id ?? crypto.randomUUID(),
        teamId,
        userId,
        externalId,
        String(activity?.name ?? 'Run').trim() || 'Run',
        String(activity?.sport_type ?? activity?.type ?? 'Run'),
        startAt,
        Number.isFinite(Number(activity?.distance)) ? Number(activity.distance) : null,
        Number.isFinite(Number(activity?.moving_time)) ? Math.round(Number(activity.moving_time)) : null,
        Number.isFinite(Number(activity?.elapsed_time)) ? Math.round(Number(activity.elapsed_time)) : null,
        Number.isFinite(Number(activity?.total_elevation_gain)) ? Number(activity.total_elevation_gain) : null,
        Number.isFinite(Number(activity?.average_speed)) ? Number(activity.average_speed) : null,
        String(activity?.map?.summary_polyline ?? '').trim() || null,
        existing ? connectionSafeCreatedAt(existing.created_at) : new Date().toISOString(),
        new Date().toISOString()
      )
      .run();
  }

  return imported;
}

function connectionSafeCreatedAt(value) {
  return value ? String(value) : new Date().toISOString();
}

async function stravaStatus(env, request) {
  const auth = await requireAuthenticatedTeam(env, request);
  if (auth.error) return error(auth.error, auth.status);

  const row = await env.DB.prepare(
    `SELECT athlete_name, expires_at
     FROM strava_connections
     WHERE user_id = ? AND team_id = ?
     LIMIT 1`
  )
    .bind(auth.currentUser.id, auth.team.id)
    .first();

  if (!row) {
    return json({ connected: false, athleteName: null, expiresAt: null });
  }

  return json({
    connected: true,
    athleteName: row.athlete_name ?? null,
    expiresAt: row.expires_at === null ? null : Number(row.expires_at),
  });
}

async function stravaConnect(env, request) {
  const auth = await requireAuthenticatedTeam(env, request);
  if (auth.error) return error(auth.error, auth.status);

  let config;
  try {
    config = requireStravaConfig(env);
  } catch (err) {
    return error(err instanceof Error ? err.message : 'Strava config missing.', 500);
  }

  const state = crypto.randomUUID().replaceAll('-', '');
  const expiresAt = Math.floor(Date.now() / 1000) + 10 * 60;

  await env.DB.prepare(
    `INSERT INTO integration_oauth_states (
      id, state, provider, user_id, team_id, expires_at, created_at
     ) VALUES (?, ?, 'strava', ?, ?, ?, ?)`
  )
    .bind(
      crypto.randomUUID(),
      state,
      auth.currentUser.id,
      auth.team.id,
      expiresAt,
      new Date().toISOString()
    )
    .run();

  const authorizeURL = new URL('https://www.strava.com/oauth/authorize');
  authorizeURL.searchParams.set('client_id', config.clientId);
  authorizeURL.searchParams.set('response_type', 'code');
  authorizeURL.searchParams.set('approval_prompt', 'force');
  authorizeURL.searchParams.set('scope', 'read,activity:read_all');
  authorizeURL.searchParams.set('redirect_uri', buildStravaRedirectURI(env, request));
  authorizeURL.searchParams.set('state', state);

  return json({
    authorizeUrl: authorizeURL.toString(),
  });
}

async function stravaCallback(env, request) {
  const url = new URL(request.url);
  const state = String(url.searchParams.get('state') ?? '').trim();
  const code = String(url.searchParams.get('code') ?? '').trim();
  const authError = String(url.searchParams.get('error') ?? '').trim();

  if (authError) {
    return htmlResponse(stravaResultPage(false, `Strava returned an error: ${authError}.`), 400);
  }

  if (!state || !code) {
    return htmlResponse(stravaResultPage(false, 'Missing OAuth state or code.'), 400);
  }

  const stateRow = await env.DB.prepare(
    `SELECT id, user_id, team_id, expires_at
     FROM integration_oauth_states
     WHERE state = ? AND provider = 'strava'
     LIMIT 1`
  )
    .bind(state)
    .first();

  if (!stateRow) {
    return htmlResponse(stravaResultPage(false, 'This connect session is invalid or expired.'), 400);
  }

  if (Number(stateRow.expires_at ?? 0) < Math.floor(Date.now() / 1000)) {
    await env.DB.prepare(`DELETE FROM integration_oauth_states WHERE id = ?`).bind(stateRow.id).run();
    return htmlResponse(stravaResultPage(false, 'This connect session has expired. Please try again.'), 400);
  }

  let config;
  try {
    config = requireStravaConfig(env);
  } catch (err) {
    return htmlResponse(
      stravaResultPage(false, err instanceof Error ? err.message : 'Strava integration is not configured.'),
      500
    );
  }

  const tokenResponse = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: 'authorization_code',
    }),
  });

  const tokenPayload = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenPayload.access_token) {
    await env.DB.prepare(`DELETE FROM integration_oauth_states WHERE id = ?`).bind(stateRow.id).run();
    return htmlResponse(
      stravaResultPage(false, tokenPayload.message || 'Could not complete Strava token exchange.'),
      400
    );
  }

  const athlete = tokenPayload.athlete ?? {};
  const athleteName = [athlete.firstname, athlete.lastname].filter(Boolean).join(' ').trim() || null;

  await env.DB.prepare(
    `INSERT INTO strava_connections (
      user_id, team_id, strava_athlete_id, athlete_name, access_token, refresh_token, expires_at, scope, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
      team_id = excluded.team_id,
      strava_athlete_id = excluded.strava_athlete_id,
      athlete_name = excluded.athlete_name,
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expires_at = excluded.expires_at,
      scope = excluded.scope,
      updated_at = excluded.updated_at`
  )
    .bind(
      stateRow.user_id,
      stateRow.team_id,
      String(athlete.id ?? ''),
      athleteName,
      String(tokenPayload.access_token),
      String(tokenPayload.refresh_token ?? ''),
      Number(tokenPayload.expires_at ?? 0),
      String(tokenPayload.scope ?? ''),
      new Date().toISOString(),
      new Date().toISOString()
    )
    .run();

  await env.DB.prepare(`DELETE FROM integration_oauth_states WHERE id = ?`).bind(stateRow.id).run();

  return htmlResponse(stravaResultPage(true, 'Strava is connected. Your runs can now sync into the app.'));
}

async function stravaSync(env, request) {
  const auth = await requireAuthenticatedTeam(env, request);
  if (auth.error) return error(auth.error, auth.status);

  const connection = await env.DB.prepare(
    `SELECT user_id, team_id, access_token, refresh_token, expires_at, scope
     FROM strava_connections
     WHERE user_id = ? AND team_id = ?
     LIMIT 1`
  )
    .bind(auth.currentUser.id, auth.team.id)
    .first();

  if (!connection) {
    return error('Strava is not connected for this account.', 400);
  }

  let activeConnection;
  try {
    activeConnection = await refreshStravaTokenIfNeeded(env, connection);
  } catch (err) {
    return error(err instanceof Error ? err.message : 'Could not refresh Strava access.', 500);
  }

  let activities = [];
  try {
    activities = await fetchStravaActivities(activeConnection.access_token);
  } catch (err) {
    return error(err instanceof Error ? err.message : 'Could not fetch Strava activities.', 500);
  }

  const imported = await upsertStravaActivities(env, auth.team.id, auth.currentUser.id, activities);

  return json({
    imported,
    totalFetched: activities.length,
  });
}

async function stravaDisconnect(env, request) {
  const auth = await requireAuthenticatedTeam(env, request);
  if (auth.error) return error(auth.error, auth.status);

  const connection = await env.DB.prepare(
    `SELECT access_token
     FROM strava_connections
     WHERE user_id = ? AND team_id = ?
     LIMIT 1`
  )
    .bind(auth.currentUser.id, auth.team.id)
    .first();

  if (connection?.access_token) {
    // Best effort upstream revoke so reconnect starts from a clean auth state.
    await fetch('https://www.strava.com/oauth/deauthorize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${String(connection.access_token)}`,
      },
    }).catch(() => null);
  }

  await env.DB.prepare(
    `DELETE FROM strava_connections
     WHERE user_id = ? AND team_id = ?`
  )
    .bind(auth.currentUser.id, auth.team.id)
    .run();

  return json({ connected: false });
}

async function listActivityFeed(env, request) {
  const auth = await requireAuthenticatedTeam(env, request);
  if (auth.error) return error(auth.error, auth.status);

  const url = new URL(request.url);
  const scope = String(url.searchParams.get('scope') ?? 'me').trim().toLowerCase();
  const includeTeamScope = scope === 'team';
  const requestedOwnerUserId = String(url.searchParams.get('ownerUserId') ?? '').trim();
  const requestedLimit = Number(url.searchParams.get('limit') ?? 10);
  const requestedOffset = Number(url.searchParams.get('offset') ?? 0);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(50, Math.floor(requestedLimit))) : 10;
  const offset = Number.isFinite(requestedOffset) ? Math.max(0, Math.floor(requestedOffset)) : 0;

  let ownerUserId = auth.currentUser.id;
  let includeTeam = includeTeamScope;

  if (requestedOwnerUserId) {
    if (auth.currentUser.role !== 'coach') {
      return error('Only coaches can filter activity feed by athlete.', 403);
    }

    const athlete = await env.DB.prepare(
      `SELECT user_id
       FROM team_members
       WHERE team_id = ? AND user_id = ? AND role = 'athlete'
       LIMIT 1`
    )
      .bind(auth.team.id, requestedOwnerUserId)
      .first();

    if (!athlete) {
      return error('Athlete not found.', 404);
    }

    ownerUserId = requestedOwnerUserId;
    includeTeam = false;
  }

  const rows = await env.DB.prepare(
    `SELECT feed.id, feed.team_id, feed.user_id, feed.source, feed.external_id, feed.title, feed.activity_type,
            feed.start_at, feed.distance_m, feed.moving_seconds, feed.elapsed_seconds, feed.elevation_gain_m,
            feed.average_speed_mps, feed.polyline, feed.created_at, feed.updated_at,
            COALESCE(NULLIF(TRIM(users.first_name || ' ' || users.last_name), ''), users.email, 'Team Athlete') AS owner_name,
            (
              SELECT COUNT(1)
              FROM activity_comments comments
              WHERE comments.activity_id = feed.id
            ) AS comment_count
     FROM activity_feed_items feed
     LEFT JOIN users ON users.id = feed.user_id
     WHERE feed.team_id = ?
       AND (? = 1 OR feed.user_id = ?)
     ORDER BY datetime(feed.start_at) DESC, datetime(feed.created_at) DESC
     LIMIT ? OFFSET ?`
  )
    .bind(auth.team.id, includeTeam ? 1 : 0, ownerUserId, limit, offset)
    .all();

  return json((rows.results ?? []).map(mapActivityFeedItem));
}

async function listActivityComments(env, request, activityId) {
  const auth = await requireAuthenticatedTeam(env, request);
  if (auth.error) return error(auth.error, auth.status);

  const activity = await env.DB.prepare(
    `SELECT id
     FROM activity_feed_items
     WHERE id = ? AND team_id = ?
     LIMIT 1`
  )
    .bind(activityId, auth.team.id)
    .first();

  if (!activity) {
    return error('Activity not found.', 404);
  }

  const rows = await env.DB.prepare(
    `SELECT id, activity_id, team_id, author_user_id, author_name, body, created_at
     FROM activity_comments
     WHERE team_id = ? AND activity_id = ?
     ORDER BY datetime(created_at) ASC`
  )
    .bind(auth.team.id, activityId)
    .all();

  return json((rows.results ?? []).map(mapActivityComment));
}

async function createActivityComment(env, request, activityId) {
  const auth = await requireAuthenticatedTeam(env, request);
  if (auth.error) return error(auth.error, auth.status);

  const activity = await env.DB.prepare(
    `SELECT id
     FROM activity_feed_items
     WHERE id = ? AND team_id = ?
     LIMIT 1`
  )
    .bind(activityId, auth.team.id)
    .first();

  if (!activity) {
    return error('Activity not found.', 404);
  }

  const payload = await request.json();
  const body = String(payload.body ?? '').trim();
  if (!body) {
    return error('Comment body is required.');
  }

  const comment = {
    id: crypto.randomUUID(),
    activityId,
    teamId: auth.team.id,
    authorUserId: auth.currentUser.id,
    authorName: `${auth.currentUser.firstName} ${auth.currentUser.lastName}`.trim() || 'Team Member',
    body,
    createdAt: new Date().toISOString(),
  };

  await env.DB.prepare(
    `INSERT INTO activity_comments (
      id, activity_id, team_id, author_user_id, author_name, body, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      comment.id,
      comment.activityId,
      comment.teamId,
      comment.authorUserId,
      comment.authorName,
      comment.body,
      comment.createdAt
    )
    .run();

  return json(comment, 201);
}

async function listSchedule(env, request) {
  const auth = await requireAuthenticatedTeam(env, request);

  if (auth.error) {
    return error(auth.error, auth.status);
  }

  const eventRows = await env.DB.prepare(
    `SELECT id, team_id, type, category, title, starts_at, ends_at, location, location_latitude,
            location_longitude, notes, is_recurring, recurrence_days, recurrence_ends_at,
            created_at, updated_at
     FROM schedule_events
     WHERE team_id = ?
     ORDER BY starts_at ASC, created_at ASC`
  )
    .bind(auth.team.id)
    .all();

  const overrideRows = await env.DB.prepare(
    `SELECT id, event_id, team_id, occurrence_starts_at, type, category, title, starts_at, ends_at,
            location, location_latitude, location_longitude, notes, is_cancelled, created_at, updated_at
     FROM schedule_event_overrides
     WHERE team_id = ?
     ORDER BY occurrence_starts_at ASC`
  )
    .bind(auth.team.id)
    .all();

  return json({
    events: (eventRows.results ?? []).map(mapScheduleEvent),
    overrides: (overrideRows.results ?? []).map(mapScheduleOverride),
  });
}

async function createScheduleEvent(env, request) {
  const auth = await requireAuthenticatedTeam(env, request);

  if (auth.error) {
    return error(auth.error, auth.status);
  }

  if (auth.currentUser.role !== 'coach') {
    return error('Only coaches can create schedule events.', 403);
  }

  let payload;
  try {
    payload = parseSchedulePayload(await request.json());
  } catch (err) {
    return error(err instanceof Error ? err.message : 'Invalid schedule event payload.');
  }

  const now = Date.now();
  const event = {
    id: crypto.randomUUID(),
    teamId: auth.team.id,
    ...payload,
    createdAt: now,
    updatedAt: now,
  };

  await env.DB.prepare(
    `INSERT INTO schedule_events (
      id, team_id, type, category, title, starts_at, ends_at, location, location_latitude,
      location_longitude, notes, is_recurring, recurrence_days, recurrence_ends_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
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
    )
    .run();

  return json(event, 201);
}

async function updateScheduleEvent(env, request, eventId) {
  const auth = await requireAuthenticatedTeam(env, request);

  if (auth.error) {
    return error(auth.error, auth.status);
  }

  if (auth.currentUser.role !== 'coach') {
    return error('Only coaches can edit schedule events.', 403);
  }

  const existing = await env.DB.prepare(
    `SELECT id, created_at
     FROM schedule_events
     WHERE id = ? AND team_id = ?
     LIMIT 1`
  )
    .bind(eventId, auth.team.id)
    .first();

  if (!existing) {
    return error('Schedule event not found.', 404);
  }

  let payload;
  try {
    payload = parseSchedulePayload(await request.json());
  } catch (err) {
    return error(err instanceof Error ? err.message : 'Invalid schedule event payload.');
  }

  const updatedAt = Date.now();

  await env.DB.prepare(
    `UPDATE schedule_events
     SET type = ?, category = ?, title = ?, starts_at = ?, ends_at = ?, location = ?,
         location_latitude = ?, location_longitude = ?, notes = ?, is_recurring = ?,
         recurrence_days = ?, recurrence_ends_at = ?, updated_at = ?
     WHERE id = ? AND team_id = ?`
  )
    .bind(
      payload.type,
      payload.category,
      payload.title,
      payload.startsAt,
      payload.endsAt,
      payload.location,
      payload.locationLatitude,
      payload.locationLongitude,
      payload.notes,
      payload.isRecurring ? 1 : 0,
      serializeRecurrenceDays(payload.recurrenceDays),
      payload.recurrenceEndsAt,
      updatedAt,
      eventId,
      auth.team.id
    )
    .run();

  return json({
    id: eventId,
    teamId: auth.team.id,
    ...payload,
    createdAt: Number(existing.created_at),
    updatedAt,
  });
}

async function deleteScheduleEvent(env, request, eventId) {
  const auth = await requireAuthenticatedTeam(env, request);

  if (auth.error) {
    return error(auth.error, auth.status);
  }

  if (auth.currentUser.role !== 'coach') {
    return error('Only coaches can delete schedule events.', 403);
  }

  await env.DB.batch([
    env.DB.prepare(`DELETE FROM schedule_event_overrides WHERE event_id = ? AND team_id = ?`).bind(eventId, auth.team.id),
    env.DB.prepare(`DELETE FROM schedule_events WHERE id = ? AND team_id = ?`).bind(eventId, auth.team.id),
  ]);

  return json({ ok: true });
}

async function deleteAllScheduleEvents(env, request) {
  const auth = await requireAuthenticatedTeam(env, request);

  if (auth.error) {
    return error(auth.error, auth.status);
  }

  if (auth.currentUser.role !== 'coach') {
    return error('Only coaches can delete schedule events.', 403);
  }

  await env.DB.batch([
    env.DB.prepare(`DELETE FROM schedule_event_overrides WHERE team_id = ?`).bind(auth.team.id),
    env.DB.prepare(`DELETE FROM schedule_events WHERE team_id = ?`).bind(auth.team.id),
  ]);

  return json({ ok: true });
}

async function upsertScheduleOccurrence(env, request) {
  const auth = await requireAuthenticatedTeam(env, request);

  if (auth.error) {
    return error(auth.error, auth.status);
  }

  if (auth.currentUser.role !== 'coach') {
    return error('Only coaches can edit schedule events.', 403);
  }

  const raw = await request.json();
  const eventId = String(raw.eventId ?? '').trim();
  const occurrenceStartsAt = Number(raw.occurrenceStartsAt);

  if (!eventId || !Number.isFinite(occurrenceStartsAt)) {
    return error('Event id and occurrence start are required.');
  }

  const event = await env.DB.prepare(
    `SELECT id
     FROM schedule_events
     WHERE id = ? AND team_id = ?
     LIMIT 1`
  )
    .bind(eventId, auth.team.id)
    .first();

  if (!event) {
    return error('Schedule event not found.', 404);
  }

  let payload;
  try {
    payload = parseSchedulePayload(raw);
  } catch (err) {
    return error(err instanceof Error ? err.message : 'Invalid schedule event payload.');
  }

  const existing = await env.DB.prepare(
    `SELECT id, created_at
     FROM schedule_event_overrides
     WHERE event_id = ? AND occurrence_starts_at = ? AND team_id = ?
     LIMIT 1`
  )
    .bind(eventId, occurrenceStartsAt, auth.team.id)
    .first();

  const now = Date.now();
  const override = {
    id: existing?.id ?? crypto.randomUUID(),
    eventId,
    teamId: auth.team.id,
    occurrenceStartsAt,
    ...payload,
    isCancelled: false,
    createdAt: existing ? Number(existing.created_at) : now,
    updatedAt: now,
  };

  await env.DB.prepare(
    `INSERT INTO schedule_event_overrides (
      id, event_id, team_id, occurrence_starts_at, type, category, title, starts_at, ends_at,
      location, location_latitude, location_longitude, notes, is_cancelled, created_at, updated_at
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
      updated_at = excluded.updated_at`
  )
    .bind(
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
      0,
      override.createdAt,
      override.updatedAt
    )
    .run();

  return json(override);
}

async function deleteScheduleOccurrence(env, request) {
  const auth = await requireAuthenticatedTeam(env, request);

  if (auth.error) {
    return error(auth.error, auth.status);
  }

  if (auth.currentUser.role !== 'coach') {
    return error('Only coaches can delete schedule events.', 403);
  }

  const raw = await request.json();
  const eventId = String(raw.eventId ?? '').trim();
  const occurrenceStartsAt = Number(raw.occurrenceStartsAt);

  if (!eventId || !Number.isFinite(occurrenceStartsAt)) {
    return error('Event id and occurrence start are required.');
  }

  const existing = await env.DB.prepare(
    `SELECT id, event_id, team_id, occurrence_starts_at, type, category, title, starts_at, ends_at,
            location, location_latitude, location_longitude, notes, is_cancelled, created_at, updated_at
     FROM schedule_event_overrides
     WHERE event_id = ? AND occurrence_starts_at = ? AND team_id = ?
     LIMIT 1`
  )
    .bind(eventId, occurrenceStartsAt, auth.team.id)
    .first();

  const now = Date.now();
  const fallbackEvent = await env.DB.prepare(
    `SELECT id, type, category, title, starts_at, ends_at, location, location_latitude, location_longitude, notes
     FROM schedule_events
     WHERE id = ? AND team_id = ?
     LIMIT 1`
  )
    .bind(eventId, auth.team.id)
    .first();

  if (!fallbackEvent) {
    return error('Schedule event not found.', 404);
  }

  await env.DB.prepare(
    `INSERT INTO schedule_event_overrides (
      id, event_id, team_id, occurrence_starts_at, type, category, title, starts_at, ends_at,
      location, location_latitude, location_longitude, notes, is_cancelled, created_at, updated_at
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
      updated_at = excluded.updated_at`
  )
    .bind(
      existing?.id ?? crypto.randomUUID(),
      eventId,
      auth.team.id,
      occurrenceStartsAt,
      existing?.type ?? fallbackEvent.type,
      existing?.category ?? fallbackEvent.category ?? '',
      existing?.title ?? fallbackEvent.title,
      existing?.starts_at ?? occurrenceStartsAt,
      existing?.ends_at ?? null,
      existing?.location ?? fallbackEvent.location ?? null,
      existing?.location_latitude ?? fallbackEvent.location_latitude ?? null,
      existing?.location_longitude ?? fallbackEvent.location_longitude ?? null,
      existing?.notes ?? fallbackEvent.notes ?? null,
      1,
      existing?.created_at ?? now,
      now
    )
    .run();

  return json({ ok: true });
}

function getImageExtension(file) {
  if (file?.type === 'image/png') return 'png';
  if (file?.type === 'image/webp') return 'webp';
  if (file?.type === 'image/heic') return 'heic';
  return 'jpg';
}

async function extractChatPayload(request) {
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const body = String(formData.get('body') ?? '').trim();
    const image = formData.get('image');
    return {
      body,
      image: image instanceof File ? image : null,
    };
  }

  const payload = await request.json();
  return {
    body: payload.body?.trim() ?? '',
    image: null,
  };
}

async function uploadChatImage(env, request, teamId, messageId, imageFile) {
  if (!env.FILES) {
    throw new Error('Image storage is not configured.');
  }

  const extension = getImageExtension(imageFile);
  const imageKey = `chat/${teamId}/${messageId}.${extension}`;

  await env.FILES.put(imageKey, await imageFile.arrayBuffer(), {
    httpMetadata: {
      contentType: imageFile.type || 'image/jpeg',
    },
  });

  const url = new URL(request.url);
  const imageUrl = `${url.origin}/chat/image?key=${encodeURIComponent(imageKey)}`;

  return {
    imageKey,
    imageUrl,
  };
}

async function serveChatImage(env, request) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key')?.trim();

  if (!key) {
    return error('Image key is required.', 400);
  }

  if (!env.FILES) {
    return error('Image storage is not configured.', 500);
  }

  const object = await env.FILES.get(key);

  if (!object) {
    return error('Image not found.', 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  headers.set('access-control-allow-origin', '*');

  return new Response(object.body, {
    headers,
  });
}

async function startSocialLogin(env, request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return error('Invalid JSON payload.');
  }

  const provider = normalizeSocialProvider(payload.provider);
  if (!provider) {
    return error('Unsupported social sign-in provider.');
  }

  const state = crypto.randomUUID().replaceAll('-', '');
  const expiresAt = Math.floor(Date.now() / 1000) + 10 * 60;

  await env.DB.prepare(
    `INSERT INTO auth_oauth_states (
      id, state, provider, expires_at, created_at
     ) VALUES (?, ?, ?, ?, ?)`
  )
    .bind(crypto.randomUUID(), state, provider, expiresAt, new Date().toISOString())
    .run();

  await env.DB.prepare(
    `INSERT INTO auth_social_results (
      state, exchange_code, error_message, expires_at, consumed_at, created_at
     ) VALUES (?, NULL, NULL, ?, NULL, ?)
     ON CONFLICT(state) DO UPDATE SET
      exchange_code = NULL,
      error_message = NULL,
      expires_at = excluded.expires_at,
      consumed_at = NULL`
  )
    .bind(state, expiresAt, new Date().toISOString())
    .run();

  let authorizeURL;

  try {
    if (provider === 'google') {
      const config = requireGoogleConfig(env);
      authorizeURL = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authorizeURL.searchParams.set('client_id', config.clientId);
      authorizeURL.searchParams.set('redirect_uri', buildSocialProviderRedirectURI(env, request, 'google'));
      authorizeURL.searchParams.set('response_type', 'code');
      authorizeURL.searchParams.set('scope', 'openid email profile');
      authorizeURL.searchParams.set('prompt', 'select_account');
      authorizeURL.searchParams.set('state', state);
    } else if (provider === 'apple') {
      const config = requireAppleConfig(env);
      authorizeURL = new URL('https://appleid.apple.com/auth/authorize');
      authorizeURL.searchParams.set('client_id', config.clientId);
      authorizeURL.searchParams.set('redirect_uri', buildSocialProviderRedirectURI(env, request, 'apple'));
      authorizeURL.searchParams.set('response_type', 'code');
      authorizeURL.searchParams.set('response_mode', 'form_post');
      authorizeURL.searchParams.set('scope', 'name email');
      authorizeURL.searchParams.set('state', state);
    } else {
      const config = requireStravaConfig(env);
      authorizeURL = new URL('https://www.strava.com/oauth/authorize');
      authorizeURL.searchParams.set('client_id', config.clientId);
      authorizeURL.searchParams.set('response_type', 'code');
      authorizeURL.searchParams.set('approval_prompt', 'force');
      authorizeURL.searchParams.set('scope', 'read,activity:read_all,profile:read_all');
      authorizeURL.searchParams.set('redirect_uri', buildSocialProviderRedirectURI(env, request, 'strava'));
      authorizeURL.searchParams.set('state', state);
    }
  } catch (err) {
    return error(err instanceof Error ? err.message : 'Could not start social sign-in.', 500);
  }

  return json({
    authorizeUrl: authorizeURL.toString(),
    state,
  });
}

async function exchangeGoogleAuthCode(env, request, code) {
  const config = requireGoogleConfig(env);
  const redirectURI = buildSocialProviderRedirectURI(env, request, 'google');

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectURI,
      grant_type: 'authorization_code',
    }),
  });

  const tokenPayload = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenPayload.access_token) {
    throw new Error(tokenPayload.error_description || tokenPayload.error || 'Could not complete Google sign-in.');
  }

  const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: {
      Authorization: `Bearer ${tokenPayload.access_token}`,
    },
  });
  const profilePayload = await profileResponse.json().catch(() => ({}));
  if (!profileResponse.ok) {
    throw new Error('Could not load Google profile.');
  }

  return {
    provider: 'google',
    providerUserId: String(profilePayload.sub ?? '').trim(),
    email: String(profilePayload.email ?? '').trim().toLowerCase() || null,
    firstName: String(profilePayload.given_name ?? '').trim() || null,
    lastName: String(profilePayload.family_name ?? '').trim() || null,
  };
}

async function exchangeAppleAuthCode(env, request, code) {
  const config = requireAppleConfig(env);
  const redirectURI = buildSocialProviderRedirectURI(env, request, 'apple');

  const tokenResponse = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectURI,
    }),
  });

  const tokenPayload = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenPayload.id_token) {
    throw new Error(tokenPayload.error_description || tokenPayload.error || 'Could not complete Apple sign-in.');
  }

  const claims = decodeJWTPayload(String(tokenPayload.id_token ?? '')) ?? {};
  const providerUserId = String(claims.sub ?? '').trim();
  const email = String(claims.email ?? '').trim().toLowerCase() || null;

  return {
    provider: 'apple',
    providerUserId,
    email,
    firstName: null,
    lastName: null,
  };
}

async function exchangeStravaAuthCode(env, request, code) {
  const config = requireStravaConfig(env);

  const tokenResponse = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: 'authorization_code',
    }),
  });

  const tokenPayload = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenPayload.access_token) {
    throw new Error(tokenPayload.message || 'Could not complete Strava sign-in.');
  }

  const athlete = tokenPayload.athlete ?? {};
  const athleteResponse = await fetch('https://www.strava.com/api/v3/athlete', {
    headers: {
      Authorization: `Bearer ${tokenPayload.access_token}`,
    },
  });
  const athletePayload = await athleteResponse.json().catch(() => ({}));

  const providerUserId = String(athlete.id ?? athletePayload.id ?? '').trim();
  const firstName =
    String(athlete.firstname ?? athletePayload.firstname ?? '')
      .trim() || null;
  const lastName =
    String(athlete.lastname ?? athletePayload.lastname ?? '')
      .trim() || null;
  const email =
    String(athlete.email ?? athletePayload.email ?? '')
      .trim()
      .toLowerCase() || null;

  return {
    provider: 'strava',
    providerUserId,
    email,
    firstName,
    lastName,
  };
}

async function socialCallback(env, request, rawProvider) {
  const provider = normalizeSocialProvider(rawProvider);
  if (!provider) {
    return error('Unsupported social sign-in provider.', 404);
  }

  let state = '';
  let code = '';
  let providerError = '';

  if (request.method === 'POST') {
    const formData = await request.formData();
    state = String(formData.get('state') ?? '').trim();
    code = String(formData.get('code') ?? '').trim();
    providerError = String(formData.get('error') ?? '').trim();
  } else {
    const url = new URL(request.url);
    state = String(url.searchParams.get('state') ?? '').trim();
    code = String(url.searchParams.get('code') ?? '').trim();
    providerError = String(url.searchParams.get('error') ?? '').trim();
  }

  if (providerError) {
    const providerLabel = provider.slice(0, 1).toUpperCase() + provider.slice(1);
    await env.DB.prepare(
      `UPDATE auth_social_results
       SET error_message = ?, exchange_code = NULL
       WHERE state = ?`
    )
      .bind(`${providerLabel} sign-in was cancelled or failed.`, state)
      .run()
      .catch(() => null);
    return socialProviderErrorRedirect(env, request, `${providerLabel} sign-in was cancelled or failed.`, state);
  }

  if (!state || !code) {
    if (state) {
      await env.DB.prepare(
        `UPDATE auth_social_results
         SET error_message = ?, exchange_code = NULL
         WHERE state = ?`
      )
        .bind('Missing sign-in state or code.', state)
        .run()
        .catch(() => null);
    }
    return socialProviderErrorRedirect(env, request, 'Missing sign-in state or code.', state);
  }

  const stateRow = await env.DB.prepare(
    `SELECT id, provider, expires_at
     FROM auth_oauth_states
     WHERE state = ?
     LIMIT 1`
  )
    .bind(state)
    .first();

  if (!stateRow || stateRow.provider !== provider) {
    await env.DB.prepare(
      `UPDATE auth_social_results
       SET error_message = ?, exchange_code = NULL
       WHERE state = ?`
    )
      .bind('This sign-in session is invalid or expired.', state)
      .run()
      .catch(() => null);
    return socialProviderErrorRedirect(env, request, 'This sign-in session is invalid or expired.', state);
  }

  await env.DB.prepare(`DELETE FROM auth_oauth_states WHERE id = ?`)
    .bind(stateRow.id)
    .run();

  if (Number(stateRow.expires_at ?? 0) < Math.floor(Date.now() / 1000)) {
    await env.DB.prepare(
      `UPDATE auth_social_results
       SET error_message = ?, exchange_code = NULL
       WHERE state = ?`
    )
      .bind('This sign-in session has expired. Please try again.', state)
      .run()
      .catch(() => null);
    return socialProviderErrorRedirect(env, request, 'This sign-in session has expired. Please try again.', state);
  }

  try {
    let profile = null;

    if (provider === 'google') {
      profile = await exchangeGoogleAuthCode(env, request, code);
    } else if (provider === 'apple') {
      profile = await exchangeAppleAuthCode(env, request, code);
    } else {
      profile = await exchangeStravaAuthCode(env, request, code);
    }

    const user = await resolveUserFromSocialProfile(env, profile);
    const exchangeCode = await createSocialAuthExchangeCode(env, user.id);

    await env.DB.prepare(
      `UPDATE auth_social_results
       SET exchange_code = ?, error_message = NULL
       WHERE state = ?`
    )
      .bind(exchangeCode, state)
      .run();

    return socialProviderResultRedirect(env, request, {
      state,
      exchangeCode,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not finish social sign-in.';
    await env.DB.prepare(
      `UPDATE auth_social_results
       SET error_message = ?, exchange_code = NULL
       WHERE state = ?`
    )
      .bind(message, state)
      .run()
      .catch(() => null);
    return socialProviderErrorRedirect(
      env,
      request,
      message
    );
  }
}

async function socialPoll(env, request) {
  const url = new URL(request.url);
  const state = String(url.searchParams.get('state') ?? '').trim();

  if (!state) {
    return error('Social login state is required.');
  }

  const row = await env.DB.prepare(
    `SELECT state, exchange_code, error_message, expires_at, consumed_at
     FROM auth_social_results
     WHERE state = ?
     LIMIT 1`
  )
    .bind(state)
    .first();

  if (!row) {
    return error('Social login session not found.', 404);
  }

  if (Number(row.expires_at ?? 0) < Math.floor(Date.now() / 1000)) {
    return json({
      status: 'error',
      exchangeCode: null,
      error: 'This sign-in session has expired. Please try again.',
    });
  }

  if (row.error_message) {
    return json({
      status: 'error',
      exchangeCode: null,
      error: String(row.error_message),
    });
  }

  if (row.exchange_code) {
    return json({
      status: 'ready',
      exchangeCode: String(row.exchange_code),
      error: null,
    });
  }

  return json({
    status: 'pending',
    exchangeCode: null,
    error: null,
  });
}

async function exchangeSocialLogin(env, request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return error('Invalid JSON payload.');
  }

  const code = String(payload.code ?? '').trim();
  if (!code) {
    return error('Exchange code is required.');
  }

  const row = await env.DB.prepare(
    `SELECT auth_exchange_codes.id AS exchange_code_row_id,
            auth_exchange_codes.user_id,
            auth_exchange_codes.expires_at,
            users.id AS id,
            users.role,
            users.first_name,
            users.last_name,
            users.email,
            users.phone,
            users.age,
            users.grade
     FROM auth_exchange_codes
     INNER JOIN users ON users.id = auth_exchange_codes.user_id
     WHERE auth_exchange_codes.code = ? AND auth_exchange_codes.used_at IS NULL
     LIMIT 1`
  )
    .bind(code)
    .first();

  if (!row) {
    return error('This sign-in code is invalid or already used.', 401);
  }

  if (Number(row.expires_at ?? 0) < Math.floor(Date.now() / 1000)) {
    await env.DB.prepare(
      `UPDATE auth_exchange_codes
       SET used_at = ?
       WHERE id = ?`
    )
      .bind(new Date().toISOString(), row.exchange_code_row_id)
      .run();
    return error('This sign-in code has expired. Please try again.', 401);
  }

  await env.DB.prepare(
    `UPDATE auth_exchange_codes
     SET used_at = ?
     WHERE id = ?`
  )
    .bind(new Date().toISOString(), row.exchange_code_row_id)
    .run();

  const user = mapUser(row);
  const session = await createSession(env, user);
  const team = await getPrimaryTeam(env, user.id);

  return json({
    ...session,
    team,
  });
}

async function sendPasswordResetEmail(env, toEmail, code) {
  const resendAPIKey = String(env.RESEND_API_KEY ?? '').trim();
  const fromEmail = String(env.PASSWORD_RESET_FROM_EMAIL ?? '').trim();

  if (!resendAPIKey || !fromEmail) {
    throw new Error('Password reset email is not configured on the server.');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendAPIKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [toEmail],
      subject: 'SplitTime Team password reset code',
      text: `Your SplitTime Team password reset code is: ${code}\n\nThis code expires in 15 minutes.`,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || 'Could not send password reset email.');
  }
}

async function requestPasswordReset(env, request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return error('Invalid JSON payload.');
  }

  const email = normalizeEmail(payload.email ?? '');
  if (!email) {
    return error('Email is required.');
  }

  const user = await env.DB.prepare(
    `SELECT id
     FROM users
     WHERE email = ?
     LIMIT 1`
  )
    .bind(email)
    .first();

  if (!user) {
    return json({ ok: true });
  }

  const code = randomNumericCode(6);
  const codeHash = await sha256Hex(`${user.id}:${code}`);
  const expiresAt = Math.floor(Date.now() / 1000) + 15 * 60;
  const nowISO = new Date().toISOString();

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE password_reset_codes
       SET used_at = ?
       WHERE user_id = ? AND used_at IS NULL`
    ).bind(nowISO, user.id),
    env.DB.prepare(
      `INSERT INTO password_reset_codes (
        id, user_id, code_hash, expires_at, created_at
       ) VALUES (?, ?, ?, ?, ?)`
    ).bind(crypto.randomUUID(), user.id, codeHash, expiresAt, nowISO),
  ]);

  try {
    await sendPasswordResetEmail(env, email, code);
  } catch (err) {
    return error(err instanceof Error ? err.message : 'Could not send password reset email.', 500);
  }

  return json({ ok: true });
}

async function confirmPasswordReset(env, request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return error('Invalid JSON payload.');
  }

  const email = normalizeEmail(payload.email ?? '');
  const code = String(payload.code ?? '').trim();
  const newPassword = String(payload.newPassword ?? '');

  if (!email || !code || !newPassword) {
    return error('Email, code, and new password are required.');
  }

  if (newPassword.length < 6) {
    return error('New password must be at least 6 characters.');
  }

  const user = await env.DB.prepare(
    `SELECT id
     FROM users
     WHERE email = ?
     LIMIT 1`
  )
    .bind(email)
    .first();

  if (!user) {
    return error('Invalid reset code or email.', 401);
  }

  const codeHash = await sha256Hex(`${user.id}:${code}`);
  const codeRow = await env.DB.prepare(
    `SELECT id, expires_at
     FROM password_reset_codes
     WHERE user_id = ? AND code_hash = ? AND used_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`
  )
    .bind(user.id, codeHash)
    .first();

  if (!codeRow) {
    return error('Invalid reset code or email.', 401);
  }

  if (Number(codeRow.expires_at ?? 0) < Math.floor(Date.now() / 1000)) {
    await env.DB.prepare(
      `UPDATE password_reset_codes
       SET used_at = ?
       WHERE id = ?`
    )
      .bind(new Date().toISOString(), codeRow.id)
      .run();
    return error('This reset code has expired.', 401);
  }

  const salt = crypto.randomUUID();
  const passwordHash = await hashPassword(newPassword, salt);
  const nowISO = new Date().toISOString();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO user_credentials (user_id, password_hash, password_salt)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
        password_hash = excluded.password_hash,
        password_salt = excluded.password_salt`
    ).bind(user.id, passwordHash, salt),
    env.DB.prepare(
      `UPDATE password_reset_codes
       SET used_at = ?
       WHERE id = ?`
    ).bind(nowISO, codeRow.id),
    env.DB.prepare(
      `UPDATE auth_sessions
       SET revoked_at = ?
       WHERE user_id = ? AND revoked_at IS NULL`
    ).bind(nowISO, user.id),
  ]);

  return json({ ok: true });
}

async function signupCoach(env, payload) {
  const teamName = payload.teamName?.trim();
  const firstName = payload.firstName?.trim();
  const lastName = payload.lastName?.trim();
  const email = normalizeEmail(payload.email ?? '');
  const password = payload.password ?? '';
  const phone = payload.phone?.trim() || null;

  if (!teamName || !firstName || !lastName || !email || !password) {
    return error('Missing required fields.');
  }

  const existing = await env.DB.prepare(
    'SELECT id FROM users WHERE email = ? LIMIT 1'
  )
    .bind(email)
    .first();

  if (existing) {
    return error('An account with that email already exists.', 409);
  }

  const userId = crypto.randomUUID();
  const teamId = crypto.randomUUID();
  const teamMemberId = crypto.randomUUID();
  const salt = crypto.randomUUID();
  const passwordHash = await hashPassword(password, salt);
  const joinCode = await createUniqueJoinCode(env);

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (id, role, first_name, last_name, email, phone)
       VALUES (?, 'coach', ?, ?, ?, ?)`
    ).bind(userId, firstName, lastName, email, phone),
    env.DB.prepare(
      `INSERT INTO user_credentials (user_id, password_hash, password_salt)
       VALUES (?, ?, ?)`
    ).bind(userId, passwordHash, salt),
    env.DB.prepare(
      `INSERT INTO teams (id, name, coach_user_id)
       VALUES (?, ?, ?)`
    ).bind(teamId, teamName, userId),
    env.DB.prepare(
      `INSERT INTO team_members (id, team_id, user_id, role)
       VALUES (?, ?, ?, 'coach')`
    ).bind(teamMemberId, teamId, userId),
    env.DB.prepare(
      `INSERT INTO join_codes (id, team_id, code, is_active)
       VALUES (?, ?, ?, 1)`
    ).bind(crypto.randomUUID(), teamId, joinCode),
  ]);

  const user = {
    id: userId,
    role: 'coach',
    firstName,
    lastName,
    email,
    phone,
    age: null,
    grade: null,
  };

  const session = await createSession(env, user);

  return json({
    ...session,
    team: {
      id: teamId,
      name: teamName,
      joinCode,
    },
  });
}

async function signupAthlete(env, payload) {
  const teamCode = normalizeCode(payload.teamCode ?? '');
  const firstName = payload.firstName?.trim();
  const lastName = payload.lastName?.trim();
  const email = normalizeEmail(payload.email ?? '');
  const password = payload.password ?? '';
  const phone = payload.phone?.trim() || null;
  const age = Number(payload.age);
  const grade = payload.grade?.trim() || null;

  if (!teamCode || !firstName || !lastName || !email || !password || !age || !grade) {
    return error('Missing required fields.');
  }

  const existing = await env.DB.prepare(
    'SELECT id FROM users WHERE email = ? LIMIT 1'
  )
    .bind(email)
    .first();

  if (existing) {
    return error('An account with that email already exists.', 409);
  }

  const joinCodeRow = await env.DB.prepare(
    `SELECT join_codes.team_id, teams.name
     FROM join_codes
     INNER JOIN teams ON teams.id = join_codes.team_id
     WHERE join_codes.code = ? AND join_codes.is_active = 1
     LIMIT 1`
  )
    .bind(teamCode)
    .first();

  if (!joinCodeRow) {
    return error('That team code is not valid.', 404);
  }

  const userId = crypto.randomUUID();
  const teamMemberId = crypto.randomUUID();
  const salt = crypto.randomUUID();
  const passwordHash = await hashPassword(password, salt);

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (id, role, first_name, last_name, email, phone, age, grade)
       VALUES (?, 'athlete', ?, ?, ?, ?, ?, ?)`
    ).bind(userId, firstName, lastName, email, phone, age, grade),
    env.DB.prepare(
      `INSERT INTO user_credentials (user_id, password_hash, password_salt)
       VALUES (?, ?, ?)`
    ).bind(userId, passwordHash, salt),
    env.DB.prepare(
      `INSERT INTO team_members (id, team_id, user_id, role)
       VALUES (?, ?, ?, 'athlete')`
    ).bind(teamMemberId, joinCodeRow.team_id, userId),
  ]);

  const user = {
    id: userId,
    role: 'athlete',
    firstName,
    lastName,
    email,
    phone,
    age,
    grade,
  };

  const session = await createSession(env, user);

  return json({
    ...session,
    team: {
      id: joinCodeRow.team_id,
      name: joinCodeRow.name,
      joinCode: null,
    },
  });
}

async function login(env, payload) {
  const email = normalizeEmail(payload.email ?? '');
  const password = payload.password ?? '';

  if (!email || !password) {
    return error('Email and password are required.');
  }

  const row = await env.DB.prepare(
    `SELECT users.id, users.role, users.first_name, users.last_name, users.email,
            users.phone, users.age, users.grade,
            user_credentials.password_hash, user_credentials.password_salt
     FROM users
     INNER JOIN user_credentials ON user_credentials.user_id = users.id
     WHERE users.email = ?
     LIMIT 1`
  )
    .bind(email)
    .first();

  if (!row) {
    return error('Invalid email or password.', 401);
  }

  const computedHash = await hashPassword(password, row.password_salt);

  if (computedHash !== row.password_hash) {
    return error('Invalid email or password.', 401);
  }

  const user = mapUser(row);
  const session = await createSession(env, user);
  const team = await getPrimaryTeam(env, user.id);

  return json({
    ...session,
    team,
  });
}

async function getAuthenticatedUser(env, request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    return { error: 'Missing authorization token.', status: 401 };
  }

  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT users.id, users.role, users.first_name, users.last_name, users.email,
            users.phone, users.age, users.grade
     FROM auth_sessions
     INNER JOIN users ON users.id = auth_sessions.user_id
     WHERE auth_sessions.token_hash = ? AND auth_sessions.revoked_at IS NULL
     LIMIT 1`
  )
    .bind(tokenHash)
    .first();

  if (!row) {
    return { error: 'Session not found.', status: 401 };
  }

  return { row };
}

async function me(env, request) {
  const auth = await getAuthenticatedUser(env, request);

  if (auth.error) {
    return error(auth.error, auth.status);
  }

  const user = mapUser(auth.row);
  const team = await getPrimaryTeam(env, user.id);

  return json({
    user,
    team,
  });
}

async function teamRoster(env, request) {
  const auth = await getAuthenticatedUser(env, request);

  if (auth.error) {
    return error(auth.error, auth.status);
  }

  const currentUser = mapUser(auth.row);
  const team = await getPrimaryTeam(env, currentUser.id);

  if (!team) {
    return error('Team not found.', 404);
  }

  const rows = await env.DB.prepare(
    `SELECT users.id, users.role, users.first_name, users.last_name, users.email,
            users.phone, users.age, users.grade
     FROM team_members
     INNER JOIN users ON users.id = team_members.user_id
     WHERE team_members.team_id = ?
     ORDER BY CASE users.role WHEN 'coach' THEN 0 ELSE 1 END, users.last_name ASC, users.first_name ASC`
  )
    .bind(team.id)
    .all();

  const members = (rows.results ?? []).map(mapUser);
  return json(members);
}

async function listAnnouncements(env, request) {
  const auth = await getAuthenticatedUser(env, request);

  if (auth.error) {
    return error(auth.error, auth.status);
  }

  const currentUser = mapUser(auth.row);
  const team = await getPrimaryTeam(env, currentUser.id);

  if (!team) {
    return error('Team not found.', 404);
  }

  const rows = await env.DB.prepare(
    `SELECT id, team_id, title, body, author_user_id, author_name, created_at
     FROM announcements
     WHERE team_id = ?
     ORDER BY datetime(created_at) DESC`
  )
    .bind(team.id)
    .all();

  const announcements = (rows.results ?? []).map(mapAnnouncement);
  return json(announcements);
}

async function createAnnouncement(env, request) {
  const auth = await getAuthenticatedUser(env, request);

  if (auth.error) {
    return error(auth.error, auth.status);
  }

  const currentUser = mapUser(auth.row);

  if (currentUser.role !== 'coach') {
    return error('Only coaches can post announcements.', 403);
  }

  const team = await getPrimaryTeam(env, currentUser.id);

  if (!team) {
    return error('Team not found.', 404);
  }

  const payload = await request.json();
  const title = payload.title?.trim();
  const body = payload.body?.trim();

  if (!title || !body) {
    return error('Title and body are required.');
  }

  const announcement = {
    id: crypto.randomUUID(),
    teamId: team.id,
    title,
    body,
    authorUserId: currentUser.id,
    authorName: `${currentUser.firstName} ${currentUser.lastName}`.trim() || 'Coach',
    createdAt: new Date().toISOString(),
  };

  await env.DB.prepare(
    `INSERT INTO announcements (
      id, team_id, title, body, author_user_id, author_name, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      announcement.id,
      announcement.teamId,
      announcement.title,
      announcement.body,
      announcement.authorUserId,
      announcement.authorName,
      announcement.createdAt
    )
    .run();

  return json(announcement, 201);
}

async function listAnnouncementComments(env, request, announcementId) {
  const auth = await getAuthenticatedUser(env, request);

  if (auth.error) {
    return error(auth.error, auth.status);
  }

  const currentUser = mapUser(auth.row);
  const team = await getPrimaryTeam(env, currentUser.id);

  if (!team) {
    return error('Team not found.', 404);
  }

  const announcement = await env.DB.prepare(
    `SELECT id
     FROM announcements
     WHERE id = ? AND team_id = ?
     LIMIT 1`
  )
    .bind(announcementId, team.id)
    .first();

  if (!announcement) {
    return error('Announcement not found.', 404);
  }

  const rows = await env.DB.prepare(
    `SELECT id, announcement_id, team_id, author_user_id, author_name, body, created_at
     FROM announcement_comments
     WHERE team_id = ? AND announcement_id = ?
     ORDER BY datetime(created_at) ASC`
  )
    .bind(team.id, announcementId)
    .all();

  return json((rows.results ?? []).map(mapAnnouncementComment));
}

async function createAnnouncementComment(env, request, announcementId) {
  const auth = await getAuthenticatedUser(env, request);

  if (auth.error) {
    return error(auth.error, auth.status);
  }

  const currentUser = mapUser(auth.row);
  const team = await getPrimaryTeam(env, currentUser.id);

  if (!team) {
    return error('Team not found.', 404);
  }

  const announcement = await env.DB.prepare(
    `SELECT id
     FROM announcements
     WHERE id = ? AND team_id = ?
     LIMIT 1`
  )
    .bind(announcementId, team.id)
    .first();

  if (!announcement) {
    return error('Announcement not found.', 404);
  }

  const payload = await request.json();
  const body = String(payload.body ?? '').trim();

  if (!body) {
    return error('Comment body is required.');
  }

  const comment = {
    id: crypto.randomUUID(),
    announcementId,
    teamId: team.id,
    authorUserId: currentUser.id,
    authorName: `${currentUser.firstName} ${currentUser.lastName}`.trim() || 'Team Member',
    body,
    createdAt: new Date().toISOString(),
  };

  await env.DB.prepare(
    `INSERT INTO announcement_comments (
      id, announcement_id, team_id, author_user_id, author_name, body, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      comment.id,
      comment.announcementId,
      comment.teamId,
      comment.authorUserId,
      comment.authorName,
      comment.body,
      comment.createdAt
    )
    .run();

  return json(comment, 201);
}

async function listChatMessages(env, request) {
  const auth = await getAuthenticatedUser(env, request);

  if (auth.error) {
    return error(auth.error, auth.status);
  }

  const currentUser = mapUser(auth.row);
  const team = await getPrimaryTeam(env, currentUser.id);

  if (!team) {
    return error('Team not found.', 404);
  }

  const rows = await env.DB.prepare(
    `SELECT id, team_id, sender_user_id, sender_name, sender_role, body, image_url, created_at
     FROM chat_messages
     WHERE team_id = ?
     ORDER BY datetime(created_at) ASC`
  )
    .bind(team.id)
    .all();

  const messages = (rows.results ?? []).map(mapChatMessage);
  return json(messages);
}

async function createChatMessage(env, request) {
  const auth = await getAuthenticatedUser(env, request);

  if (auth.error) {
    return error(auth.error, auth.status);
  }

  const currentUser = mapUser(auth.row);
  const team = await getPrimaryTeam(env, currentUser.id);

  if (!team) {
    return error('Team not found.', 404);
  }

  const payload = await extractChatPayload(request);
  const body = payload.body ?? '';

  if (!body && !payload.image) {
    return error('Message body or image is required.');
  }

  const message = {
    id: crypto.randomUUID(),
    teamId: team.id,
    senderUserId: currentUser.id,
    senderName: `${currentUser.firstName} ${currentUser.lastName}`.trim() || 'Team Member',
    senderRole: currentUser.role,
    body,
    imageKey: null,
    imageUrl: null,
    createdAt: new Date().toISOString(),
  };

  if (payload.image) {
    try {
      const upload = await uploadChatImage(env, request, team.id, message.id, payload.image);
      message.imageKey = upload.imageKey;
      message.imageUrl = upload.imageUrl;
    } catch (err) {
      return error(err instanceof Error ? err.message : 'Could not upload image.', 500);
    }
  }

  await env.DB.prepare(
    `INSERT INTO chat_messages (
      id, team_id, sender_user_id, sender_name, sender_role, body, image_key, image_url, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      message.id,
      message.teamId,
      message.senderUserId,
      message.senderName,
      message.senderRole,
      message.body,
      message.imageKey,
      message.imageUrl,
      message.createdAt
    )
    .run();

  return json(message, 201);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: jsonHeaders,
      });
    }

    try {
      const url = new URL(request.url);
      const pathSegments = url.pathname.split('/').filter(Boolean);

      if (request.method === 'GET' && url.pathname === '/') {
        return json({
          ok: true,
          service: 'splitteam-api',
          message: 'SplitTeam backend is running',
        });
      }

      if (request.method === 'GET' && url.pathname === '/health') {
        let dbStatus = 'unknown';

        try {
          await env.DB.prepare('SELECT 1 as ok').first();
          dbStatus = 'connected';
        } catch {
          dbStatus = 'error';
        }

        return json({
          ok: true,
          service: 'splitteam-api',
          database: dbStatus,
          storage: !!env.FILES,
          stravaConfigured: !!env.STRAVA_CLIENT_ID && !!env.STRAVA_CLIENT_SECRET,
          googleConfigured: !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET,
          appleConfigured: !!env.APPLE_CLIENT_ID && !!env.APPLE_CLIENT_SECRET,
          passwordResetConfigured: !!env.RESEND_API_KEY && !!env.PASSWORD_RESET_FROM_EMAIL,
          publicBaseURL: String(env.PUBLIC_BASE_URL ?? '').trim() || null,
        });
      }

    if (request.method === 'POST' && url.pathname === '/auth/signup') {
      const payload = await request.json();
      if (payload.role === 'coach') return signupCoach(env, payload);
      if (payload.role === 'athlete') return signupAthlete(env, payload);
      return error('Invalid role.');
    }

    if (request.method === 'POST' && url.pathname === '/auth/login') {
      const payload = await request.json();
      return login(env, payload);
    }

    if (request.method === 'GET' && url.pathname === '/auth/me') {
      return me(env, request);
    }

    if (request.method === 'POST' && url.pathname === '/auth/social/start') {
      return startSocialLogin(env, request);
    }

    if (request.method === 'POST' && url.pathname === '/auth/social/exchange') {
      return exchangeSocialLogin(env, request);
    }

    if (request.method === 'GET' && url.pathname === '/auth/social/poll') {
      return socialPoll(env, request);
    }

    if (request.method === 'GET' && url.pathname === '/auth/social/finish') {
      const message = String(url.searchParams.get('error') ?? '').trim();
      if (message) {
        return htmlResponse(socialResultPage(false, message), 400);
      }
      return htmlResponse(socialResultPage(true, 'Returning to app…'));
    }

    if (
      pathSegments[0] === 'auth' &&
      pathSegments[1] === 'social' &&
      pathSegments[2] &&
      pathSegments[3] === 'callback' &&
      pathSegments.length === 4 &&
      (request.method === 'GET' || request.method === 'POST')
    ) {
      return socialCallback(env, request, pathSegments[2]);
    }

    if (request.method === 'POST' && url.pathname === '/auth/forgot-password/request') {
      return requestPasswordReset(env, request);
    }

    if (request.method === 'POST' && url.pathname === '/auth/forgot-password/confirm') {
      return confirmPasswordReset(env, request);
    }

    if (request.method === 'GET' && url.pathname === '/team/roster') {
      return teamRoster(env, request);
    }

    if (request.method === 'GET' && url.pathname === '/team/state') {
      return listTeamState(env, request);
    }

	    if (request.method === 'POST' && url.pathname === '/team/sync') {
	      return syncTeamState(env, request);
	    }

	    if (request.method === 'GET' && url.pathname === '/workouts/templates') {
	      return listTemplateLibrary(env, request);
	    }

	    if (request.method === 'POST' && url.pathname === '/workouts/templates/sync') {
	      return syncTemplateLibrary(env, request);
	    }

	    if (request.method === 'GET' && url.pathname === '/team/branding') {
	      return getTeamBranding(env, request);
	    }

	    if (request.method === 'PUT' && url.pathname === '/team/branding') {
	      return updateTeamBranding(env, request);
	    }

	    if (request.method === 'GET' && url.pathname === '/attendance') {
	      return listAttendance(env, request);
	    }

	    if (request.method === 'POST' && url.pathname === '/attendance/mark') {
	      return markAttendance(env, request);
	    }

    if (request.method === 'GET' && url.pathname === '/integrations/strava/status') {
      return stravaStatus(env, request);
    }

    if (request.method === 'GET' && url.pathname === '/integrations/strava/connect') {
      return stravaConnect(env, request);
    }

    if (request.method === 'GET' && url.pathname === '/integrations/strava/callback') {
      return stravaCallback(env, request);
    }

    if (request.method === 'POST' && url.pathname === '/integrations/strava/sync') {
      return stravaSync(env, request);
    }

    if (request.method === 'POST' && url.pathname === '/integrations/strava/disconnect') {
      return stravaDisconnect(env, request);
    }

	    if (request.method === 'GET' && url.pathname === '/activities/feed') {
	      return listActivityFeed(env, request);
	    }

	    if (request.method === 'POST' && url.pathname === '/workouts/completed') {
	      return uploadCompletedWorkout(env, request);
	    }

	    if (
	      pathSegments[0] === 'activities' &&
	      pathSegments[1] &&
	      pathSegments[2] === 'workout-detail' &&
	      pathSegments.length === 3 &&
	      request.method === 'GET'
	    ) {
	      return getWorkoutActivityDetail(env, request, pathSegments[1]);
	    }

	    if (
	      pathSegments[0] === 'activities' &&
	      pathSegments[1] &&
	      pathSegments[2] === 'comments' &&
	      pathSegments.length === 3
	    ) {
      if (request.method === 'GET') {
        return listActivityComments(env, request, pathSegments[1]);
      }

      if (request.method === 'POST') {
        return createActivityComment(env, request, pathSegments[1]);
      }
    }

    if (request.method === 'GET' && url.pathname === '/announcements') {
      return listAnnouncements(env, request);
    }

    if (request.method === 'POST' && url.pathname === '/announcements') {
      return createAnnouncement(env, request);
    }

    if (
      pathSegments[0] === 'announcements' &&
      pathSegments[1] &&
      pathSegments[2] === 'comments' &&
      pathSegments.length === 3
    ) {
      if (request.method === 'GET') {
        return listAnnouncementComments(env, request, pathSegments[1]);
      }

      if (request.method === 'POST') {
        return createAnnouncementComment(env, request, pathSegments[1]);
      }
    }

    if (request.method === 'GET' && url.pathname === '/chat/messages') {
      return listChatMessages(env, request);
    }

    if (request.method === 'POST' && url.pathname === '/chat/messages') {
      return createChatMessage(env, request);
    }

    if (request.method === 'GET' && url.pathname === '/chat/image') {
      return serveChatImage(env, request);
    }

    if (request.method === 'GET' && url.pathname === '/schedule') {
      return listSchedule(env, request);
    }

    if (request.method === 'POST' && url.pathname === '/schedule/events') {
      return createScheduleEvent(env, request);
    }

    if (request.method === 'DELETE' && url.pathname === '/schedule/events') {
      return deleteAllScheduleEvents(env, request);
    }

    if (
      pathSegments[0] === 'schedule' &&
      pathSegments[1] === 'events' &&
      pathSegments[2] &&
      pathSegments.length === 3
    ) {
      if (request.method === 'PUT') {
        return updateScheduleEvent(env, request, pathSegments[2]);
      }

      if (request.method === 'DELETE') {
        return deleteScheduleEvent(env, request, pathSegments[2]);
      }
    }

    if (request.method === 'POST' && url.pathname === '/schedule/occurrences') {
      return upsertScheduleOccurrence(env, request);
    }

    if (request.method === 'POST' && url.pathname === '/schedule/occurrences/delete') {
      return deleteScheduleOccurrence(env, request);
    }

      return error('Not found.', 404);
    } catch (err) {
      console.error('Unhandled worker error', err);
      return error(err instanceof Error ? err.message : 'Internal server error.', 500);
    }
  },
};
