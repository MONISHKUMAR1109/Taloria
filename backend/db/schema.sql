-- ============================================================================
-- TALORIA — Phase 1 schema
-- PostgreSQL 15+
-- Conventions:
--   * Every table has id (UUID PK), created_at, updated_at (server-managed).
--   * Seedable tables carry is_seed BOOLEAN DEFAULT false (see scripts/seed.js).
--   * Enums are TEXT + CHECK constraints so states stay easy to evolve.
--   * All times stored as timestamptz (UTC internally).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------------------
-- Updated-at trigger (server-managed timestamps)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id                               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                            citext NOT NULL UNIQUE,
  password_hash                    text NOT NULL,
  -- A user selects a desired role at registration; assignment is the
  -- server's decision. Admin is never self-selectable (enforced in app).
  role                             text NOT NULL CHECK (role IN ('athlete','scout','organizer','sponsor','admin')),
  account_status                   text NOT NULL DEFAULT 'active' CHECK (account_status IN ('active','suspended')),
  email_verified_at                timestamptz,
  email_verification_token_hash    text,
  email_verification_token_expires_at timestamptz,
  password_reset_token_hash        text,
  password_reset_token_expires_at  timestamptz,
  is_seed                          boolean NOT NULL DEFAULT false,
  created_at                       timestamptz NOT NULL DEFAULT now(),
  updated_at                       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_role ON users (role);
CREATE INDEX idx_users_email_verification_hash ON users (email_verification_token_hash) WHERE email_verification_token_hash IS NOT NULL;
CREATE INDEX idx_users_password_reset_hash ON users (password_reset_token_hash) WHERE password_reset_token_hash IS NOT NULL;
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Role-specific profiles (one row per role table, FK -> users)
-- ---------------------------------------------------------------------------
CREATE TABLE athlete_profiles (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  first_name         text,
  last_name          text,
  date_of_birth      date,
  country            text,
  city               text,
  bio                text,
  profile_picture_key text,
  -- unverified -> pending -> verified | rejected
  verification_status text NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified','pending','verified','rejected')),
  -- Soft-archive used only by Admin role changes (§4.2): the old profile row is
  -- archived and a new one of the new role is created against the same user_id.
  archived_at        timestamptz,
  is_seed            boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_athlete_profiles_country ON athlete_profiles (country);
CREATE INDEX idx_athlete_profiles_city ON athlete_profiles (city);
CREATE INDEX idx_athlete_profiles_dob ON athlete_profiles (date_of_birth);
CREATE INDEX idx_athlete_profiles_verification ON athlete_profiles (verification_status);
CREATE TRIGGER trg_athlete_profiles_updated BEFORE UPDATE ON athlete_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE scout_profiles (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  first_name       text,
  last_name        text,
  organization     text,
  country          text,
  city             text,
  bio              text,
  years_scouting   integer CHECK (years_scouting >= 0),
  archived_at      timestamptz,
  is_seed          boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_scout_profiles_updated BEFORE UPDATE ON scout_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE organizer_profiles (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  organization_name text,
  organization_type text,
  country           text,
  city              text,
  bio               text,
  archived_at       timestamptz,
  is_seed           boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_organizer_profiles_updated BEFORE UPDATE ON organizer_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE sponsor_profiles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  company_name  text,
  industry      text,
  website       text,
  country       text,
  bio           text,
  archived_at   timestamptz,
  is_seed       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_sponsor_profiles_updated BEFORE UPDATE ON sponsor_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Reference / config tables
-- ---------------------------------------------------------------------------
CREATE TABLE sports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL UNIQUE,
  slug          text NOT NULL UNIQUE,
  description   text,
  -- Field definition validated against every write to athlete_statistics,
  -- e.g. [{"key":"goals","label":"Goals","type":"int"},{"key":"assists","label":"Assists","type":"int"}]
  stat_template jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_seed       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_sports_updated BEFORE UPDATE ON sports FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE tournament_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  is_seed    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_tournament_categories_updated BEFORE UPDATE ON tournament_categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Age categories are a config table; age is computed at query time from
-- athlete_profiles.date_of_birth and never stored redundantly on the profile.
CREATE TABLE age_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  min_age    integer NOT NULL CHECK (min_age >= 0),
  max_age    integer CHECK (max_age IS NULL OR max_age >= min_age),
  sort_order integer NOT NULL DEFAULT 0,
  is_seed    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_age_categories_order ON age_categories (sort_order);
CREATE TRIGGER trg_age_categories_updated BEFORE UPDATE ON age_categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Athlete sport/stat/achievement data
-- ---------------------------------------------------------------------------
CREATE TABLE athlete_sports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id       uuid NOT NULL REFERENCES athlete_profiles(id) ON DELETE CASCADE,
  sport_id         uuid NOT NULL REFERENCES sports(id) ON DELETE RESTRICT,
  position         text,
  years_experience numeric(4,1) CHECK (years_experience >= 0),
  is_seed          boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (athlete_id, sport_id)
);
CREATE INDEX idx_athlete_sports_sport ON athlete_sports (sport_id);
CREATE INDEX idx_athlete_sports_experience ON athlete_sports (years_experience);
CREATE TRIGGER trg_athlete_sports_updated BEFORE UPDATE ON athlete_sports FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE athlete_statistics (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id  uuid NOT NULL REFERENCES athlete_profiles(id) ON DELETE CASCADE,
  sport_id    uuid NOT NULL REFERENCES sports(id) ON DELETE RESTRICT,
  -- Validated server-side against sports.stat_template on every write.
  stat_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_on date NOT NULL DEFAULT CURRENT_DATE,
  is_seed     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_athlete_statistics_athlete ON athlete_statistics (athlete_id);
CREATE INDEX idx_athlete_statistics_sport ON athlete_statistics (sport_id);
CREATE INDEX idx_athlete_statistics_recorded ON athlete_statistics (recorded_on);
CREATE TRIGGER trg_athlete_statistics_updated BEFORE UPDATE ON athlete_statistics FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE athlete_achievements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id    uuid NOT NULL REFERENCES athlete_profiles(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text,
  achieved_at   date NOT NULL DEFAULT CURRENT_DATE,
  document_key  text,
  is_seed       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_athlete_achievements_athlete ON athlete_achievements (athlete_id);
CREATE TRIGGER trg_athlete_achievements_updated BEFORE UPDATE ON athlete_achievements FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE performance_videos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES athlete_profiles(id) ON DELETE CASCADE,
  title      text NOT NULL,
  object_key text NOT NULL,
  mime_type  text,
  size_bytes bigint CHECK (size_bytes >= 0),
  is_seed    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_performance_videos_athlete ON performance_videos (athlete_id);
CREATE TRIGGER trg_performance_videos_updated BEFORE UPDATE ON performance_videos FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Backstop: max 3 performance videos per athlete (app enforces with a clean
-- error code first; this protects DB integrity).
CREATE OR REPLACE FUNCTION enforce_max_videos() RETURNS trigger AS $$
BEGIN
  IF (SELECT count(*) FROM performance_videos WHERE athlete_id = NEW.athlete_id) >= 3 THEN
    RAISE EXCEPTION 'VIDEO_LIMIT_REACHED';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_performance_videos_limit BEFORE INSERT OR UPDATE ON performance_videos
  FOR EACH ROW EXECUTE FUNCTION enforce_max_videos();

-- ---------------------------------------------------------------------------
-- Tournaments
-- ---------------------------------------------------------------------------
CREATE TABLE tournaments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id           uuid NOT NULL REFERENCES organizer_profiles(id) ON DELETE RESTRICT,
  category_id            uuid REFERENCES tournament_categories(id) ON DELETE RESTRICT,
  title                  text NOT NULL,
  description            text,
  eligibility_requirements text,
  location_country       text,
  location_city          text,
  registration_deadline  timestamptz NOT NULL,
  start_date             date NOT NULL,
  end_date               date,
  max_participants       integer NOT NULL CHECK (max_participants > 0),
  -- draft -> published -> registration_open -> registration_closed
  -- -> ongoing -> completed  |  cancelled from any state
  status                 text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','published','registration_open','registration_closed','ongoing','completed','cancelled')),
  published_at           timestamptz,
  is_seed                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX idx_tournaments_organizer ON tournaments (organizer_id);
CREATE INDEX idx_tournaments_category ON tournaments (category_id);
CREATE INDEX idx_tournaments_status ON tournaments (status);
CREATE INDEX idx_tournaments_deadline ON tournaments (registration_deadline);
CREATE INDEX idx_tournaments_start ON tournaments (start_date);
CREATE TRIGGER trg_tournaments_updated BEFORE UPDATE ON tournaments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE tournament_applications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  athlete_id  uuid NOT NULL REFERENCES athlete_profiles(id) ON DELETE CASCADE,
  sport_id    uuid REFERENCES sports(id) ON DELETE RESTRICT,
  -- pending -> approved | rejected | waitlisted ; athlete may withdraw.
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','waitlisted','withdrawn')),
  applied_at  timestamptz NOT NULL DEFAULT now(),
  decided_at  timestamptz,
  notes       text,
  is_seed     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
-- An athlete can apply once per tournament. Withdrawn rows are excluded so a
-- withdrawn athlete may re-apply later.
CREATE UNIQUE INDEX uq_tournament_applications_open
  ON tournament_applications (tournament_id, athlete_id)
  WHERE status <> 'withdrawn';
CREATE INDEX idx_tournament_applications_tournament ON tournament_applications (tournament_id, status);
CREATE INDEX idx_tournament_applications_athlete ON tournament_applications (athlete_id);
CREATE TRIGGER trg_tournament_applications_updated BEFORE UPDATE ON tournament_applications FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE tournament_participants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  athlete_id   uuid NOT NULL REFERENCES athlete_profiles(id) ON DELETE CASCADE,
  joined_at    timestamptz NOT NULL DEFAULT now(),
  is_seed      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, athlete_id)
);
CREATE INDEX idx_tournament_participants_athlete ON tournament_participants (athlete_id);
CREATE TRIGGER trg_tournament_participants_updated BEFORE UPDATE ON tournament_participants FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE tournament_results (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id    uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  athlete_id       uuid NOT NULL REFERENCES athlete_profiles(id) ON DELETE CASCADE,
  placement        integer NOT NULL CHECK (placement > 0),
  prize_description text,
  -- e.g. {"score": 98.4} — never a synthetic aggregate the athlete didn't enter
  details          jsonb,
  is_seed          boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, athlete_id)
);
CREATE INDEX idx_tournament_results_athlete ON tournament_results (athlete_id);
CREATE TRIGGER trg_tournament_results_updated BEFORE UPDATE ON tournament_results FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Sponsorship
-- ---------------------------------------------------------------------------
CREATE TABLE sponsorship_packages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id       uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name                text NOT NULL,
  price               numeric(12,2) NOT NULL CHECK (price >= 0),
  currency            char(3) NOT NULL DEFAULT 'USD',
  benefits_description text,
  max_slots           integer NOT NULL DEFAULT 1 CHECK (max_slots > 0),
  is_seed             boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sponsorship_packages_tournament ON sponsorship_packages (tournament_id);
CREATE TRIGGER trg_sponsorship_packages_updated BEFORE UPDATE ON sponsorship_packages FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE sponsorship_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_id    uuid NOT NULL REFERENCES sponsor_profiles(id) ON DELETE CASCADE,
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  package_id    uuid NOT NULL REFERENCES sponsorship_packages(id) ON DELETE CASCADE,
  -- pending -> active (organizer approval) | rejected | cancelled
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','rejected','cancelled')),
  requested_at  timestamptz NOT NULL DEFAULT now(),
  decided_at    timestamptz,
  is_seed       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
-- A sponsor may not resubmit the same package twice while it is not rejected.
CREATE UNIQUE INDEX uq_sponsorship_requests_open
  ON sponsorship_requests (sponsor_id, tournament_id, package_id)
  WHERE status <> 'rejected';
CREATE INDEX idx_sponsorship_requests_tournament ON sponsorship_requests (tournament_id, status);
CREATE INDEX idx_sponsorship_requests_sponsor ON sponsorship_requests (sponsor_id);
CREATE INDEX idx_sponsorship_requests_package ON sponsorship_requests (package_id);
CREATE TRIGGER trg_sponsorship_requests_updated BEFORE UPDATE ON sponsorship_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Backstop: never more active sponsors per package than max_slots.
CREATE OR REPLACE FUNCTION enforce_sponsorship_slots() RETURNS trigger AS $$
DECLARE
  v_max integer;
BEGIN
  IF NEW.status IN ('active','pending') THEN
    SELECT max_slots INTO v_max FROM sponsorship_packages WHERE id = NEW.package_id;
    IF (SELECT count(*)
          FROM sponsorship_requests
         WHERE package_id = NEW.package_id AND status = 'active') >= v_max THEN
      RAISE EXCEPTION 'SPONSORSHIP_SLOT_FULL';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sponsorship_requests_slots BEFORE INSERT OR UPDATE ON sponsorship_requests
  FOR EACH ROW EXECUTE FUNCTION enforce_sponsorship_slots();

-- ---------------------------------------------------------------------------
-- Scouting
-- ---------------------------------------------------------------------------
CREATE TABLE shortlisted_athletes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scout_id   uuid NOT NULL REFERENCES scout_profiles(id) ON DELETE CASCADE,
  athlete_id uuid NOT NULL REFERENCES athlete_profiles(id) ON DELETE CASCADE,
  is_seed    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scout_id, athlete_id)
);
CREATE INDEX idx_shortlisted_athletes_athlete ON shortlisted_athletes (athlete_id);
CREATE TRIGGER trg_shortlisted_athletes_updated BEFORE UPDATE ON shortlisted_athletes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE scouting_notes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scout_id     uuid NOT NULL REFERENCES scout_profiles(id) ON DELETE CASCADE,
  athlete_id   uuid NOT NULL REFERENCES athlete_profiles(id) ON DELETE CASCADE,
  note         text NOT NULL,
  is_seed      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_scouting_notes_scout ON scouting_notes (scout_id);
CREATE INDEX idx_scouting_notes_athlete ON scouting_notes (athlete_id);
CREATE TRIGGER trg_scouting_notes_updated BEFORE UPDATE ON scouting_notes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Messaging (scout <-> athlete only in v1)
-- ---------------------------------------------------------------------------
-- A thread is keyed on (scout_id, athlete_id). An athlete blocking a scout
-- sets blocked_at on the thread row; this also prevents new-thread creation
-- before the first message exists.
CREATE TABLE message_threads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scout_id    uuid NOT NULL REFERENCES scout_profiles(id) ON DELETE CASCADE,
  athlete_id  uuid NOT NULL REFERENCES athlete_profiles(id) ON DELETE CASCADE,
  blocked_at  timestamptz,
  is_seed     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scout_id, athlete_id)
);
CREATE INDEX idx_message_threads_athlete ON message_threads (athlete_id);
CREATE TRIGGER trg_message_threads_updated BEFORE UPDATE ON message_threads FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   uuid NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_role  text NOT NULL CHECK (sender_role IN ('scout','athlete')),
  body        text NOT NULL CHECK (char_length(body) > 0),
  read_at     timestamptz,
  is_seed     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_thread ON messages (thread_id, created_at);
CREATE TRIGGER trg_messages_updated BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       text NOT NULL,
  title      text NOT NULL,
  body       text,
  read_at    timestamptz,
  is_seed    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON notifications (user_id, read_at, created_at);
CREATE TRIGGER trg_notifications_updated BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Reports, verification, audit
-- ---------------------------------------------------------------------------
CREATE TABLE reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type      text NOT NULL,
  entity_id        uuid,
  reason           text NOT NULL,
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','dismissed')),
  handled_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  is_seed          boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_reports_status ON reports (status);
CREATE TRIGGER trg_reports_updated BEFORE UPDATE ON reports FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE verification_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id  uuid NOT NULL REFERENCES athlete_profiles(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  review_note text,
  reviewed_at timestamptz,
  is_seed     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_verification_requests_status ON verification_requests (status);
CREATE INDEX idx_verification_requests_athlete ON verification_requests (athlete_id);
CREATE TRIGGER trg_verification_requests_updated BEFORE UPDATE ON verification_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id   uuid,
  from_state  text,
  to_state    text,
  actor_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  details     jsonb,
  is_seed     boolean NOT NULL DEFAULT false,
  timestamp   timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_logs_actor ON audit_logs (actor_id);
CREATE TRIGGER trg_audit_logs_updated BEFORE UPDATE ON audit_logs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Auth
-- ---------------------------------------------------------------------------
CREATE TABLE refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id);
CREATE TRIGGER trg_refresh_tokens_updated BEFORE UPDATE ON refresh_tokens FOR EACH ROW EXECUTE FUNCTION set_updated_at();