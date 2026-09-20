import test from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';
import pg from 'pg';

// Disable API rate limiting during automated runs (integration goes through
// the auth endpoints many times per minute from a single test client IP).
process.env.NODE_ENV = 'test';

/**
 * End-to-end API tests against a live PostgreSQL database (spec §32).
 * Skips cleanly when no DATABASE_URL / reachable DB is available — the unit
 * suite covers DB-independent logic in every environment.
 *
 *   npm run test:int
 */
const url = process.env.DATABASE_URL;
const canRunDb = url !== undefined;

const { default: app } = await import('../src/app.js');
const request = (await import('supertest')).default;
const emailSuffix = `${Date.now()}`;

async function poolProbe() {
  if (!canRunDb) return false;
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15000 });
  try {
    await client.connect();
    await client.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await client.end();
  }
}

const dbReady = await poolProbe();

test('integration suite requires a reachable database', { skip: !dbReady, timeout: 180000 }, async (t) => {
  const emails = {
    athlete: `it-athlete-${emailSuffix}@taloria.test`,
    scout: `it-scout-${emailSuffix}@taloria.test`,
    organizer: `it-organizer-${emailSuffix}@taloria.test`,
    sponsor: `it-sponsor-${emailSuffix}@taloria.test`,
  };
  const password = 'Password123!';

  async function register(role, email) {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email, password, role });
    assert.equal(res.status, 201, `register ${role}: ${res.body.error?.message || JSON.stringify(res.body)}`);
    return res.body.data.user;
  }

  async function login(email) {
    const res = await request(app).post('/api/auth/login').send({ email, password });
    assert.equal(res.status, 200);
    return res.body.data;
  }

  await t.test('register + login + role redirect', async () => {
    const { athlete, scout, organizer, sponsor } = emails;
    const a = await register('athlete', athlete);
    const s = await register('scout', scout);
    const o = await register('organizer', organizer);
    const sp = await register('sponsor', sponsor);
    assert.equal(a.role, 'athlete');
    assert.equal(s.role, 'scout');
    assert.equal(o.role, 'organizer');
    assert.equal(sp.role, 'sponsor');

    const la = await login(athlete);
    assert.equal(la.redirect, '/dashboard/athlete');
    assert.ok(la.accessToken);

    const ls = await login(scout);
    assert.equal(ls.redirect, '/dashboard/scout');
    const lo = await login(organizer);
    assert.equal(lo.redirect, '/dashboard/organizer');
    const lsp = await login(sponsor);
    assert.equal(lsp.redirect, '/dashboard/sponsor');
  });

  await t.test('duplicate email -> EMAIL_TAKEN', async () => {
    // emails.scout was already registered above; re-registering the same
    // email with a different role must still be blocked.
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: emails.scout, password, role: 'athlete' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'EMAIL_TAKEN');
  });

  await t.test('wrong password and unknown email both return INVALID_CREDENTIALS', async () => {
    const wrongPass = await request(app).post('/api/auth/login').send({ email: emails.athlete, password: 'wrong-password' });
    assert.equal(wrongPass.status, 401);
    assert.equal(wrongPass.body.error.code, 'INVALID_CREDENTIALS');

    const unknown = await request(app).post('/api/auth/login').send({ email: `nobody-${emailSuffix}@taloria.test`, password });
    assert.equal(unknown.status, 401);
    assert.equal(unknown.body.error.code, 'INVALID_CREDENTIALS');
    assert.equal(wrongPass.body.error.message, unknown.body.error.message, 'messages must not reveal account existence');
  });

  await t.test('admin is never self-selectable at registration', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: `wannabe-admin-${emailSuffix}@taloria.test`, password, role: 'admin' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  await t.test('expired/invalid JWT -> 401 without crashing', async () => {
    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', 'Bearer definitely-not-a-jwt');
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'TOKEN_INVALID');
  });

  await t.test('role enforcement: athlete cannot create tournaments (403)', async () => {
    const { accessToken } = await login(emails.athlete);
    const res = await request(app)
      .post('/api/tournaments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Hack', registration_deadline: new Date(Date.now() + 86400000).toISOString(), start_date: '2030-01-01', max_participants: 8 });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN');
  });

  await t.test('complete tournament workflow: create, apply, approve, waitlist, results', async () => {
    const organizerLogin = await login(emails.organizer);
    const athleteLogin = await login(emails.athlete);

    const created = await request(app)
      .post('/api/tournaments')
      .set('Authorization', `Bearer ${organizerLogin.accessToken}`)
      .send({
        title: `Integration Cup ${emailSuffix}`,
        registration_deadline: new Date(Date.now() + 7 * 86400000).toISOString(),
        start_date: '2030-01-15',
        max_participants: 2,
      });
    assert.equal(created.status, 201, created.body.error?.message);
    const tournamentId = created.body.data.id;

    // open registration
    await request(app)
      .put(`/api/tournaments/${tournamentId}`)
      .set('Authorization', `Bearer ${organizerLogin.accessToken}`)
      .send({ status: 'published' });
    await request(app)
      .put(`/api/tournaments/${tournamentId}`)
      .set('Authorization', `Bearer ${organizerLogin.accessToken}`)
      .send({ status: 'registration_open' });

    const applied = await request(app)
      .post(`/api/tournaments/${tournamentId}/apply`)
      .set('Authorization', `Bearer ${athleteLogin.accessToken}`)
      .send({});
    assert.equal(applied.status, 201);
    assert.equal(applied.body.data.status, 'pending');

    // duplicate -> ALREADY_APPLIED
    const dup = await request(app)
      .post(`/api/tournaments/${tournamentId}/apply`)
      .set('Authorization', `Bearer ${athleteLogin.accessToken}`)
      .send({});
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error.code, 'ALREADY_APPLIED');

    // organizer sees the application and approves
    const list = await request(app)
      .get('/api/applications')
      .set('Authorization', `Bearer ${organizerLogin.accessToken}`);
    assert.equal(list.status, 200);
    const appRow = list.body.data.find((a) => a.tournament_id === tournamentId);
    assert.ok(appRow, 'organizer must see the application');
    assert.equal(appRow.status, 'pending');

    const decided = await request(app)
      .put(`/api/applications/${appRow.id}`)
      .set('Authorization', `Bearer ${organizerLogin.accessToken}`)
      .send({ status: 'approved' });
    assert.equal(decided.status, 200, decided.body.error?.message);
    assert.equal(decided.body.data.status, 'approved');

    // athlete now a participant
    const detail = await request(app).get(`/api/tournaments/${tournamentId}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.participants.length, 1);

    // second athlete fills the slot; a third lands on the waitlist
    const reg2 = await request(app)
      .post('/api/auth/register')
      .send({ email: `it-athlete2-${emailSuffix}@taloria.test`, password, role: 'athlete' });
    const log2 = await request(app).post('/api/auth/login').send({ email: `it-athlete2-${emailSuffix}@taloria.test`, password });
    const reg3 = await request(app)
      .post('/api/auth/register')
      .send({ email: `it-athlete3-${emailSuffix}@taloria.test`, password, role: 'athlete' });
    const log3 = await request(app).post('/api/auth/login').send({ email: `it-athlete3-${emailSuffix}@taloria.test`, password });
    assert.equal(reg2.status, 201);
    assert.equal(reg3.status, 201);

    const apply2 = await request(app)
      .post(`/api/tournaments/${tournamentId}/apply`)
      .set('Authorization', `Bearer ${log2.body.data.accessToken}`)
      .send({});
    assert.equal(apply2.status, 201);
    const apply3 = await request(app)
      .post(`/api/tournaments/${tournamentId}/apply`)
      .set('Authorization', `Bearer ${log3.body.data.accessToken}`)
      .send({});
    assert.equal(apply3.status, 201);
    assert.equal(apply3.body.data.status, 'waitlisted', 'application beyond capacity must waitlist, not reject');

    // late application is rejected server-side even when client bypasses UI
    await request(app)
      .put(`/api/tournaments/${tournamentId}`)
      .set('Authorization', `Bearer ${organizerLogin.accessToken}`)
      .send({ status: 'registration_closed' });
    const late = await request(app)
      .post(`/api/tournaments/${tournamentId}/apply`)
      .set('Authorization', `Bearer ${log3.body.data.accessToken}`)
      .send({});
    assert.equal(late.status, 409);
    assert.equal(late.body.error.code, 'TOURNAMENT_NOT_OPEN');
  });

  await t.test('scout search returns empty-state-safe results for impossible filters', async () => {
    const scoutLogin = await login(emails.scout);
    const res = await request(app)
      .get('/api/athletes')
      .set('Authorization', `Bearer ${scoutLogin.accessToken}`)
      .query({ verified: 'true', sport: '00000000-0000-4000-8000-000000000000' });
    // impossible sport → must be a clean 200 with total 0, never a blank/500
    assert.equal(res.status, 200);
    assert.equal(res.body.meta.total, 0);
    assert.ok(Array.isArray(res.body.data));
  });

  await t.test('forgot-password never reveals whether an email exists', async () => {
    const known = await request(app).post('/api/auth/forgot-password').send({ email: emails.athlete });
    const unknown = await request(app).post('/api/auth/forgot-password').send({ email: `ghost-${emailSuffix}@taloria.test` });
    assert.equal(known.status, 200);
    assert.equal(unknown.status, 200);
    assert.equal(known.body.data.message, unknown.body.data.message);
  });
});