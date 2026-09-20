/**
 * Friendly message per API error code. Falls back to the server's message.
 * Mirrors docs/ERROR_CODES.md. UI-specific text can override the fallback.
 */
export const ERROR_MESSAGES: Record<string, string> = {
  VALIDATION_ERROR: 'Some fields are invalid. Review the highlighted items.',
  INVALID_CREDENTIALS: 'Invalid email or password.',
  EMAIL_TAKEN: 'An account with this email already exists.',
  EMAIL_VERIFICATION_REQUIRED: 'Please verify your email before continuing.',
  EMAIL_VERIFICATION_INVALID: 'This verification link is invalid.',
  EMAIL_VERIFICATION_EXPIRED: 'This verification link has expired. Request a new one.',
  PASSWORD_RESET_INVALID: 'This reset link is invalid.',
  PASSWORD_RESET_EXPIRED: 'This reset link has expired. Request a new one.',
  TOKEN_INVALID: 'Your session token is invalid. Please log in again.',
  TOKEN_EXPIRED: 'Your session expired. Please log in again.',
  UNAUTHORIZED: 'Please log in to continue.',
  FORBIDDEN: 'You do not have permission to do that.',
  NOT_FOUND: 'The requested resource was not found.',
  ALREADY_APPLIED: 'You have already applied to this tournament.',
  TOURNAMENT_CLOSED: 'Registration for this tournament is closed.',
  TOURNAMENT_DEADLINE_PASSED: 'The registration deadline has passed.',
  TOURNAMENT_NOT_OPEN: 'This tournament is not open for registration.',
  TOURNAMENT_ILLEGAL_TRANSITION: 'That status change is not allowed.',
  TOURNAMENT_FULL: 'This tournament is full.',
  APPLICANT_NOT_PENDING: 'This application is not in a pending state.',
  PARTICIPANT_ALREADY_EXISTS: 'This applicant is already a participant.',
  SPONSORSHIP_SLOT_FULL: 'All sponsorship slots for this tournament are taken.',
  SPONSORSHIP_ALREADY_REQUESTED: 'A sponsorship request is already pending.',
  SPONSORSHIP_NOT_PENDING: 'No pending sponsorship request exists.',
  STAT_TEMPLATE_MISMATCH: 'Statistics do not match this sport\u2019s template.',
  VIDEO_LIMIT_REACHED: 'The video limit has been reached.',
  FILE_TOO_LARGE: 'That file is too large.',
  FILE_TYPE_UNSUPPORTED: 'That file type is not supported.',
  BLOCKED: 'This conversation is blocked.',
  ROLE_NOT_ALLOWED: 'Your role cannot do that.',
  ROLE_CHANGE_NOT_ALLOWED: 'That role change is not allowed.',
  ACCOUNT_SUSPENDED: 'This account is suspended.',
  VERIFICATION_ALREADY_PENDING: 'A verification request is already pending.',
  BLOCKED_ACTION: 'That action is not available.',
  RATE_LIMITED: 'Too many attempts. Wait a moment and try again.',
  NETWORK_ERROR: 'Could not reach the server. Check your connection.',
  INTERNAL_ERROR: 'Something went wrong on our side. Please try again.',
}

export function messageForCode(code: string): string | undefined {
  return ERROR_MESSAGES[code]
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function isFuture(iso: string | null | undefined): boolean {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return !Number.isNaN(t) && t > Date.now()
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso).getTime()
  if (Number.isNaN(d)) return '—'
  const diff = d - Date.now()
  const abs = Math.abs(diff)
  const mins = Math.round(abs / 60000)
  const hours = Math.round(abs / 3600000)
  const days = Math.round(abs / 86400000)

  let span: string
  if (days >= 1) span = `${days}d`
  else if (hours >= 1) span = `${hours}h`
  else span = `${mins}m`

  return diff >= 0 ? `in ${span}` : `${span} ago`
}