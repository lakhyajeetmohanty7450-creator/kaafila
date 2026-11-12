-- KAAFILA PostgreSQL / Supabase Schema Migration
-- Normalized relational schema replacing MongoDB / Mongoose collections.
-- Compatible with Supabase PostgreSQL (15+) and PGlite test instances.

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. USERS (Core authentication & account identity)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL CHECK (char_length(trim(full_name)) >= 2 AND char_length(full_name) <= 100),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'rider' CHECK (role IN ('rider', 'organisation', 'admin')),
  phone_number TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 2. RIDER PROFILES
CREATE TABLE IF NOT EXISTS rider_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  handle TEXT NOT NULL UNIQUE,
  bio TEXT NOT NULL DEFAULT '',
  home_city TEXT NOT NULL DEFAULT '',
  primary_motorcycle TEXT NOT NULL DEFAULT '',
  riding_experience TEXT NOT NULL DEFAULT 'beginner'
    CHECK (riding_experience IN ('beginner', 'intermediate', 'advanced', 'expedition_veteran')),
  verified_kilometres NUMERIC(10, 1) NOT NULL DEFAULT 0 CHECK (verified_kilometres >= 0),
  completed_expeditions INTEGER NOT NULL DEFAULT 0 CHECK (completed_expeditions >= 0),
  rank TEXT NOT NULL DEFAULT 'Beginner'
    CHECK (rank IN ('Beginner', 'Explorer', 'Adventurer', 'Nomad', 'Pathfinder', 'Himalayan Legend')),
  emergency_contact JSONB NOT NULL DEFAULT '{"name":"","relationship":"","phone":"","bloodGroup":"","shareWithOrganisers":false}'::jsonb,
  is_profile_public BOOLEAN NOT NULL DEFAULT TRUE,
  can_create_groups BOOLEAN NOT NULL DEFAULT TRUE,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rider_profiles_public_km
  ON rider_profiles (is_profile_public, verified_kilometres DESC, completed_expeditions DESC);
CREATE INDEX IF NOT EXISTS idx_rider_profiles_rank ON rider_profiles (rank);

CREATE TRIGGER trg_rider_profiles_updated_at
  BEFORE UPDATE ON rider_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 3. ACHIEVEMENTS CATALOG
CREATE TABLE IF NOT EXISTS achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'bronze' CHECK (tier IN ('bronze', 'silver', 'gold', 'legend')),
  icon TEXT NOT NULL DEFAULT 'award',
  criteria_km INTEGER NOT NULL DEFAULT 0,
  criteria_rides INTEGER NOT NULL DEFAULT 0,
  criteria_checkpoints INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_achievements_updated_at
  BEFORE UPDATE ON achievements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. RIDER EARNED ACHIEVEMENTS (Normalized from embedded badges[])
CREATE TABLE IF NOT EXISTS rider_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_code TEXT NOT NULL,
  title TEXT NOT NULL,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, achievement_code)
);

CREATE INDEX IF NOT EXISTS idx_rider_achievements_user ON rider_achievements (user_id, awarded_at ASC);

-- 5. RIDER RANK HISTORY (Normalized from embedded rankHistory[])
CREATE TABLE IF NOT EXISTS rider_rank_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_rank TEXT NOT NULL,
  to_rank TEXT NOT NULL,
  verified_kilometres NUMERIC(10, 1) NOT NULL DEFAULT 0,
  completed_expeditions INTEGER NOT NULL DEFAULT 0,
  achievement_count INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT 'progress_update',
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rider_rank_history_user ON rider_rank_history (user_id, changed_at DESC);

-- 6. ORGANISATIONS
CREATE TABLE IF NOT EXISTS organisations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) >= 2 AND char_length(name) <= 140),
  slug TEXT NOT NULL UNIQUE,
  location JSONB NOT NULL DEFAULT '{"city":"","state":"","country":"India","address":""}'::jsonb,
  operating_regions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  short_description TEXT NOT NULL DEFAULT '',
  about TEXT NOT NULL DEFAULT '',
  logo_url TEXT NOT NULL DEFAULT '',
  cover_image_url TEXT NOT NULL DEFAULT '',
  official_website TEXT NOT NULL DEFAULT '',
  booking_url TEXT NOT NULL DEFAULT '',
  contact_number TEXT NOT NULL DEFAULT '',
  founded_year INTEGER,
  verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  facilities JSONB NOT NULL DEFAULT '{"mechanicSupport":true,"backupVehicle":true,"medicalKit":true,"oxygenSupport":false,"accommodation":true,"gearRental":false,"customSummary":""}'::jsonb,
  rating_average NUMERIC(3, 1) NOT NULL DEFAULT 0 CHECK (rating_average >= 0 AND rating_average <= 5),
  review_count INTEGER NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organisations_owner ON organisations (owner_id);
CREATE INDEX IF NOT EXISTS idx_organisations_verified_rating ON organisations (is_verified DESC, rating_average DESC);

CREATE TRIGGER trg_organisations_updated_at
  BEFORE UPDATE ON organisations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 7. ORGANISATION MEMBERS
CREATE TABLE IF NOT EXISTS organisation_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_role TEXT NOT NULL DEFAULT 'owner'
    CHECK (member_role IN ('owner', 'lead_marshal', 'coordinator', 'mechanic')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'removed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organisation_id, user_id)
);

CREATE TRIGGER trg_organisation_members_updated_at
  BEFORE UPDATE ON organisation_members
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 8. RIDES (Expeditions)
CREATE TABLE IF NOT EXISTS rides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(trim(title)) >= 3 AND char_length(title) <= 160),
  slug TEXT NOT NULL UNIQUE,
  tagline TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL,
  start_location TEXT NOT NULL,
  end_location TEXT NOT NULL,
  max_altitude_meters INTEGER NOT NULL DEFAULT 0 CHECK (max_altitude_meters >= 0),
  distance_km INTEGER NOT NULL CHECK (distance_km >= 1),
  duration_days INTEGER NOT NULL CHECK (duration_days >= 1),
  difficulty TEXT NOT NULL DEFAULT 'challenging' CHECK (difficulty IN ('moderate', 'challenging', 'extreme')),
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  price_inr INTEGER NOT NULL CHECK (price_inr >= 0),
  price_own_bike_inr INTEGER CHECK (price_own_bike_inr IS NULL OR price_own_bike_inr >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  max_riders INTEGER NOT NULL DEFAULT 12 CHECK (max_riders >= 1),
  spots_remaining INTEGER NOT NULL DEFAULT 12 CHECK (spots_remaining >= 0),
  cover_image_url TEXT NOT NULL DEFAULT '',
  booking_url TEXT NOT NULL DEFAULT '',
  bike_rental_available BOOLEAN NOT NULL DEFAULT TRUE,
  facilities_summary TEXT NOT NULL DEFAULT '',
  highlights TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  itinerary JSONB NOT NULL DEFAULT '[]'::jsonb,
  route JSONB NOT NULL DEFAULT '{"startPoint":{"label":""},"endPoint":{"label":""},"geometry":{"type":"LineString","coordinates":[]},"dailySegments":[],"routeDescription":"","calculatedDistanceKm":0,"hasRouteData":false}'::jsonb,
  inclusions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  exclusions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published', 'upcoming', 'ongoing', 'completed', 'cancelled')),
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_rides_status_start ON rides (status, start_date);
CREATE INDEX IF NOT EXISTS idx_rides_org_start ON rides (organisation_id, start_date);
CREATE INDEX IF NOT EXISTS idx_rides_region_diff ON rides (region, difficulty);

CREATE TRIGGER trg_rides_updated_at
  BEFORE UPDATE ON rides
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 9. RIDE MEMBERS (Participation & Verified Km Credit)
CREATE TABLE IF NOT EXISTS ride_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'interested'
    CHECK (status IN ('interested', 'confirmed', 'completed', 'cancelled')),
  bike_choice TEXT NOT NULL DEFAULT 'rental' CHECK (bike_choice IN ('rental', 'own_bike')),
  share_contact_with_organisation BOOLEAN NOT NULL DEFAULT FALSE,
  verified_km_awarded NUMERIC(10, 1) NOT NULL DEFAULT 0 CHECK (verified_km_awarded >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ride_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ride_members_user_status ON ride_members (user_id, status);
CREATE INDEX IF NOT EXISTS idx_ride_members_ride_status ON ride_members (ride_id, status);

CREATE TRIGGER trg_ride_members_updated_at
  BEFORE UPDATE ON ride_members
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 10. REVIEWS
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ride_id UUID REFERENCES rides(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title TEXT NOT NULL,
  comment TEXT NOT NULL,
  is_verified_participant BOOLEAN NOT NULL DEFAULT FALSE,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organisation_id, author_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_org_created ON reviews (organisation_id, created_at DESC);

CREATE TRIGGER trg_reviews_updated_at
  BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 11. CONNECTIONS (1:1 Rider Social Connections)
CREATE TABLE IF NOT EXISTS connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (requester_id <> recipient_id),
  UNIQUE (requester_id, recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_connections_recipient_status ON connections (recipient_id, status);
CREATE INDEX IF NOT EXISTS idx_connections_requester_status ON connections (requester_id, status);

CREATE TRIGGER trg_connections_updated_at
  BEFORE UPDATE ON connections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 12. CONVERSATIONS (1:1 Private Chat Threads)
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_a_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  participant_b_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  participant_key TEXT NOT NULL UNIQUE,
  last_message_id UUID,
  last_message_text TEXT NOT NULL DEFAULT '',
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (participant_a_id <> participant_b_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_part_a ON conversations (participant_a_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_part_b ON conversations (participant_b_id, last_message_at DESC);

CREATE TRIGGER trg_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 13. KAAFILA GROUPS
CREATE TABLE IF NOT EXISTS kafila_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  cover_image_url TEXT NOT NULL DEFAULT '',
  organisation_id UUID REFERENCES organisations(id) ON DELETE SET NULL,
  ride_id UUID REFERENCES rides(id) ON DELETE SET NULL,
  destination TEXT NOT NULL DEFAULT '',
  start_date TIMESTAMPTZ,
  max_members INTEGER NOT NULL DEFAULT 40 CHECK (max_members BETWEEN 2 AND 500),
  description TEXT NOT NULL DEFAULT '',
  privacy TEXT NOT NULL DEFAULT 'public' CHECK (privacy IN ('public', 'private', 'invite_only')),
  voice_room_status TEXT NOT NULL DEFAULT 'coming_soon' CHECK (voice_room_status IN ('coming_soon', 'ready')),
  created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kafila_groups_privacy ON kafila_groups (privacy, created_at DESC);

CREATE TRIGGER trg_kafila_groups_updated_at
  BEFORE UPDATE ON kafila_groups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 14. GROUP MEMBERS
CREATE TABLE IF NOT EXISTS group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES kafila_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'marshal', 'member')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'pending_request', 'invited', 'left')),
  invited_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  location_sharing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_user_status ON group_members (user_id, status);
CREATE INDEX IF NOT EXISTS idx_group_members_group_status ON group_members (group_id, status);

CREATE TRIGGER trg_group_members_updated_at
  BEFORE UPDATE ON group_members
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 15. MESSAGES (Private DMs, Group Messages, and Group Announcements)
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  recipient_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  group_id UUID REFERENCES kafila_groups(id) ON DELETE CASCADE,
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'announcement', 'system')),
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL CHECK (char_length(content) <= 2000),
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  edited_at TIMESTAMPTZ,
  read_by UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((conversation_id IS NOT NULL AND group_id IS NULL) OR (group_id IS NOT NULL AND conversation_id IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_group_type_created ON messages (group_id, message_type, created_at DESC);

CREATE TRIGGER trg_messages_updated_at
  BEFORE UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 16. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN (
    'connection_request',
    'connection_accepted',
    'private_message',
    'group_invitation',
    'group_join_request',
    'group_join_accepted',
    'group_announcement',
    'group_membership',
    'achievement_earned',
    'rank_promoted',
    'tracking_verified'
  )),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications (recipient_id, is_read, created_at DESC);

CREATE TRIGGER trg_notifications_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 17. CHECKPOINTS (Expedition Route Waypoints / Stops)
CREATE TABLE IF NOT EXISTS checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'checkpoint'
    CHECK (type IN ('start', 'checkpoint', 'rest_stop', 'fuel_stop', 'important', 'destination')),
  lng DOUBLE PRECISION NOT NULL CHECK (lng >= -180 AND lng <= 180),
  lat DOUBLE PRECISION NOT NULL CHECK (lat >= -90 AND lat <= 90),
  altitude_meters INTEGER,
  sequence_number INTEGER NOT NULL DEFAULT 1 CHECK (sequence_number >= 1),
  radius_meters INTEGER NOT NULL DEFAULT 250 CHECK (radius_meters BETWEEN 50 AND 5000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_ride_seq ON checkpoints (ride_id, sequence_number ASC, created_at ASC);

CREATE TRIGGER trg_checkpoints_updated_at
  BEFORE UPDATE ON checkpoints
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 18. TRACKING SESSIONS (GPS Tracking & Anti-Spoofing Verification)
CREATE TABLE IF NOT EXISTS tracking_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ride_id UUID REFERENCES rides(id) ON DELETE SET NULL,
  group_id UUID REFERENCES kafila_groups(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'Riding Session',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'stopped', 'completed')),
  is_location_sharing_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  share_simplified_route_public BOOLEAN NOT NULL DEFAULT FALSE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paused_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  active_duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (active_duration_seconds >= 0),
  points JSONB NOT NULL DEFAULT '[]'::jsonb,
  simplified_public_route JSONB NOT NULL DEFAULT '[]'::jsonb,
  estimated_distance_km NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (estimated_distance_km >= 0),
  submitted_distance_km NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (submitted_distance_km >= 0),
  verified_distance_km NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (verified_distance_km >= 0),
  points_awarded_to_profile BOOLEAN NOT NULL DEFAULT FALSE,
  verification_status TEXT NOT NULL DEFAULT 'recording'
    CHECK (verification_status IN ('recording', 'pending_review', 'verified', 'flagged', 'rejected')),
  suspicious_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  distance_adjustments JSONB NOT NULL DEFAULT '[]'::jsonb,
  stats JSONB NOT NULL DEFAULT '{"totalPoints":0,"acceptedCount":0,"filteredPoorAccuracy":0,"filteredDuplicates":0,"filteredJumps":0,"maxObservedSpeedKmh":0,"averageAccuracyMeters":0}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tracking_sessions_user_status ON tracking_sessions (user_id, status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracking_sessions_ride_status ON tracking_sessions (ride_id, status);
CREATE INDEX IF NOT EXISTS idx_tracking_sessions_monthly_verified
  ON tracking_sessions (status, verification_status, ended_at)
  WHERE verified_distance_km > 0;

CREATE TRIGGER trg_tracking_sessions_updated_at
  BEFORE UPDATE ON tracking_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 19. CHECKPOINT ARRIVALS
CREATE TABLE IF NOT EXISTS checkpoint_arrivals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  checkpoint_id UUID NOT NULL REFERENCES checkpoints(id) ON DELETE CASCADE,
  tracking_session_id UUID REFERENCES tracking_sessions(id) ON DELETE SET NULL,
  verified BOOLEAN NOT NULL DEFAULT TRUE,
  verification_method TEXT NOT NULL DEFAULT 'gps_proximity' CHECK (verification_method IN ('gps_proximity', 'manual_marshal')),
  distance_from_checkpoint_meters INTEGER DEFAULT 0,
  reported_accuracy_meters INTEGER DEFAULT 0,
  arrived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ride_id, checkpoint_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_checkpoint_arrivals_user_verified ON checkpoint_arrivals (user_id, verified);

CREATE TRIGGER trg_checkpoint_arrivals_updated_at
  BEFORE UPDATE ON checkpoint_arrivals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 20. GROUP LOCATIONS (Opt-In Live Convoy Positions, 6h active freshness)
CREATE TABLE IF NOT EXISTS group_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES kafila_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tracking_session_id UUID REFERENCES tracking_sessions(id) ON DELETE SET NULL,
  sharing_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  lat DOUBLE PRECISION CHECK (lat IS NULL OR (lat >= -90 AND lat <= 90)),
  lng DOUBLE PRECISION CHECK (lng IS NULL OR (lng >= -180 AND lng <= 180)),
  accuracy_meters INTEGER,
  heading DOUBLE PRECISION,
  speed_kmh DOUBLE PRECISION,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_locations_active ON group_locations (group_id, sharing_enabled, updated_at DESC);

-- 21. LEADERBOARDS (Snapshot Materialization Table)
CREATE TABLE IF NOT EXISTS leaderboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period TEXT NOT NULL DEFAULT 'global' CHECK (period IN ('global', 'monthly', 'organisation', 'expedition')),
  period_key TEXT NOT NULL DEFAULT 'global',
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  ride_id UUID REFERENCES rides(id) ON DELETE CASCADE,
  rider_profile_id UUID NOT NULL REFERENCES rider_profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  verified_kilometres NUMERIC(10, 1) NOT NULL DEFAULT 0,
  completed_expeditions INTEGER NOT NULL DEFAULT 0,
  rank_title TEXT NOT NULL DEFAULT 'Beginner',
  position INTEGER NOT NULL DEFAULT 0,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leaderboards_period_pos ON leaderboards (period, period_key, position ASC);

CREATE TRIGGER trg_leaderboards_updated_at
  BEFORE UPDATE ON leaderboards
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
