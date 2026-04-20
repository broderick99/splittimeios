import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Athlete, Group } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { useDatabase } from '@/context/DatabaseContext';
import * as athleteDb from '@/db/athletes';
import * as groupDb from '@/db/groups';
import { generateId } from '@/utils/id';
import { GroupColors } from '@/constants/colors';

export interface TeamRosterMember {
  id: string;
  role: 'coach' | 'athlete';
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  age: number | null;
  grade: string | null;
}

interface RosterContextValue {
  athletes: Athlete[];
  groups: Group[];
  teamRosterMembers: TeamRosterMember[];
  isSyncingTeamRoster: boolean;
  teamRosterError: string | null;
  hasLoadedTeamRoster: boolean;
  addAthlete: (
    name: string,
    groupId: string | null,
    photoUri?: string | null,
    details?: {
      remoteUserId?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      email?: string | null;
      phone?: string | null;
      age?: number | null;
      grade?: string | null;
    }
  ) => Promise<Athlete>;
  updateAthlete: (
    id: string,
    updates: {
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
  ) => Promise<void>;
  deleteAthlete: (id: string) => Promise<void>;
  addGroup: (name: string, color?: string) => Promise<Group>;
  updateGroup: (id: string, updates: { name?: string; color?: string }) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
  setGroupMembers: (groupId: string, athleteIds: string[]) => Promise<void>;
  syncTeamRoster: () => Promise<{ added: number; updated: number }>;
  refreshRoster: () => Promise<void>;
}

const RosterContext = createContext<RosterContextValue | null>(null);

export function RosterProvider({ children }: { children: React.ReactNode }) {
  const db = useDatabase();
  const { apiBaseUrl, session } = useAuth();
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [teamRosterMembers, setTeamRosterMembers] = useState<TeamRosterMember[]>([]);
  const [isSyncingTeamRoster, setIsSyncingTeamRoster] = useState(false);
  const [teamRosterError, setTeamRosterError] = useState<string | null>(null);
  const [hasLoadedTeamRoster, setHasLoadedTeamRoster] = useState(false);
  const inFlightSyncRef = useRef<Promise<{ added: number; updated: number }> | null>(null);

  const refreshRoster = useCallback(async () => {
    const [a, g] = await Promise.all([athleteDb.getAllAthletes(db), groupDb.getAllGroups(db)]);
    setAthletes(a);
    setGroups(g);
  }, [db]);

  useEffect(() => {
    refreshRoster();
  }, [refreshRoster]);

  const addAthlete = useCallback(
    async (
      name: string,
      groupId: string | null,
      photoUri?: string | null,
      details?: {
        remoteUserId?: string | null;
        firstName?: string | null;
        lastName?: string | null;
        email?: string | null;
        phone?: string | null;
        age?: number | null;
        grade?: string | null;
      }
    ): Promise<Athlete> => {
      const athlete: Athlete = {
        id: generateId(),
        remoteUserId: details?.remoteUserId ?? null,
        name: name.trim(),
        firstName: details?.firstName ?? null,
        lastName: details?.lastName ?? null,
        email: details?.email ?? null,
        phone: details?.phone ?? null,
        age: details?.age ?? null,
        grade: details?.grade ?? null,
        groupId,
        photoUri: photoUri ?? null,
        createdAt: Date.now(),
      };
      await athleteDb.insertAthlete(db, athlete);
      setAthletes((prev) => [...prev, athlete].sort((a, b) => a.name.localeCompare(b.name)));
      return athlete;
    },
    [db]
  );

  const updateAthlete = useCallback(
    async (
      id: string,
      updates: {
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
    ) => {
      const cleaned: {
        name?: string;
        firstName?: string | null;
        lastName?: string | null;
        email?: string | null;
        phone?: string | null;
        age?: number | null;
        grade?: string | null;
        groupId?: string | null;
        photoUri?: string | null;
      } = {};
      if (updates.name !== undefined) cleaned.name = updates.name.trim();
      if (updates.firstName !== undefined) cleaned.firstName = updates.firstName?.trim() || null;
      if (updates.lastName !== undefined) cleaned.lastName = updates.lastName?.trim() || null;
      if (updates.email !== undefined) cleaned.email = updates.email?.trim() || null;
      if (updates.phone !== undefined) cleaned.phone = updates.phone?.trim() || null;
      if (updates.age !== undefined) cleaned.age = updates.age;
      if (updates.grade !== undefined) cleaned.grade = updates.grade?.trim() || null;
      if (updates.groupId !== undefined) cleaned.groupId = updates.groupId;
      if (updates.photoUri !== undefined) cleaned.photoUri = updates.photoUri;
      await athleteDb.updateAthlete(db, id, cleaned);
      setAthletes((prev) =>
        prev
          .map((a) => (a.id === id ? { ...a, ...cleaned } : a))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    },
    [db]
  );

  const deleteAthlete = useCallback(
    async (id: string) => {
      await athleteDb.deleteAthlete(db, id);
      setAthletes((prev) => prev.filter((a) => a.id !== id));
    },
    [db]
  );

  const addGroup = useCallback(
    async (name: string, color?: string): Promise<Group> => {
      const group: Group = {
        id: generateId(),
        name: name.trim(),
        color: color || GroupColors[groups.length % GroupColors.length],
        sortOrder: groups.length,
      };
      await groupDb.insertGroup(db, group);
      setGroups((prev) => [...prev, group]);
      return group;
    },
    [db, groups.length]
  );

  const updateGroup = useCallback(
    async (id: string, updates: { name?: string; color?: string }) => {
      const cleaned: { name?: string; color?: string } = {};
      if (updates.name !== undefined) cleaned.name = updates.name.trim();
      if (updates.color !== undefined) cleaned.color = updates.color;
      await groupDb.updateGroup(db, id, cleaned);
      setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...cleaned } : g)));
    },
    [db]
  );

  const deleteGroup = useCallback(
    async (id: string) => {
      await groupDb.deleteGroup(db, id);
      setGroups((prev) => prev.filter((g) => g.id !== id));
      setAthletes((prev) => prev.map((a) => (a.groupId === id ? { ...a, groupId: null } : a)));
    },
    [db]
  );

  const setGroupMembers = useCallback(
    async (groupId: string, athleteIds: string[]) => {
      const currentMembers = athletes.filter((a) => a.groupId === groupId).map((a) => a.id);
      const toRemove = currentMembers.filter((id) => !athleteIds.includes(id));
      const toAdd = athleteIds.filter((id) => !currentMembers.includes(id));

      if (toRemove.length > 0) {
        await athleteDb.updateAthletesGroup(db, toRemove, null);
      }
      if (toAdd.length > 0) {
        await athleteDb.updateAthletesGroup(db, toAdd, groupId);
      }

      setAthletes((prev) =>
        prev.map((a) => {
          if (athleteIds.includes(a.id)) return { ...a, groupId };
          if (a.groupId === groupId && !athleteIds.includes(a.id)) return { ...a, groupId: null };
          return a;
        })
      );
    },
    [db, athletes]
  );

  const syncTeamRoster = useCallback(async () => {
    if (!apiBaseUrl || !session) {
      setTeamRosterMembers([]);
      setTeamRosterError(null);
      setHasLoadedTeamRoster(false);
      return { added: 0, updated: 0 };
    }

    if (inFlightSyncRef.current) {
      return inFlightSyncRef.current;
    }

    const syncPromise = (async () => {
      try {
        setIsSyncingTeamRoster(true);
        setTeamRosterError(null);

        const response = await fetch(`${apiBaseUrl}/team/roster`, {
          headers: {
            Authorization: `Bearer ${session.token}`,
          },
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || 'Could not sync the team roster.');
        }

        const members = (Array.isArray(data) ? data : []) as TeamRosterMember[];
        setTeamRosterMembers(members);
        setHasLoadedTeamRoster(true);

        const remoteAthletes = members
          .filter((member) => member.role === 'athlete')
          .map((member) => ({
            remoteUserId: member.id,
            firstName: member.firstName ?? null,
            lastName: member.lastName ?? null,
            name: `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim(),
            email: member.email ?? null,
            phone: member.phone ?? null,
            age: member.age ?? null,
            grade: member.grade ?? null,
          }))
          .filter((member) => member.remoteUserId && member.name);

        const result = await athleteDb.syncRemoteRosterAthletes(db, remoteAthletes);
        await refreshRoster();
        return result;
      } catch (error) {
        setTeamRosterError(
          error instanceof Error ? error.message : 'Could not sync the team roster.'
        );
        throw error;
      } finally {
        setIsSyncingTeamRoster(false);
        inFlightSyncRef.current = null;
      }
    })();

    inFlightSyncRef.current = syncPromise;
    return syncPromise;
  }, [apiBaseUrl, db, refreshRoster, session]);

  useEffect(() => {
    if (!session) {
      setTeamRosterMembers([]);
      setTeamRosterError(null);
      setHasLoadedTeamRoster(false);
      return;
    }

    void syncTeamRoster().catch(() => {
      // Keep the coach flow usable even if the network is unavailable.
    });
  }, [session, syncTeamRoster]);

  return (
    <RosterContext.Provider
      value={{
        athletes,
        groups,
        teamRosterMembers,
        isSyncingTeamRoster,
        teamRosterError,
        hasLoadedTeamRoster,
        addAthlete,
        updateAthlete,
        deleteAthlete,
        addGroup,
        updateGroup,
        deleteGroup,
        setGroupMembers,
        syncTeamRoster,
        refreshRoster,
      }}
    >
      {children}
    </RosterContext.Provider>
  );
}

export function useRoster() {
  const ctx = useContext(RosterContext);
  if (!ctx) throw new Error('useRoster must be used within RosterProvider');
  return ctx;
}
