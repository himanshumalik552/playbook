import type { CurrentUser } from '@adpulse/types';
import type { LoginInput } from '@adpulse/validation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo } from 'react';
import { api, ApiError, onSessionExpired } from '@/api/client';

export const ME_QUERY_KEY = ['me'] as const;

interface AuthValue {
  user: CurrentUser | null;
  loading: boolean;
  isSuperAdmin: boolean;
  signIn: (input: LoginInput) => Promise<CurrentUser>;
  register: (input: { name: string; email: string; password: string }) => Promise<CurrentUser>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<CurrentUser | null>;
}

const AuthContext = createContext<AuthValue | null>(null);

async function fetchMe(): Promise<CurrentUser | null> {
  try {
    return await api.get<CurrentUser>('/users/me', undefined, { skipOrg: true });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ME_QUERY_KEY, queryFn: fetchMe, staleTime: 5 * 60_000, retry: false });

  const refreshUser = useCallback(async () => {
    const user = await fetchMe();
    queryClient.setQueryData(ME_QUERY_KEY, user);
    return user;
  }, [queryClient]);

  const establish = useCallback(async () => {
    const user = await refreshUser();
    if (!user)
      throw new ApiError(
        'Signed in, but the session could not be loaded. Check that cookies are enabled.',
        401,
        'SESSION_UNAVAILABLE',
      );
    return user;
  }, [refreshUser]);

  const signIn = useCallback(
    async (input: LoginInput) => {
      await api.post('/auth/login', input, { skipOrg: true });
      return establish();
    },
    [establish],
  );

  const register = useCallback(
    async (input: { name: string; email: string; password: string }) => {
      await api.post('/auth/register', input, { skipOrg: true });
      return establish();
    },
    [establish],
  );

  const signOut = useCallback(async () => {
    try {
      await api.post('/auth/logout', undefined, { skipOrg: true });
    } finally {
      queryClient.clear();
      queryClient.setQueryData(ME_QUERY_KEY, null);
    }
  }, [queryClient]);

  useEffect(() => {
    // Keep the `me` query itself: it may be the in-flight request that triggered the expiry, and removing it strands its observer in a pending state.
    onSessionExpired(() => {
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_QUERY_KEY[0] });
      queryClient.setQueryData(ME_QUERY_KEY, null);
    });
    return () => onSessionExpired(null);
  }, [queryClient]);

  const user = me.data ?? null;
  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading: me.isPending,
      isSuperAdmin: user?.systemRole === 'SUPER_ADMIN',
      signIn,
      register,
      signOut,
      refreshUser,
    }),
    [user, me.isPending, signIn, register, signOut, refreshUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
