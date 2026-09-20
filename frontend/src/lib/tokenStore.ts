/**
 * Module-level access-token storage. The token lives in memory only (never
 * localStorage) — the session is kept alive by the httpOnly refresh cookie
 * (`rt`) that the Vite proxy forwards to the API on same-origin requests.
 */

let accessToken: string | null = null

export const tokenStore = {
  get: () => accessToken,
  set: (token: string | null) => {
    accessToken = token
  },
}