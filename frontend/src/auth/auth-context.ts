import { createContext, useContext } from 'react'
import type { RegisterResult, Role, User } from '../lib/types'

export type AuthStatus = 'loading' | 'anon' | 'authed'

export interface RegisterInput {
  email: string
  password: string
  role: Exclude<Role, 'admin'>
}

export interface RegisterResultState extends RegisterResult {
  redirect: string
}

export interface AuthContextValue {
  status: AuthStatus
  user: User | null
  login: (email: string, password: string) => Promise<string>
  register: (input: RegisterInput) => Promise<RegisterResultState>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}