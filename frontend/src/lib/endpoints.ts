/**
 * Typed API surface for the whole platform, one function per backend route.
 * Response shapes are the exact rows/envelopes returned by
 * taloria/backend/src/routes/* (see the route files for column-level detail).
 */
import { api, apiWithMeta } from './api'
import type { ApiMeta } from './types'
import type {
  AdminAnalytics,
  AdminUser,
  ApplicationRow,
  ApplicationStatus,
  AppNotification,
  AthleteAchievement,
  AthleteDetail,
  AthleteSearchRow,
  AthleteSport,
  AthleteStatistic,
  AthleteVideo,
  LoginResult,
  MeResult,
  Message,
  MessageThread,
  PublicAthlete,
  PublicStats,
  PublicTournament,
  RegisterResult,
  RefreshResult,
  Role,
  ScoutProfile,
  ShortlistedAthlete,
  Sport,
  SponsorshipPackage,
  SponsorshipRequest,
  SponsorshipStatus,
  ThreadDetail,
  Tournament,
  TournamentCategory,
  TournamentDetail,
  TournamentStatus,
  VerificationRequest,
  User,
} from './types'

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

type Query = Record<string, string | number | boolean | null | undefined>

function qs(params?: Query): string {
  if (!params) return ''
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const str = search.toString()
  return str ? `?${str}` : ''
}

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

export const authApi = {
  register: (input: { email: string; password: string; role: Exclude<Role, 'admin'> }) =>
    api<RegisterResult>('/api/auth/register', { method: 'POST', auth: false, body: JSON.stringify(input) }),

  login: (input: { email: string; password: string }) =>
    api<LoginResult>('/api/auth/login', { method: 'POST', auth: false, body: JSON.stringify(input) }),

  refresh: (refreshToken?: string) =>
    api<RefreshResult>('/api/auth/refresh', { method: 'POST', auth: false, body: JSON.stringify({ refreshToken }) }),

  logout: (refreshToken?: string) =>
    api<boolean>('/api/auth/logout', { method: 'POST', auth: false, body: JSON.stringify({ refreshToken }) }),

  me: () => api<MeResult>('/api/auth/me'),

  verifyEmail: (token: string) =>
    api<{ message: string }>('/api/auth/verify-email', { method: 'POST', auth: false, body: JSON.stringify({ token }) }),

  resendVerification: (email: string) =>
    api<{ message: string }>('/api/auth/resend-verification', { method: 'POST', auth: false, body: JSON.stringify({ email }) }),

  forgotPassword: (email: string) =>
    api<{ message: string }>('/api/auth/forgot-password', { method: 'POST', auth: false, body: JSON.stringify({ email }) }),

  resetPassword: (token: string, newPassword: string) =>
    api<{ message: string }>('/api/auth/reset-password', { method: 'POST', auth: false, body: JSON.stringify({ token, newPassword }) }),

  changePassword: (currentPassword: string, newPassword: string) =>
    api<{ message: string }>('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
}

/* ------------------------------------------------------------------ */
/* Sports / categories                                                 */
/* ------------------------------------------------------------------ */

export const sportsApi = {
  list: () => api<Sport[]>('/api/sports', { auth: false }),

  create: (input: { name: string; slug: string; description?: string; stat_template?: { key: string; label: string; type: string }[] }) =>
    api<Sport>('/api/sports', { method: 'POST', body: JSON.stringify(input) }),
}

export const tournamentsApi = {
  categories: () => api<TournamentCategory[]>('/api/tournaments/categories', { auth: false }),

  list: (params?: Query) => apiWithMeta<Tournament[]>(`/api/tournaments${qs(params)}`, { auth: false }),

  mine: (params?: Query) => apiWithMeta<Tournament[]>(`/api/tournaments/mine${qs(params)}`),

  get: (id: string) => api<TournamentDetail>(`/api/tournaments/${id}`),

  create: (input: {
    title: string
    description?: string
    category_id?: string
    eligibility_requirements?: string
    location_country?: string
    location_city?: string
    registration_deadline: string
    start_date: string
    end_date?: string
    max_participants: number
  }) => api<{ id: string; title: string; status: TournamentStatus; registration_deadline: string; start_date: string; max_participants: number }>(
    '/api/tournaments', { method: 'POST', body: JSON.stringify(input) },
  ),

  update: (id: string, input: Partial<{
    title: string
    description: string
    category_id: string
    eligibility_requirements: string
    location_country: string
    location_city: string
    registration_deadline: string
    start_date: string
    end_date: string
    max_participants: number
    status: TournamentStatus
  }>) => api<{
    id: string
    title: string
    status: TournamentStatus
    registration_deadline: string
    start_date: string
    max_participants: number
    published_at: string | null
  }>(`/api/tournaments/${id}`, { method: 'PUT', body: JSON.stringify(input) }),

  addPackage: (id: string, input: { name: string; price: number; currency?: string; benefits_description?: string; max_slots?: number }) =>
    api<SponsorshipPackage>(`/api/tournaments/${id}/packages`, { method: 'POST', body: JSON.stringify(input) }),

  apply: (id: string, input: { sport_id?: string; notes?: string }) =>
    api<{ id: string; tournament_id: string; athlete_id: string; status: ApplicationStatus; notes: string | null; applied_at: string; waitlisted: boolean }>(
      `/api/tournaments/${id}/apply`, { method: 'POST', body: JSON.stringify(input) },
    ),

  withdraw: (id: string) => api<{ id: string; status: 'withdrawn' }>(`/api/tournaments/${id}/withdraw`, { method: 'POST' }),

  enterResults: (id: string, results: { athlete_id: string; placement: number; prize_description?: string; sport_id?: string; stat_values?: Record<string, unknown> }[]) =>
    api<{ results: number; tournamentStatus: TournamentStatus }>(`/api/tournaments/${id}/results`, { method: 'POST', body: JSON.stringify(results) }),
}

/* ------------------------------------------------------------------ */
/* Athletes                                                            */
/* ------------------------------------------------------------------ */

export interface AthleteUpdateInput {
  first_name?: string
  last_name?: string
  date_of_birth?: string
  country?: string
  city?: string
  bio?: string
}

export const athletesApi = {
  search: (params?: Query) => apiWithMeta<AthleteSearchRow[]>(`/api/athletes${qs(params)}`),

  get: (id: string) => api<AthleteDetail>(`/api/athletes/${id}`),

  update: (id: string, input: AthleteUpdateInput) =>
    api<{
      id: string
      first_name: string | null
      last_name: string | null
      date_of_birth: string | null
      country: string | null
      city: string | null
      bio: string | null
      verification_status: string
      updated_at: string
    }>(`/api/athletes/${id}`, { method: 'PUT', body: JSON.stringify(input) }),

  uploadPicture: (id: string, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return api<{ id: string; profile_picture_key: string | null; url: string }>(`/api/athletes/${id}/picture`, { method: 'POST', body: fd })
  },

  addSport: (id: string, input: { sport_id: string; position?: string; years_experience?: number }) =>
    api<AthleteSport>(`/api/athletes/${id}/sports`, { method: 'POST', body: JSON.stringify(input) }),

  addStatistic: (id: string, input: { sport_id: string; recorded_on?: string; stat_values: Record<string, unknown> }) =>
    api<AthleteStatistic>(`/api/athletes/${id}/statistics`, { method: 'POST', body: JSON.stringify(input) }),

  addAchievement: (id: string, input: { title: string; description?: string; achieved_at?: string }) =>
    api<AthleteAchievement>(`/api/athletes/${id}/achievements`, { method: 'POST', body: JSON.stringify(input) }),

  uploadVideo: (id: string, title: string, file: File) => {
    const fd = new FormData()
    fd.append('title', title)
    fd.append('file', file)
    return api<AthleteVideo & { url: string }>(`/api/athletes/${id}/videos`, { method: 'POST', body: fd })
  },
}

/* ------------------------------------------------------------------ */
/* Applications                                                        */
/* ------------------------------------------------------------------ */

export const applicationsApi = {
  list: (params?: Query) => apiWithMeta<ApplicationRow[]>(`/api/applications${qs(params)}`),

  decide: (id: string, status: Extract<ApplicationStatus, 'approved' | 'rejected' | 'waitlisted'>) =>
    api<{ id: string; status: ApplicationStatus }>(`/api/applications/${id}`, { method: 'PUT', body: JSON.stringify({ status }) }),
}

/* ------------------------------------------------------------------ */
/* Scouting                                                            */
/* ------------------------------------------------------------------ */

export const scoutingApi = {
  shortlist: () => api<ShortlistedAthlete[]>('/api/scouting/shortlist'),

  add: (athleteId: string) => api<{ id: string; athlete_id: string; shortlisted_at: string }>(`/api/scouting/shortlist/${athleteId}`, { method: 'POST' }),

  remove: (athleteId: string) => api<boolean>(`/api/scouting/shortlist/${athleteId}`, { method: 'DELETE' }),

  updateNote: (athleteId: string, note: string) =>
    api<{ id: string; athlete_id: string; note: string | null; updated_at: string }>(`/api/scouting/notes/${athleteId}`, { method: 'PUT', body: JSON.stringify({ note }) }),
}

/* ------------------------------------------------------------------ */
/* Messages                                                            */
/* ------------------------------------------------------------------ */

export const messagesApi = {
  threads: () => api<MessageThread[]>('/api/messages'),

  start: (athleteId: string, initialMessage: string) =>
    api<{ threadId: string; message: Message }>('/api/messages', { method: 'POST', body: JSON.stringify({ athlete_id: athleteId, initial_message: initialMessage }) }),

  get: (threadId: string) => api<ThreadDetail>(`/api/messages/${threadId}`),

  send: (threadId: string, body: string) => api<Message>(`/api/messages/${threadId}`, { method: 'POST', body: JSON.stringify({ body }) }),

  block: (threadId: string) => api<{ id: string; blockedAt: string }>(`/api/messages/${threadId}/block`, { method: 'POST' }),
}

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

export const notificationsApi = {
  list: async (params?: { page?: number; pageSize?: number; unread?: boolean }): Promise<{
    items: AppNotification[]
    unread: number
    total: number
    totalPages: number
    meta?: ApiMeta
  }> => {
    const { data, meta } = await apiWithMeta<AppNotification[]>(`/api/notifications${qs(params)}`)
    return {
      items: data,
      unread: (meta?.unread as number) ?? 0,
      total: (meta?.total as number) ?? data.length,
      totalPages: (meta?.totalPages as number) ?? 1,
      meta,
    }
  },

  markRead: (id: string) => api<{ id: string; read_at: string | null }>(`/api/notifications/${id}/read`, { method: 'PUT' }),
}

/* ------------------------------------------------------------------ */
/* Sponsorships                                                        */
/* ------------------------------------------------------------------ */

export const sponsorshipsApi = {
  list: (params?: Query) => apiWithMeta<SponsorshipRequest[]>(`/api/sponsorships${qs(params)}`),

  request: (tournamentId: string, packageId: string) =>
    api<{ id: string; tournament_id: string; package_id: string; status: 'pending'; requested_at: string }>(
      '/api/sponsorships', { method: 'POST', body: JSON.stringify({ tournament_id: tournamentId, package_id: packageId }) },
    ),

  decide: (id: string, status: SponsorshipStatus) =>
    api<{ id: string; status: SponsorshipStatus }>(`/api/sponsorships/${id}`, { method: 'PUT', body: JSON.stringify({ status }) }),
}

/* ------------------------------------------------------------------ */
/* Verification requests                                               */
/* ------------------------------------------------------------------ */

export const verificationApi = {
  submit: (note?: string) =>
    api<{ id: string; athlete_id: string; status: 'pending'; requested_at: string }>(
      '/api/verification-requests', { method: 'POST', body: JSON.stringify({ note }) },
    ),

  list: () => api<VerificationRequest[]>('/api/verification-requests'),

  review: (id: string, status: 'verified' | 'rejected', reviewNote?: string) =>
    api<{ id: string; status: 'verified' | 'rejected' }>(`/api/verification-requests/${id}`, { method: 'PUT', body: JSON.stringify({ status, review_note: reviewNote }) }),
}

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */

export const adminApi = {
  users: (params?: Query) => apiWithMeta<AdminUser[]>(`/api/admin/users${qs(params)}`),

  setUserStatus: (id: string, accountStatus: 'active' | 'suspended') =>
    api<{ id: string; email: string; role: Role; account_status: 'active' | 'suspended' }>(
      `/api/admin/users/${id}/status`, { method: 'PUT', body: JSON.stringify({ account_status: accountStatus }) },
    ),

  changeRole: (id: string, role: Exclude<Role, 'admin'>) =>
    api<{ id: string; role: Role; message: string }>(`/api/admin/users/${id}/role`, { method: 'POST', body: JSON.stringify({ role }) }),

  analytics: () => api<AdminAnalytics>('/api/admin/analytics'),
}

/* ------------------------------------------------------------------ */
/* Public                                                              */
/* ------------------------------------------------------------------ */

export const publicApi = {
  stats: () => api<PublicStats>('/api/public/stats', { auth: false }),

  talent: (limit?: number) => api<PublicAthlete[]>(`/api/public/talent${qs({ limit })}`, { auth: false }),

  tournaments: (limit?: number) => api<PublicTournament[]>(`/api/public/tournaments${qs({ limit })}`, { auth: false }),
}

/* ------------------------------------------------------------------ */
/* Shared entity helpers                                               */
/* ------------------------------------------------------------------ */

export function mediaUrl(key: string | null | undefined): string | undefined {
  if (!key) return undefined
  return `/uploads/${key}`
}

export function userName(name: string | null | undefined): string {
  return name && name.trim() ? name.trim() : 'Unnamed athlete'
}

export function displayName(row: { first_name?: string | null; last_name?: string | null } | null | undefined): string {
  if (!row) return '—'
  const full = [row.first_name, row.last_name].filter(Boolean).join(' ').trim()
  return full || '—'
}

export function currentUser(): User | null {
  try {
    const raw = localStorage.getItem('taloria-user')
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}

export function profileTypeFromRole(role: Role, scout: ScoutProfile | null): string {
  return scout ? `Scout · ${scout.organization ?? 'Independent'}` : ROLE_HINT[role]
}

const ROLE_HINT: Record<Role, string> = {
  athlete: 'Athlete',
  scout: 'Scout',
  organizer: 'Organizer',
  sponsor: 'Sponsor',
  admin: 'Administrator',
}