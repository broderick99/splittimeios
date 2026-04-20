import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import type { Announcement } from '@/types';

interface CreateAnnouncementInput {
  title: string;
  body: string;
}

interface AnnouncementContextValue {
  announcements: Announcement[];
  isLoadingAnnouncements: boolean;
  createAnnouncement: (input: CreateAnnouncementInput) => Promise<void>;
  refreshAnnouncements: () => Promise<void>;
}

const AnnouncementContext = createContext<AnnouncementContextValue | null>(null);

async function parseResponse(response: Response) {
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.error || `Request failed with status ${response.status}.`);
  }

  return data;
}

export function AnnouncementProvider({ children }: { children: React.ReactNode }) {
  const { apiBaseUrl, session } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isLoadingAnnouncements, setIsLoadingAnnouncements] = useState(false);

  const teamId = session?.team?.id ?? null;

  const refreshAnnouncements = useCallback(async () => {
    if (!teamId || !apiBaseUrl || !session) {
      setAnnouncements([]);
      return;
    }

    setIsLoadingAnnouncements(true);
    try {
      const response = await fetch(`${apiBaseUrl}/announcements`, {
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      });
      const data = await parseResponse(response);
      const nextAnnouncements = (Array.isArray(data) ? data : []).map((item) => ({
        id: String(item.id),
        teamId: String(item.teamId ?? item.team_id ?? ''),
        title: String(item.title ?? ''),
        body: String(item.body ?? ''),
        authorName: String(item.authorName ?? item.author_name ?? ''),
        createdAt: Date.parse(item.createdAt ?? item.created_at ?? '') || Date.now(),
      })) as Announcement[];
      setAnnouncements(nextAnnouncements);
    } finally {
      setIsLoadingAnnouncements(false);
    }
  }, [apiBaseUrl, session, teamId]);

  useEffect(() => {
    void refreshAnnouncements();
  }, [refreshAnnouncements]);

  const createAnnouncement = useCallback(
    async ({ title, body }: CreateAnnouncementInput) => {
      if (!teamId || !session || !apiBaseUrl) {
        return;
      }

      const response = await fetch(`${apiBaseUrl}/announcements`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.token}`,
          'content-type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
        }),
      });

      await parseResponse(response);
      await refreshAnnouncements();
    },
    [apiBaseUrl, refreshAnnouncements, session, teamId]
  );

  const value = useMemo(
    () => ({
      announcements,
      isLoadingAnnouncements,
      createAnnouncement,
      refreshAnnouncements,
    }),
    [announcements, createAnnouncement, isLoadingAnnouncements, refreshAnnouncements]
  );

  return <AnnouncementContext.Provider value={value}>{children}</AnnouncementContext.Provider>;
}

export function useAnnouncements() {
  const context = useContext(AnnouncementContext);

  if (!context) {
    throw new Error('useAnnouncements must be used within AnnouncementProvider');
  }

  return context;
}
