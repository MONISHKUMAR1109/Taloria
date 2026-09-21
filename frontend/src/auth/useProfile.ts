import { useEffect, useState } from 'react'
import { authApi } from '../lib/endpoints'
import { useAuth } from './auth-context'

let cached: Promise<string | null> | null = null

function loadProfileId(): Promise<string | null> {
  if (!cached) {
    cached = authApi
      .me()
      .then((m) => m.profileId)
      .finally(() => {})
      .catch((err: unknown) => {
        cached = null
        throw err
      })
  }
  return cached
}

export function invalidateProfileIdCache(): void {
  cached = null
}

export function useProfileId() {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [profileId, setProfileId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) {
      setLoading(false)
      setProfileId(null)
      return
    }
    let alive = true
    setLoading(true)
    loadProfileId()
      .then((id) => {
        if (alive) setProfileId(id)
      })
      .catch((err: Error) => {
        if (alive) setError(err.message)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [userId])

  return { profileId, loading, error }
}