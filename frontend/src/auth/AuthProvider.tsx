import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { tokenStore } from '../lib/tokenStore'
import { DEFAULT_ROUTE_BY_ROLE } from '../lib/types'
import type { LoginResult, RegisterResult, User } from '../lib/types'
import { AuthContext } from './auth-context'
import type { AuthStatus, RegisterInput } from './auth-context'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    let alive = true
    // No access token in memory after a reload — the httpOnly refresh cookie
    // (path /api/auth) rides along on this request.
    api<{ accessToken: string; user: User }>('/api/auth/refresh', { method: 'POST', auth: false })
      .then((session) => {
        if (!alive) return
        tokenStore.set(session.accessToken)
        setUser(session.user)
        setStatus('authed')
      })
      .catch(() => {
        if (!alive) return
        tokenStore.set(null)
        setUser(null)
        setStatus('anon')
      })
    return () => {
      alive = false
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const result = await api<LoginResult>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    tokenStore.set(result.accessToken)
    setUser(result.user)
    setStatus('authed')
    return result.redirect
  }, [])

  const register = useCallback(async (input: RegisterInput) => {
    const result = await api<RegisterResult>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    const redirect = DEFAULT_ROUTE_BY_ROLE[input.role]
    return { ...result, redirect }
  }, [])

  const logout = useCallback(async () => {
    try {
      await api<boolean>('/api/auth/logout', { method: 'POST' })
    } finally {
      tokenStore.set(null)
      setUser(null)
      setStatus('anon')
    }
  }, [])

  const value = useMemo(() => ({ status, user, login, register, logout }), [status, user, login, register, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}