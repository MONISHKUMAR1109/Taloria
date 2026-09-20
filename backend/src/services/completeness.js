/**
 * Athlete profile completeness and discoverability (spec §6).
 *
 * Completeness is computed from the presence of core profile fields plus at
 * least one linked sport. A profile is discoverable by scouts once it has at
 * least one sport AND completeness ≥ 50%, regardless of verification status.
 *
 * NOTE: these SQL expressions reference the athlete table with alias `ap` and
 * must be used only in queries that do `FROM athlete_profiles ap`. They never
 * depend on output aliases (PostgreSQL can't reference a same-SELECT alias).
 */

const completenessTotal = 8; // 7 core fields + has_sport

export const COMPLETENESS_SQL = `
  ((
    (CASE WHEN first_name   IS NOT NULL AND first_name   <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN last_name    IS NOT NULL AND last_name    <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN date_of_birth IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN country      IS NOT NULL AND country      <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN city         IS NOT NULL AND city         <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN bio          IS NOT NULL AND bio          <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN profile_picture_key IS NOT NULL AND profile_picture_key <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN EXISTS (SELECT 1 FROM athlete_sports _cs WHERE _cs.athlete_id = ap.id) THEN 1 ELSE 0 END)
  )::numeric / ${completenessTotal}::numeric)
`;

/** True when a profile satisfies the discoverability rule. */
export function isDiscoverable({ completeness, sportCount }) {
  return Number(sportCount ?? 0) >= 1 && Number(completeness ?? 0) >= 0.5;
}

export const DISCOVERABLE_SQL = `(
  EXISTS (SELECT 1 FROM athlete_sports _ds WHERE _ds.athlete_id = ap.id)
  AND ${COMPLETENESS_SQL} >= 0.5
)`;