export type Role = 'athlete' | 'scout' | 'organizer' | 'sponsor' | 'admin'

/** Roles a user can self-select at registration. */
export const REGISTRABLE_ROLES: Exclude<Role, 'admin'>[] = [
  'athlete',
  'scout',
  'organizer',
  'sponsor',
]

export const ROLE_LABELS: Record<Role, string> = {
  athlete: 'Athlete',
  scout: 'Scout',
  organizer: 'Organizer',
  sponsor: 'Sponsor',
  admin: 'Admin',
}

export interface User {
  id: string
  email: string
  role: Role
  emailVerified: boolean
}

/** Default landing route per role, mirroring the backend REDIRECT_BY_ROLE. */
export const DEFAULT_ROUTE_BY_ROLE: Record<Role, string> = {
  athlete: '/dashboard/athlete',
  scout: '/dashboard/scout',
  organizer: '/dashboard/organizer',
  sponsor: '/dashboard/sponsor',
  admin: '/dashboard/admin',
}

export interface LoginResult {
  accessToken: string
  refreshToken: string
  user: User
  redirect: string
}

export interface RefreshResult {
  accessToken: string
  refreshToken: string
  user: User
}

export interface RegisterResult {
  user: User
  message: string
}

export interface PublicStats {
  verifiedAthletes: number
  tournaments: number
  applications: number
  activeSponsorships: number
  generatedAt: string
}

export interface PublicTournament {
  id: string
  title: string
  location_country: string | null
  location_city: string | null
  registration_deadline: string
  start_date: string
  end_date: string
  status: string
  category_name: string | null
  participant_count: number
  max_participants: number
  sponsor_count: number
}

export interface PublicAthlete {
  id: string
  first_name: string | null
  last_name: string | null
  country: string | null
  city: string | null
  verification_status: string
  profile_picture_key: string | null
  sport_count: number
  stat_count: number
  completeness: number
}

export interface ApiMeta {
  labels?: Record<string, string>
  [key: string]: unknown
}

export interface ApiEnvelope<T> {
  success: true
  data: T
  meta?: ApiMeta
}

export interface ApiErrorBody {
  success: false
  error: {
    code: string
    message: string
    details: unknown
  }
}