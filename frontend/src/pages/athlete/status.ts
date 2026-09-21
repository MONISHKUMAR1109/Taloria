import type { ApplicationStatus } from '../../lib/types'
import type { TagTone } from '../../components/ui'

export type Tone = TagTone

export interface StatusMeta {
  label: string
  tone: Tone
}

export const APPLICATIONS_STATUS_META: Record<ApplicationStatus, StatusMeta> = {
  pending: { label: 'Pending', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  waitlisted: { label: 'Waitlisted', tone: 'info' },
  rejected: { label: 'Rejected', tone: 'danger' },
  withdrawn: { label: 'Withdrawn', tone: 'muted' },
}

export interface SponsorshipStatusMetaOptions {
  label: string
  tone: Tone
}

export const SPONSORSHIP_STATUS_META: Record<string, StatusMeta> = {
  pending: { label: 'Pending', tone: 'warning' },
  active: { label: 'Active', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
}

export const TOURNAMENT_STATUS_META: Record<string, StatusMeta> = {
  draft: { label: 'Draft', tone: 'muted' },
  published: { label: 'Published', tone: 'info' },
  registration_open: { label: 'Registration open', tone: 'success' },
  registration_closed: { label: 'Registration closed', tone: 'warning' },
  ongoing: { label: 'Ongoing', tone: 'brand' },
  completed: { label: 'Completed', tone: 'muted' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
}