import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';

/**
 * Seed script for local development (§29).
 * Every row inserted here has is_seed = true so demo data can be bulk-removed:
 *
 *   DELETE FROM users WHERE is_seed;   -- cascades to profiles & related rows
 *   ... (or src/db cleanup in a later phase)
 *
 * Requirements: ≥10 athletes, ≥5 tournaments, several applications, several
 * sports, several achievements, several scouts/organizers/sponsors + requests.
 *
 * Run: npm run db:seed   (after npm run db:migrate)
 */
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Copy backend/.env.example to backend/.env first.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
const DEMO_PASSWORD = 'Password123!';

const uid = () => randomUUID();

async function q(sql, params = []) {
  return client.query(sql, params);
}

async function alreadySeeded() {
  const { rows } = await client.query(`SELECT count(*)::int AS n FROM users WHERE is_seed`);
  return rows[0].n > 0;
}

function fcNum(min, max) {
  return +(min + Math.random() * (max - min)).toFixed(1);
}

function dateShift(subDays) {
  const d = new Date(Date.now() - subDays * 86400_000);
  return d.toISOString().slice(0, 10);
}

function futureIso(addDays) {
  return new Date(Date.now() + addDays * 86400_000).toISOString();
}

function offsetDate(addDays) {
  return new Date(Date.now() + addDays * 86400_000).toISOString().slice(0, 10);
}

const SPORTS = [
  { name: 'Football', slug: 'football', statTemplate: [
    { key: 'goals', label: 'Goals', type: 'int' },
    { key: 'assists', label: 'Assists', type: 'int' },
    { key: 'appearances', label: 'Appearances', type: 'int' },
  ]},
  { name: 'Basketball', slug: 'basketball', statTemplate: [
    { key: 'points_per_game', label: 'Points per game', type: 'number' },
    { key: 'assists_per_game', label: 'Assists per game', type: 'number' },
    { key: 'appearances', label: 'Appearances', type: 'int' },
  ]},
  { name: 'Tennis', slug: 'tennis', statTemplate: [
    { key: 'wins', label: 'Wins', type: 'int' },
    { key: 'losses', label: 'Losses', type: 'int' },
    { key: 'rank', label: 'National rank', type: 'int' },
  ]},
  { name: 'Swimming', slug: 'swimming', statTemplate: [
    { key: 'personal_best_100m_seconds', label: '100 m PB (s)', type: 'number' },
    { key: 'events', label: 'Events', type: 'int' },
  ]},
  { name: 'Athletics', slug: 'athletics', statTemplate: [
    { key: 'personal_best_100m_seconds', label: '100 m PB (s)', type: 'number' },
    { key: 'medals', label: 'Medals', type: 'int' },
  ]},
];

const CATEGORIES = [
  { name: 'U18', min: 14, max: 17 },
  { name: 'U21', min: 18, max: 20 },
  { name: 'Senior', min: 21, max: 34 },
  { name: 'Veteran', min: 35, max: null },
];

const TOURNAMENT_CATEGORIES = ['National Championship', 'Regional Cup', 'Invitational', 'Academy League', 'Youth Series'];

const ATHLETE_NAMES = [
  ['Amara', 'Okafor'], ['Lucas', 'Ferreira'], ['Sofia', 'Marchetti'], ['Elias', 'Kovac'],
  ['Nadia', 'Haddad'], ['Tomás', 'Almeida'], ['Priya', 'Sharma'], ['Jonas', 'Weber'],
  ['Yuki', 'Tanaka'], ['Isabella', 'Rossi'], ['Kwame', 'Mensah'], ['Elena', 'Petrova'],
];

const SCOUT_NAMES = [
  ['Marcus', 'Lindqvist', 'Northwind Scouting'], ['Claire', 'Beaumont', 'Beaumont Talent'],
  ['Hiro', 'Nakamura', 'Pacific Pro Scouting'], ['Olivia', 'Grant', 'Grant & Sons'],
  ['Daniel', 'Osei', 'Westfield Analytics'],
];

const SPONSOR_NAMES = [
  ['Volt Sports', 'Apparel'], ['Hyperkine', 'Nutrition'], ['Arclight', 'Footwear'],
  ['PeakWater', 'Hydration'], ['Nimbus Pay', 'Finance'],
];

const ORGANIZERS = [
  ['Metro Athletics', 'Federation'], ['Coastal Cup Committee', 'Regional body'],
  ['Stadium One Group', 'Independent'], ['Royal Pavilion Trust', 'Academy'],
];

const COUNTRIES_CITIES = [
  ['Nigeria', 'Lagos'], ['Brazil', 'Rio de Janeiro'], ['Italy', 'Milan'], ['Croatia', 'Zagreb'],
  ['Lebanon', 'Beirut'], ['Portugal', 'Lisbon'], ['India', 'Mumbai'], ['Germany', 'Berlin'],
  ['Japan', 'Osaka'], ['Argentina', 'Buenos Aires'], ['Ghana', 'Accra'], ['Ukraine', 'Kyiv'],
];

function verificationFor(i) {
  if (i % 4 === 0) return 'verified';
  if (i % 7 === 0) return 'pending';
  if (i % 11 === 0) return 'rejected';
  return 'unverified';
}

async function seed() {
  await client.connect();
  if (await alreadySeeded() && !process.argv.includes('--force')) {
    console.log('Demo data already exists. Use `npm run db:seed -- --force` to reseed.');
    await client.end();
    return;
  }

  await client.query('BEGIN');

  const sportsIds = {};
  for (const s of SPORTS) {
    const { rows } = await q(
      `INSERT INTO sports (name, slug, description, stat_template, is_seed)
       VALUES ($1, $2, $3, $4, true) RETURNING id`,
      [s.name, s.slug, null, JSON.stringify(s.statTemplate)],
    );
    sportsIds[s.slug] = rows[0].id;
  }

  for (const c of CATEGORIES) {
    await q(
      `INSERT INTO age_categories (name, min_age, max_age, sort_order, is_seed) VALUES ($1, $2, $3, $4, true)`,
      [c.name, c.min, c.max === null ? null : c.max, CATEGORIES.indexOf(c)],
    );
  }

  const categoryIds = [];
  for (const c of TOURNAMENT_CATEGORIES) {
    const { rows } = await q(`INSERT INTO tournament_categories (name, is_seed) VALUES ($1, true) RETURNING id`, [c]);
    categoryIds.push(rows[0].id);
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  // --- Admin (demo) -------------------------------------------------------
  const adminUser = await q(
    `INSERT INTO users (email, password_hash, role, email_verified_at, is_seed)
     VALUES ('admin@taloria.demo', $1, 'admin', now(), true) RETURNING id`, [passwordHash],
  );
  const adminId = adminUser.rows[0].id;

  // --- Organizers ----------------------------------------------------------
  const organizerIds = [];
  for (const [orgName, orgType] of ORGANIZERS) {
    const idx = organizerIds.length;
    const { rows: u } = await q(
      `INSERT INTO users (email, password_hash, role, email_verified_at, is_seed)
       VALUES ('organizer${idx + 1}@taloria.demo', $1, 'organizer', now(), true) RETURNING id`, [passwordHash],
    );
    const { rows: p } = await q(
      `INSERT INTO organizer_profiles (user_id, organization_name, organization_type, country, city, is_seed)
       VALUES ($1, $2, $3, $4, $5, true) RETURNING id`,
      [u[0].id, orgName, orgType, COUNTRIES_CITIES[(idx * 3) % 12][0], COUNTRIES_CITIES[(idx * 3) % 12][1]],
    );
    organizerIds.push(p[0].id);
  }

  // --- Scouts ---------------------------------------------------------------
  const scoutProfileIds = [];
  const scoutUserIds = [];
  for (let i = 0; i < SCOUT_NAMES.length; i += 1) {
    const [first, last, org] = SCOUT_NAMES[i];
    const { rows: u } = await q(
      `INSERT INTO users (email, password_hash, role, email_verified_at, is_seed)
       VALUES ('scout${i + 1}@taloria.demo', $1, 'scout', now(), true) RETURNING id`, [passwordHash],
    );
    scoutUserIds.push(u[0].id);
    const { rows: p } = await q(
      `INSERT INTO scout_profiles (user_id, first_name, last_name, organization, country, city, bio, years_scouting, is_seed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true) RETURNING id`,
      [u[0].id, first, last, org, COUNTRIES_CITIES[i][0], COUNTRIES_CITIES[i][1],
        `Scout focused on ${org}.`, 4 + (i % 12)],
    );
    scoutProfileIds.push(p[0].id);
  }

  // --- Sponsors -------------------------------------------------------------
  const sponsorProfileIds = [];
  for (let i = 0; i < SPONSOR_NAMES.length; i += 1) {
    const [company, industry] = SPONSOR_NAMES[i];
    const { rows: u } = await q(
      `INSERT INTO users (email, password_hash, role, email_verified_at, is_seed)
       VALUES ('sponsor${i + 1}@taloria.demo', $1, 'sponsor', now(), true) RETURNING id`, [passwordHash],
    );
    const { rows: p } = await q(
      `INSERT INTO sponsor_profiles (user_id, company_name, industry, website, country, bio, is_seed)
       VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING id`,
      [u[0].id, company, industry, `https://example.${company.toLowerCase()}`, 'United Kingdom',
        `Sponsor within ${industry}.`],
    );
    sponsorProfileIds.push(p[0].id);
  }

  // --- Athletes -------------------------------------------------------------
  const athleteProfileIds = [];
  const athleteUserIds = [];
  for (let i = 0; i < ATHLETE_NAMES.length; i += 1) {
    const [first, last] = ATHLETE_NAMES[i];
    const [country, city] = COUNTRIES_CITIES[i];
    const dob = dateShift(7300 + i * 140);
    const verification = verificationFor(i);
    const { rows: u } = await q(
      `INSERT INTO users (email, password_hash, role, email_verified_at, is_seed)
       VALUES ('athlete${i + 1}@taloria.demo', $1, 'athlete', now(), true) RETURNING id`, [passwordHash],
    );
    athleteUserIds.push(u[0].id);
    const { rows: p } = await q(
      `INSERT INTO athlete_profiles (user_id, first_name, last_name, date_of_birth, country, city, bio, verification_status, is_seed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true) RETURNING id`,
      [u[0].id, first, last, dob, country, city, `${first} ${last} — ${city}, ${country}. ${i % 2 ? 'Attacking playmaker.' : 'Reliable all-rounder.'}`, verification],
    );
    athleteProfileIds.push(p[0].id);
  }

  // --- Athlete sports / stats / achievements --------------------------------
  const sportSlugs = Object.keys(sportsIds);
  for (let i = 0; i < athleteProfileIds.length; i += 1) {
    const aid = athleteProfileIds[i];
    const mainSport = sportSlugs[i % sportSlugs.length];
    const secondSport = sportSlugs[(i + 2) % sportSlugs.length];
    const positions = { football: ['Forward', 'Midfielder'], basketball: ['Guard', 'Forward'], tennis: ['Right-handed', 'Left-handed'] };

    await q(
      `INSERT INTO athlete_sports (athlete_id, sport_id, position, years_experience, is_seed)
       VALUES ($1, $2, $3, $4, true)`,
      [aid, sportsIds[mainSport], (positions[mainSport] || ['Athlete'])[i % 2], fcNum(2, 12)],
    );
    await q(
      `INSERT INTO athlete_sports (athlete_id, sport_id, position, years_experience, is_seed)
       VALUES ($1, $2, $3, $4, true)`,
      [aid, sportsIds[secondSport], null, fcNum(2, 8)],
    );

    const templates = { mainTemplate: null, secondTemplate: null };
    const tpl = await q('SELECT id, stat_template, slug FROM sports WHERE id = $1', [sportsIds[mainSport]]);
    { const t = tpl.rows[0]; templates.mainTemplate = t.stat_template; }
    const vals = {};
    for (const f of templates.mainTemplate) {
      if (f.type === 'int') vals[f.key] = 5 + (i * 3) % 60;
      else if (f.type === 'number') vals[f.key] = +(10 + i * 1.3).toFixed(2);
      else if (f.type === 'text') vals[f.key] = f.key;
      else vals[f.key] = i % 2 === 0;
    }
    await q(
      `INSERT INTO athlete_statistics (athlete_id, sport_id, stat_values, recorded_on, is_seed)
       VALUES ($1, $2, $3, $4::date, true)`,
      [aid, sportsIds[mainSport], JSON.stringify(vals), dateShift(40)],
    );

    await q(
      `INSERT INTO athlete_achievements (athlete_id, title, description, achieved_at, is_seed)
       VALUES ($1, $2, $3, $4, true)`,
      [aid, ['Regional finalist', 'Provincial champion', 'Most improved player', 'Team of the season'][i % 4],
        'Achieved at a regional level competition.', dateShift(200 + i * 30)],
    );
  }

  // --- Tournaments ----------------------------------------------------------
  // deadline = +N days (future), start = +N days future for upcoming events,
  // or negative days in the past for already-started/completed ones.
  const TOURNAMENTS = [
    { title: 'Metro Open Championship', status: 'registration_open', deadline: 14, start: 40, max: 24 },
    { title: 'National Youth Cup', status: 'registration_open', deadline: 21, start: 50, max: 32 },
    { title: 'Coastal Invitational', status: 'published', deadline: 45, start: 70, max: 16 },
    { title: 'Academy League Finals', status: 'ongoing', deadline: 10, start: -6, max: 20 },
    { title: 'Royal Pavilion Summer Series', status: 'registration_closed', deadline: -2, start: 12, max: 28 },
    { title: 'Veterans Classic', status: 'completed', deadline: -40, start: -55, max: 12 },
  ];

  const tournamentRows = [];
  for (let i = 0; i < TOURNAMENTS.length; i += 1) {
    const tn = TOURNAMENTS[i];
    const startDate = offsetDate(tn.start);
    const endDate = offsetDate(tn.start + 5);
    const { rows } = await q(
      `INSERT INTO tournaments (organizer_id, category_id, title, description, eligibility_requirements,
          location_country, location_city, registration_deadline, start_date, end_date, max_participants,
          status, published_at, is_seed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true)
       RETURNING id, status, start_date, end_date`,
      [organizerIds[i % organizerIds.length], categoryIds[i % categoryIds.length], tn.title,
        `The ${tn.title} — one of the year's key events.`, 'Open to eligible registered athletes.',
        COUNTRIES_CITIES[(i * 2) % 12][0], COUNTRIES_CITIES[(i * 2) % 12][1],
        futureIso(tn.deadline), startDate, endDate,
        tn.max, tn.status, tn.status === 'published' || tn.status === 'registration_open' ? futureIso(-5) : null],
    );
    tournamentRows.push({ ...rows[0], max: tn.max });
  }

  // --- Sponsorship packages + requests --------------------------------------
  const packageByTournament = {};
  const packageIdsForRequest = [];
  for (let i = 0; i < tournamentRows.length; i += 1) {
    const t = tournamentRows[i];
    const pkgs = [
      { name: 'Title Sponsor', price: [800, 600][i % 2] * 100, currency: 'USD', max_slots: 1 },
      { name: 'Kit Sponsor', price: 1200, currency: 'USD', max_slots: 2 },
      { name: 'On-site Partner', price: 450, currency: 'USD', max_slots: 4 },
    ];
    const rows = [];
    for (const p of pkgs) {
      const { rows: pr } = await q(
        `INSERT INTO sponsorship_packages (tournament_id, name, price, currency, benefits_description, max_slots, is_seed)
         VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING id`,
        [t.id, p.name, p.price, p.currency, `Brand visibility across ${t.title}.`, p.max_slots],
      );
      rows.push(pr[0].id);
    }
    packageByTournament[t.id] = rows;
    packageIdsForRequest.push(...rows);
  }

  for (let i = 0; i < packageIdsForRequest.length; i += 1) {
    const pkgId = packageIdsForRequest[i];
    const t = tournamentRows[i % tournamentRows.length];
    const status = i % 5 === 0 ? 'active' : i % 4 === 0 ? 'pending' : i % 3 === 0 ? 'rejected' : 'active';
    await q(
      `INSERT INTO sponsorship_requests (sponsor_id, tournament_id, package_id, status, requested_at, decided_at, is_seed)
       VALUES ($1, $2, $3, $4, $5::timestamptz, CASE WHEN $4 = 'pending' THEN NULL ELSE $5::timestamptz END, true)`,
      [sponsorProfileIds[i % sponsorProfileIds.length], t.id, pkgId, status, futureIso(-8 - (i % 10))],
    );
  }

  // --- Applications + participants + results --------------------------------
  const appRows = [];
  const applyTo = (tournament, athleteIdx, status) => {
    const aid = athleteProfileIds[athleteIdx];
    const sportId = sportsIds[['football', 'basketball', 'tennis'][athleteIdx % 3]];
    return q(
      `INSERT INTO tournament_applications (tournament_id, athlete_id, sport_id, status, notes, applied_at, decided_at, is_seed)
       VALUES ($1, $2, $3, $4, $5, $6::timestamptz, CASE WHEN $4 IN ('pending','withdrawn') THEN NULL ELSE $6::timestamptz END, true)
       RETURNING id, tournament_id, athlete_id, status`,
      [tournament.id, aid, sportId, status, 'Seeking an opportunity to compete.', futureIso(-12)],
    ).then((r) => r.rows[0]);
  };

  for (let i = 0; i < tournamentRows.length; i += 1) {
    const t = tournamentRows[i];
    if (t.status === 'draft') continue;
    const participants = 2 + (i * 2);
    for (let a = 0; a < participants; a += 1) {
      if (a >= athleteProfileIds.length) break;
      const status = a % 5 === 0 ? 'pending' : 'approved';
      if (a % 7 === 0 && t.status === 'registration_open') {
        // a couple of waitlisted applications on open tournaments
        appRows.push(await applyTo(t, a, 'waitlisted'));
        continue;
      }
      appRows.push(await applyTo(t, a, status));
      if (status === 'approved') {
        await q(
          `INSERT INTO tournament_participants (tournament_id, athlete_id, joined_at, is_seed)
           VALUES ($1, $2, $3::timestamptz, true)`,
          [t.id, athleteProfileIds[a], futureIso(-6 - a)],
        );
      }
    }
  }

  // Results + statistics for the completed tournament.
  const completed = tournamentRows.find((t) => t.status === 'completed');
  if (completed) {
    const { rows: participants } = await q(
      'SELECT athlete_id FROM tournament_participants WHERE tournament_id = $1 ORDER BY joined_at', [completed.id],
    );
    for (let i = 0; i < participants.length; i += 1) {
      await q(
        `INSERT INTO tournament_results (tournament_id, athlete_id, placement, prize_description, details, is_seed)
         VALUES ($1, $2, $3, $4, $5, true)`,
        [completed.id, participants[i].athlete_id, i + 1, i + 1 <= 3 ? `Medal & cash prize for podium` : null,
          JSON.stringify({ notes: 'Official results.' })],
      );
    }
  }

  // --- Shortlists + notes ----------------------------------------------------
  for (let s = 0; s < scoutProfileIds.length; s += 1) {
    for (let a = 0; a < 4; a += 1) {
      const aid = athleteProfileIds[(s * 2 + a) % athleteProfileIds.length];
      await q(
        `INSERT INTO shortlisted_athletes (scout_id, athlete_id, is_seed) VALUES ($1, $2, true)
         ON CONFLICT DO NOTHING`,
        [scoutProfileIds[s], aid],
      );
      await q(
        `INSERT INTO scouting_notes (scout_id, athlete_id, note, is_seed)
         VALUES ($1, $2, $3, true)`,
        [scoutProfileIds[s], aid, 'Strong technical base; worth tracking this season.'],
      );
    }
  }

  // --- Messages --------------------------------------------------------------
  const { rows: thread } = await q(
    `INSERT INTO message_threads (scout_id, athlete_id, is_seed) VALUES ($1, $2, true) RETURNING id`,
    [scoutProfileIds[0], athleteProfileIds[0]],
  );
  await q(
    `INSERT INTO messages (thread_id, sender_user_id, sender_role, body, is_seed)
     VALUES ($1, $2, 'scout', 'Hi, I came across your profile. Congratulations on last season.', true),
            ($1, $3, 'athlete', 'Thank you! Open to discussing opportunities.', true)`,
    [thread[0].id, scoutUserIds[0], athleteUserIds[0]],
  );

  // --- Verification requests -------------------------------------------------
  for (let i = 0; i < athleteProfileIds.length; i += 1) {
    const status = verificationFor(i);
    if (status === 'pending' || status === 'verified') {
      await q(
        `INSERT INTO verification_requests (athlete_id, status, requested_at, reviewed_by, review_note, reviewed_at, is_seed)
         VALUES ($1, $2, $3::timestamptz, $4, $5, CASE WHEN $2 = 'verified' THEN $3::timestamptz ELSE NULL END, true)`,
        [athleteProfileIds[i], status, futureIso(-10), adminId, 'Supporting documents reviewed.'],
      );
    }
  }

  // --- Notifications ----------------------------------------------------------
  const sampleNotifs = [
    ['athlete', 'application_approved', 'Application approved', 'Your application to "Academy League Finals" was approved.'],
    ['athlete', 'scout_contact', 'A scout contacted you', 'A scout has started a conversation with you.'],
    ['organizer', 'application_submitted', 'New application', 'An athlete applied to one of your tournaments.'],
    ['sponsor', 'sponsorship_active', 'Sponsorship active', 'Your sponsorship is now active.'],
  ];
  for (const [role, type, title, body] of sampleNotifs) {
    const userRow = await q(
      `SELECT id FROM users WHERE role = $1 AND is_seed ORDER BY created_at LIMIT 1`, [role],
    );
    if (userRow.rowCount) {
      await q(
        `INSERT INTO notifications (user_id, type, title, body, is_seed) VALUES ($1, $2, $3, $4, true)`,
        [userRow.rows[0].id, type, title, body],
      );
    }
  }

  await client.query('COMMIT');

  console.log('Seed complete. Demo login for every role (password: Password123!):');
  console.log('  admin@taloria.demo   | admin');
  console.log('  athlete1@taloria.demo | athlete');
  console.log('  scout1@taloria.demo  | scout');
  console.log('  organizer1@taloria.demo | organizer');
  console.log('  sponsor1@taloria.demo | sponsor');
  await client.end();
}

seed().catch(async (err) => {
  console.error('Seed failed:', err.message);
  await client.query('ROLLBACK').catch(() => {});
  await client.end();
  process.exit(1);
});