import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useDatabase } from '@/context/DatabaseContext';
import { deleteSetting, getSetting, setSetting } from '@/db/settings';
import { getApiBaseUrl } from '@/utils/app-config';

type UserRole = 'coach' | 'athlete';

export interface AuthUser {
  id: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  age: number | null;
  grade: string | null;
}

export interface AuthTeam {
  id: string;
  name: string;
  joinCode: string | null;
}

interface AuthSession {
  token: string;
  user: AuthUser;
  team: AuthTeam | null;
}

interface LoginPayload {
  email: string;
  password: string;
}

interface CoachSignupPayload extends LoginPayload {
  teamName: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

interface AthleteSignupPayload extends LoginPayload {
  teamCode: string;
  firstName: string;
  lastName: string;
  phone?: string;
  age: number;
  grade: string;
}

interface AuthContextValue {
  apiBaseUrl: string | null;
  isHydrating: boolean;
  session: AuthSession | null;
  login: (payload: LoginPayload) => Promise<void>;
  signupCoach: (payload: CoachSignupPayload) => Promise<void>;
  signupAthlete: (payload: AthleteSignupPayload) => Promise<void>;
  refreshCurrentSession: () => Promise<void>;
  logout: () => Promise<void>;
}

const AUTH_TOKEN_KEY = 'auth.token';
const AUTH_USER_KEY = 'auth.user';
const AUTH_TEAM_KEY = 'auth.team';

const AuthContext = createContext<AuthContextValue | null>(null);

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Something went wrong. Please try again.';
}

async function parseResponse(response: Response): Promise<any> {
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.error || `Request failed with status ${response.status}.`);
  }

  return data;
}

async function postJson(apiBaseUrl: string, path: string, body: unknown) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  });

  return parseResponse(response);
}

async function getJson(
  apiBaseUrl: string,
  path: string,
  token: string
) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return parseResponse(response);
}

function getMissingApiUrlMessage() {
  return 'Set expo.extra.apiBaseUrl in app.json to connect auth to your Cloudflare Worker.';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const db = useDatabase();
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);

  const persistSession = useCallback(
    async (nextSession: AuthSession | null) => {
      if (!nextSession) {
        await Promise.all([
          deleteSetting(db, AUTH_TOKEN_KEY),
          deleteSetting(db, AUTH_USER_KEY),
          deleteSetting(db, AUTH_TEAM_KEY),
        ]);
        setSession(null);
        return;
      }

      await Promise.all([
        setSetting(db, AUTH_TOKEN_KEY, nextSession.token),
        setSetting(db, AUTH_USER_KEY, JSON.stringify(nextSession.user)),
        setSetting(db, AUTH_TEAM_KEY, JSON.stringify(nextSession.team)),
      ]);
      setSession(nextSession);
    },
    [db]
  );

  const refreshSession = useCallback(
    async (token: string, fallbackUser: AuthUser, fallbackTeam: AuthTeam | null) => {
      if (!apiBaseUrl) {
        const cachedSession = {
          token,
          user: fallbackUser,
          team: fallbackTeam,
        };
        await persistSession(cachedSession);
        return cachedSession;
      }

      const data = await getJson(apiBaseUrl, '/auth/me', token);
      const refreshedSession = {
        token,
        user: data.user as AuthUser,
        team: (data.team ?? null) as AuthTeam | null,
      };

      await persistSession(refreshedSession);
      return refreshedSession;
    },
    [apiBaseUrl, persistSession]
  );

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const [token, userJson, teamJson] = await Promise.all([
          getSetting(db, AUTH_TOKEN_KEY),
          getSetting(db, AUTH_USER_KEY),
          getSetting(db, AUTH_TEAM_KEY),
        ]);

        if (!mounted) {
          return;
        }

        if (!token || !userJson) {
          setSession(null);
          return;
        }

        const cachedUser = JSON.parse(userJson) as AuthUser;
        const cachedTeam = teamJson ? (JSON.parse(teamJson) as AuthTeam | null) : null;

        try {
          const refreshed = await refreshSession(token, cachedUser, cachedTeam);
          if (mounted) {
            setSession(refreshed);
          }
        } catch {
          if (mounted) {
            setSession({
              token,
              user: cachedUser,
              team: cachedTeam,
            });
          }
        }
      } catch {
        if (mounted) {
          setSession(null);
        }
      } finally {
        if (mounted) {
          setIsHydrating(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [db, refreshSession]);

  const login = useCallback(
    async (payload: LoginPayload) => {
      if (!apiBaseUrl) {
        throw new Error(getMissingApiUrlMessage());
      }

      const data = await postJson(apiBaseUrl, '/auth/login', payload);
      await refreshSession(
        data.token as string,
        data.user as AuthUser,
        (data.team ?? null) as AuthTeam | null
      );
    },
    [apiBaseUrl, refreshSession]
  );

  const signupCoach = useCallback(
    async (payload: CoachSignupPayload) => {
      if (!apiBaseUrl) {
        throw new Error(getMissingApiUrlMessage());
      }

      const data = await postJson(apiBaseUrl, '/auth/signup', {
        role: 'coach',
        ...payload,
      });

      await refreshSession(
        data.token as string,
        data.user as AuthUser,
        (data.team ?? null) as AuthTeam | null
      );
    },
    [apiBaseUrl, refreshSession]
  );

  const signupAthlete = useCallback(
    async (payload: AthleteSignupPayload) => {
      if (!apiBaseUrl) {
        throw new Error(getMissingApiUrlMessage());
      }

      const data = await postJson(apiBaseUrl, '/auth/signup', {
        role: 'athlete',
        ...payload,
      });

      await refreshSession(
        data.token as string,
        data.user as AuthUser,
        (data.team ?? null) as AuthTeam | null
      );
    },
    [apiBaseUrl, refreshSession]
  );

  const refreshCurrentSession = useCallback(async () => {
    if (!session) {
      return;
    }

    await refreshSession(session.token, session.user, session.team);
  }, [refreshSession, session]);

  const logout = useCallback(async () => {
    await persistSession(null);
  }, [persistSession]);

  return (
    <AuthContext.Provider
      value={{
        apiBaseUrl,
        isHydrating,
        session,
        login,
        signupCoach,
        signupAthlete,
        refreshCurrentSession,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}

export { getErrorMessage };
