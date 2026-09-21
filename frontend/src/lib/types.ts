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

export interface PaginationMeta {
  page: number
  pageSize: number
  total: number
  totalPages: number
  [key: string]: unknown
}

/* ------------------------------------------------------------------ */
/* User profile                                                        */
/* ------------------------------------------------------------------ */

export interface MeResult {
  user: User
  profileId: string | null
}

export interface AthleteProfileBase {
  id: string
  user_id: string
  first_name: string | null
  last_name: string | null
  date_of_birth: string | null
  country: string | null
  city: string | null
  bio: string | null
  profile_picture_key: string | null
  verification_status: string
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface AthleteSearchRow extends AthleteProfileBase {
  sport_count: number
  achievements_count: number
  completeness: number
  discoverable: boolean
}

export interface AthleteSport {
  id: string
  name: string
  slug: string
  position: string | null
  years_experience: number | null
}

export interface AthleteStatistic {
  id: string
  sport_name: string
  stat_values: Record<string, string | number | boolean>
  recorded_on: string
}

export interface AthleteAchievement {
  id: string
  title: string
  description: string | null
  achieved_at: string | null
  document_key: string | null
}

export interface AthleteVideo {
  id: string
  title: string
  object_key: string
  mime_type: string
  size_bytes: number
  created_at: string
  url?: string
}

export interface AthleteResult {
  id: string
  tournament_id: string
  tournament_title: string
  placement: number
  prize_description: string | null
  details: unknown
}

export interface AthleteApplicationSummary {
  id: string
  tournament_id: string
  tournament_title: string
  status?: string
  applied_at: string
}

export interface AthleteDetail extends AthleteProfileBase {
  sport_count: number
  achievements_count: number
  completeness: number
  discoverable: boolean
  sports: AthleteSport[]
  statistics: AthleteStatistic[]
  achievements: AthleteAchievement[]
  videos: AthleteVideo[]
  results: AthleteResult[]
  applications: AthleteApplicationSummary[]
}

export interface ScoutProfile {
  id: string
  user_id: string
  first_name: string | null
  last_name: string | null
  organization: string | null
  country: string | null
  city: string | null
  bio: string | null
  years_scouting: number | null
}

export interface OrganizerProfile {
  id: string
  user_id: string
  organization_name: string | null
  organization_type: string | null
  country: string | null
  city: string | null
  bio: string | null
}

export interface SponsorProfile {
  id: string
  user_id: string
  company_name: string | null
  industry: string | null
  website: string | null
  country: string | null
  bio: string | null
}

export interface Sport {
  id: string
  name: string
  slug: string
  description: string | null
  stat_template: { key: string; label: string; type: string }[] | null
  created_at: string
}

export interface AgeCategory {
  name: string
}

/* ------------------------------------------------------------------ */
/* Tournaments                                                         */
/* ------------------------------------------------------------------ */

export type TournamentStatus =
  | 'draft'
  | 'published'
  | 'registration_open'
  | 'registration_closed'
  | 'ongoing'
  | 'completed'
  | 'cancelled'

export interface Tournament {
  id: string
  organizer_id: string
  category_id: string | null
  title: string
  description: string | null
  eligibility_requirements: string | null
  location_country: string | null
  location_city: string | null
  registration_deadline: string
  start_date: string
  end_date: string | null
  max_participants: number
  status: TournamentStatus
  published_at: string | null
  created_at: string
  updated_at: string
  category_name: string | null
  participant_count: number
  sponsor_count?: number
}

export interface SponsorshipPackage {
  id: string
  tournament_id: string
  name: string
  price: string | number
  currency: string
  benefits_description: string | null
  max_slots: number
  active_slots: number
}

export interface TournamentParticipant {
  id: string
  first_name: string | null
  last_name: string | null
  country: string | null
  city: string | null
  verification_status: string
  sport_count: number
}

export interface ActiveSponsor {
  id: string
  company_name: string | null
  country: string | null
  package_name: string
  max_slots: number
}

export interface TournamentDetail extends Tournament {
  packages: SponsorshipPackage[]
  participants: TournamentParticipant[]
  activeSponsors: ActiveSponsor[]
}

export interface TournamentCategory {
  id: string
  name: string
}

/* ------------------------------------------------------------------ */
/* Applications / sponsorships                                         */
/* ------------------------------------------------------------------ */

export type ApplicationStatus = 'pending' | 'approved' | 'rejected' | 'waitlisted' | 'withdrawn'

export interface ApplicationRow {
  id: string
  tournament_id: string
  athlete_id: string
  sport_id: string | null
  status: ApplicationStatus
  notes: string | null
  applied_at: string
  decided_at: string | null
  created_at: string
  updated_at: string
  tournament_title: string
  tournament_status: TournamentStatus
  max_participants: number
  athlete_name: string | null
}

export type SponsorshipStatus = 'pending' | 'active' | 'rejected' | 'cancelled'

export interface SponsorshipRequest {
  id: string
  sponsor_id: string
  tournament_id: string
  tournament_title: string
  package_id: string
  package_name: string
  price: string | number
  currency: string
  status: SponsorshipStatus
  requested_at: string
  decided_at: string | null
  company_name: string | null
}

/* ------------------------------------------------------------------ */
/* Messaging + notifications                                           */
/* ------------------------------------------------------------------ */

export interface MessageThread {
  id: string
  blocked_at: string | null
  thread_created_at: string
  last_message: string | null
  last_message_at: string | null
  unread_count: number
  scout_user_id: string
  scout_name: string
  athlete_user_id: string
  athlete_name: string
}

export interface Message {
  id: string
  sender_user_id: string
  sender_role: 'scout' | 'athlete'
  body: string
  read_at: string | null
  created_at: string
}

export interface ThreadDetail {
  id: string
  blockedAt: string | null
  scout: { name: string; organization: string | null } | null
  athlete: { name: string; verification_status: string } | null
  messages: Message[]
}

export interface AppNotification {
  id: string
  type: string
  title: string
  body: string | null
  read_at: string | null
  created_at: string
}

export interface NotificationsResult {
  items: AppNotification[]
  unread: number
  total: number
  totalPages: number
}

/* ------------------------------------------------------------------ */
/* Scouting                                                            */
/* ------------------------------------------------------------------ */

export interface ShortlistedAthlete {
  id: string
  shortlisted_at: string
  name: string
  country: string | null
  city: string | null
  date_of_birth: string | null
  verification_status: string
  sport_count: number
  note: string | null
}

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */

export interface AdminUser {
  id: string
  email: string
  role: Role
  account_status: 'active' | 'suspended'
  email_verified_at: string | null
  created_at: string
  updated_at: string
  active_sessions: number
}

export interface VerificationRequest {
  id: string
  athlete_id: string
  status: string
  requested_at: string
  reviewed_at: string | null
  review_note: string | null
  athlete_name: string
  country: string | null
  city: string | null
  bio: string | null
  sport_count: number
}

export interface AdminAnalytics {
  usersByRole: { role: Role; total: number }[]
  totals: {
    users: number
    athletes: number
    applications: number
    tournaments: number
    active_sponsorships: number
    verification_queue: number
  }
  weeklyRegistrations: { week: string; total: number }[]
  generatedAt: string
}

/* ------------------------------------------------------------------ */
/* Public                                                              */
/* ------------------------------------------------------------------ */

