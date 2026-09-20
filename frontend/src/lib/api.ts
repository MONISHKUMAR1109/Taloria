import type { ApiEnvelope, ApiErrorBody, ApiMeta } from './types'
import { tokenStore } from './tokenStore'

const BASE_URL = ''

export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly details: unknown

  constructor(code: string, message: string, status: number, details: unknown = null) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details
  }
}

export interface RequestOptions extends RequestInit {
  auth?: boolean
  retried?: boolean
}

async function rawRequest<T>(path: string, options: RequestOptions = {}): Promise<ApiEnvelope<T>> {
  const { auth = true, retried: _retried, headers, ...init } = options
  const requestHeaders = new Headers(headers)

  if (init.body && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json')
  }

  if (auth) {
    const token = tokenStore.get()
    if (token) requestHeaders.set('Authorization', `Bearer ${token}`)
  }

  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, { ...init, headers: requestHeaders })
  } catch {
    throw new ApiError('NETWORK_ERROR', 'Could not reach the server. Check your connection.', 0)
  }

  const body = (await res.json().catch(() => null)) as ApiEnvelope<T> | ApiErrorBody | null

  if (!res.ok || !body || body.success !== true) {
    const err = (body as ApiErrorBody | null)?.error
    throw new ApiError(
      err?.code ?? 'INTERNAL_ERROR',
      err?.message ?? `Request failed (HTTP ${res.status})`,
      res.status,
      err?.details ?? null,
    )
  }

  return body
}

/**
 * Single-flight refresh: concurrent 401s share one refresh call so the
 * rotation/replay-detection (§ refresh token families) never sees two uses
 * of the same cookie-derived token.
 */
let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const { data } = await rawRequest<{ accessToken: string }>('/api/auth/refresh', {
          method: 'POST',
          auth: false,
        })
        tokenStore.set(data.accessToken)
        return data.accessToken
      } catch {
        tokenStore.set(null)
        return null
      } finally {
        refreshPromise = null
      }
    })()
  }
  return refreshPromise
}

/**
 * Typed client for the Phase 1 API. Wraps the standard envelope
 * ({success,data,meta} / {success:false,error}), attaches the Bearer token,
 * and transparently refreshes once on a 401 before giving up.
 */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  try {
    const envelope = await rawRequest<T>(path, options)
    return envelope.data
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && !options.retried) {
      const token = await refreshAccessToken()
      if (token) {
        const envelope = await rawRequest<T>(path, { ...options, retried: true })
        return envelope.data
      }
    }
    throw error
  }
}

export async function apiWithMeta<T>(path: string, options: RequestOptions = {}): Promise<{ data: T; meta?: ApiMeta }> {
  try {
    const envelope = await rawRequest<T>(path, options)
    return { data: envelope.data, meta: envelope.meta }
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && !options.retried) {
      const token = await refreshAccessToken()
      if (token) {
        const envelope = await rawRequest<T>(path, { ...options, retried: true })
        return { data: envelope.data, meta: envelope.meta }
      }
    }
    throw error
  }
}