import type { SQLiteDatabase } from 'expo-sqlite';
import type { Athlete } from '@/types';
import { generateId } from '@/utils/id';

export async function getAllAthletes(db: SQLiteDatabase): Promise<Athlete[]> {
  const rows = await db.getAllAsync<{
    id: string;
    remote_user_id: string | null;
    name: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    age: number | null;
    grade: string | null;
    group_id: string | null;
    photo_uri: string | null;
    created_at: number;
  }>(
    `SELECT id, remote_user_id, name, first_name, last_name, email, phone, age, grade,
            group_id, photo_uri, created_at
     FROM athletes
     ORDER BY name ASC`
  );
  return rows.map((row) => ({
    id: row.id,
    remoteUserId: row.remote_user_id,
    name: row.name,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    age: row.age,
    grade: row.grade,
    groupId: row.group_id,
    photoUri: row.photo_uri,
    createdAt: row.created_at,
  }));
}

export async function insertAthlete(db: SQLiteDatabase, athlete: Athlete): Promise<void> {
  await db.runAsync(
    `INSERT INTO athletes (
        id, remote_user_id, name, first_name, last_name, email, phone, age, grade,
        group_id, photo_uri, created_at
      )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    athlete.id,
    athlete.remoteUserId,
    athlete.name,
    athlete.firstName,
    athlete.lastName,
    athlete.email,
    athlete.phone,
    athlete.age,
    athlete.grade,
    athlete.groupId,
    athlete.photoUri,
    athlete.createdAt
  );
}

export async function updateAthlete(
  db: SQLiteDatabase,
  id: string,
  updates: {
    remoteUserId?: string | null;
    name?: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    age?: number | null;
    grade?: string | null;
    groupId?: string | null;
    photoUri?: string | null;
  }
): Promise<void> {
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  if (updates.remoteUserId !== undefined) {
    sets.push('remote_user_id = ?');
    values.push(updates.remoteUserId);
  }
  if (updates.name !== undefined) {
    sets.push('name = ?');
    values.push(updates.name);
  }
  if (updates.firstName !== undefined) {
    sets.push('first_name = ?');
    values.push(updates.firstName);
  }
  if (updates.lastName !== undefined) {
    sets.push('last_name = ?');
    values.push(updates.lastName);
  }
  if (updates.email !== undefined) {
    sets.push('email = ?');
    values.push(updates.email);
  }
  if (updates.phone !== undefined) {
    sets.push('phone = ?');
    values.push(updates.phone);
  }
  if (updates.age !== undefined) {
    sets.push('age = ?');
    values.push(updates.age);
  }
  if (updates.grade !== undefined) {
    sets.push('grade = ?');
    values.push(updates.grade);
  }
  if (updates.groupId !== undefined) {
    sets.push('group_id = ?');
    values.push(updates.groupId);
  }
  if (updates.photoUri !== undefined) {
    sets.push('photo_uri = ?');
    values.push(updates.photoUri);
  }
  if (sets.length === 0) return;
  values.push(id);
  await db.runAsync(`UPDATE athletes SET ${sets.join(', ')} WHERE id = ?`, ...values);
}

export async function updateAthletesGroup(
  db: SQLiteDatabase,
  athleteIds: string[],
  groupId: string | null
): Promise<void> {
  if (athleteIds.length === 0) return;
  const placeholders = athleteIds.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE athletes SET group_id = ? WHERE id IN (${placeholders})`,
    groupId,
    ...athleteIds
  );
}

export async function deleteAthlete(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM athletes WHERE id = ?', id);
}

interface RemoteRosterAthlete {
  remoteUserId: string;
  firstName: string | null;
  lastName: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  age: number | null;
  grade: string | null;
}

export async function syncRemoteRosterAthletes(
  db: SQLiteDatabase,
  remoteAthletes: RemoteRosterAthlete[]
): Promise<{ added: number; updated: number }> {
  const existingRows = await db.getAllAsync<{
    id: string;
    remote_user_id: string | null;
    name: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    age: number | null;
    grade: string | null;
  }>(
    `SELECT id, remote_user_id, name, first_name, last_name, email, phone, age, grade
     FROM athletes`
  );

  const existingByRemoteId = new Map(
    existingRows
      .filter((row) => row.remote_user_id)
      .map((row) => [row.remote_user_id!, row])
  );

  const localNameCandidates = new Map<string, typeof existingRows>();
  for (const row of existingRows) {
    if (row.remote_user_id) {
      continue;
    }

    const key = row.name.trim().toLowerCase();
    const bucket = localNameCandidates.get(key);
    if (bucket) {
      bucket.push(row);
    } else {
      localNameCandidates.set(key, [row]);
    }
  }

  let added = 0;
  let updated = 0;

  await db.withTransactionAsync(async () => {
    for (const athlete of remoteAthletes) {
      const existing = existingByRemoteId.get(athlete.remoteUserId);
      if (existing) {
        const updates: Parameters<typeof updateAthlete>[2] = {};

        if (existing.email !== athlete.email) {
          updates.email = athlete.email;
        }
        if (existing.phone !== athlete.phone) {
          updates.phone = athlete.phone;
        }
        if (!existing.first_name && athlete.firstName) {
          updates.firstName = athlete.firstName;
        }
        if (!existing.last_name && athlete.lastName) {
          updates.lastName = athlete.lastName;
        }
        if (existing.age == null && athlete.age != null) {
          updates.age = athlete.age;
        }
        if (!existing.grade && athlete.grade) {
          updates.grade = athlete.grade;
        }

        const resolvedFirstName = updates.firstName ?? existing.first_name;
        const resolvedLastName = updates.lastName ?? existing.last_name;
        const resolvedName =
          `${resolvedFirstName ?? ''} ${resolvedLastName ?? ''}`.trim() || existing.name;

        if (existing.name !== resolvedName) {
          updates.name = resolvedName;
        }

        if (Object.keys(updates).length > 0) {
          await updateAthlete(db, existing.id, updates);
          updated += 1;
        }
        continue;
      }

      const nameKey = athlete.name.trim().toLowerCase();
      const nameMatches = localNameCandidates.get(nameKey) ?? [];

      if (nameMatches.length === 1) {
        await updateAthlete(db, nameMatches[0].id, {
          remoteUserId: athlete.remoteUserId,
          name: athlete.name,
        });
        updated += 1;
        continue;
      }

      await insertAthlete(db, {
        id: generateId(),
        remoteUserId: athlete.remoteUserId,
        name: athlete.name,
        firstName: athlete.firstName,
        lastName: athlete.lastName,
        email: athlete.email,
        phone: athlete.phone,
        age: athlete.age,
        grade: athlete.grade,
        groupId: null,
        photoUri: null,
        createdAt: Date.now(),
      });
      added += 1;
    }
  });

  return { added, updated };
}
