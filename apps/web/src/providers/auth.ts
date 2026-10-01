import type { CurrentUser } from '@adpulse/types';
import type { LoginInput } from '@adpulse/validation';
import { createContext, useContext } from 'react';

export const ME_QUERY_KEY = ['me'] as const;

export interface AuthValue {
  user: CurrentUser | null;
  loading: boolean;
  isSuperAdmin: boolean;
  signIn: (input: LoginInput) => Promise<CurrentUser>;
  register: (input: { name: string; email: string; password: string }) => Promise<CurrentUser>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<CurrentUser | null>;
}

export const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
