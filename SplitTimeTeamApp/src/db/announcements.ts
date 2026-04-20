import type { SQLiteDatabase } from 'expo-sqlite';
import type { Announcement } from '@/types';

export async function getAnnouncementsByTeam(
  db: SQLiteDatabase,
  teamId: string
): Promise<Announcement[]> {
  const rows = await db.getAllAsync<{
    id: string;
    team_id: string;
    title: string;
    body: string;
    author_name: string;
    created_at: number;
  }>(
    `SELECT id, team_id, title, body, author_name, created_at
     FROM announcements
     WHERE team_id = ?
     ORDER BY created_at DESC`,
    teamId
  );

  return rows.map((row) => ({
    id: row.id,
    teamId: row.team_id,
    title: row.title,
    body: row.body,
    authorName: row.author_name,
    createdAt: row.created_at,
  }));
}

export async function insertAnnouncement(
  db: SQLiteDatabase,
  announcement: Announcement
): Promise<void> {
  await db.runAsync(
    `INSERT INTO announcements (id, team_id, title, body, author_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    announcement.id,
    announcement.teamId,
    announcement.title,
    announcement.body,
    announcement.authorName,
    announcement.createdAt
  );
}
