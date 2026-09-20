import { useAuth } from '../auth/auth-context'
import { Card, RoleBadge } from '../components/ui'
import type { Role } from '../lib/types'

const ROLE_PLAN: Record<Role, { title: string; body: string; next: string[] }> = {
  athlete: {
    title: 'Athlete dashboard',
    body: 'This is your stage. Build a complete, verified profile so scouts can find you.',
    next: [
      'Complete your profile (completeness meter, §6 discoverability)',
      'Manage sports, statistics, achievements, and videos',
      'Track tournament applications and verification',
      'Respond to sponsorship requests',
    ],
  },
  scout: {
    title: 'Scout dashboard',
    body: 'Search every eligible athlete with deterministic filters — no guesswork.',
    next: [
      'Search & filter athletes (discoverability-aware)',
      'Shortlist and message athletes',
      'Track contacts in blocked conversations',
    ],
  },
  organizer: {
    title: 'Organizer dashboard',
    body: 'Run tournaments end to end, from draft to completed.',
    next: [
      'Create and publish tournaments',
      'Review applications: approve or waitlist',
      'Enter results and push statistics to athletes',
      'Manage sponsorship slots',
    ],
  },
  sponsor: {
    title: 'Sponsor dashboard',
    body: 'Back competitions and manage active partnerships.',
    next: [
      'Browse tournaments and request sponsorship slots',
      'Manage pending and active requests',
    ],
  },
  admin: {
    title: 'Admin dashboard',
    body: 'Platform governance and verification review.',
    next: [
      'Review athlete verification requests',
      'Manage users: suspend, activate, change roles (§4.2)',
      'Platform analytics',
    ],
  },
}

export function DashboardHome() {
  const { user } = useAuth()
  if (!user) return null
  const plan = ROLE_PLAN[user.role]

  return (
    <div>
      <div className="pill-row mb-3">
        <RoleBadge role={user.role} />
        <span className="small muted">{user.email}</span>
      </div>
      <h1>{plan.title}</h1>
      <p className="muted">{plan.body}</p>

      <Card className="mt-4">
        <h3>What&apos;s next in this dashboard</h3>
        <ul className="plain">
          {plan.next.map((item) => (
            <li key={item} className="mb-2 small">
              • {item}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}