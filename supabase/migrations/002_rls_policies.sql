-- KAAFILA Row Level Security (RLS) Policies for Supabase PostgreSQL
--
-- Architecture note:
-- KAAFILA routes client requests through the Express backend over server-side `pg`
-- (using DATABASE_URL / service-role DB privileges) and enforces Express JWT + RBAC middleware.
-- Enabling RLS across all tables provides defense-in-depth so Supabase's PostgREST / anon key
-- cannot accidentally expose private emails, phone numbers, emergency contacts, messages,
-- tracking logs, or live convoy coordinates if the Data API is enabled.

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_rank_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE ride_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE kafila_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracking_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkpoint_arrivals ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboards ENABLE ROW LEVEL SECURITY;

-- Note on auth.uid() compatibility:
-- Supabase installs `auth.uid()` in the `auth` schema. When applying in Supabase, policies below
-- work natively; clean anonymous/public rules use standard SQL predicates as well.
-- Wrapped in DO block to remain idempotent and safe in non-Supabase PG/PGlite test databases
-- where the `auth` schema does not exist.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN

    -- Users: only owner can read own account row (never expose password_hash or emails publicly)
    DROP POLICY IF EXISTS users_select_self ON users;
    CREATE POLICY users_select_self ON users
      FOR SELECT USING (auth.uid() = id);

    DROP POLICY IF EXISTS users_update_self ON users;
    CREATE POLICY users_update_self ON users
      FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

    -- Rider Profiles: public profiles readable, owner reads/updates own
    DROP POLICY IF EXISTS rider_profiles_select_public_or_self ON rider_profiles;
    CREATE POLICY rider_profiles_select_public_or_self ON rider_profiles
      FOR SELECT USING (is_profile_public = TRUE OR auth.uid() = user_id);

    DROP POLICY IF EXISTS rider_profiles_update_self ON rider_profiles;
    CREATE POLICY rider_profiles_update_self ON rider_profiles
      FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

    -- Public catalog tables (read-only for clients)
    DROP POLICY IF EXISTS achievements_select_all ON achievements;
    CREATE POLICY achievements_select_all ON achievements FOR SELECT USING (TRUE);

    DROP POLICY IF EXISTS organisations_select_all ON organisations;
    CREATE POLICY organisations_select_all ON organisations FOR SELECT USING (TRUE);

    DROP POLICY IF EXISTS organisations_update_owner ON organisations;
    CREATE POLICY organisations_update_owner ON organisations
      FOR UPDATE USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

    DROP POLICY IF EXISTS rides_select_non_draft_or_owner ON rides;
    CREATE POLICY rides_select_non_draft_or_owner ON rides
      FOR SELECT USING (
        status <> 'draft'
        OR EXISTS (
          SELECT 1 FROM organisations o
          WHERE o.id = rides.organisation_id AND o.owner_id = auth.uid()
        )
      );

    DROP POLICY IF EXISTS checkpoints_select_non_draft_ride ON checkpoints;
    CREATE POLICY checkpoints_select_non_draft_ride ON checkpoints
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM rides r
          WHERE r.id = checkpoints.ride_id AND r.status <> 'draft'
        )
      );

    DROP POLICY IF EXISTS reviews_select_all ON reviews;
    CREATE POLICY reviews_select_all ON reviews FOR SELECT USING (TRUE);

    DROP POLICY IF EXISTS leaderboards_select_all ON leaderboards;
    CREATE POLICY leaderboards_select_all ON leaderboards FOR SELECT USING (TRUE);

    -- Rider achievements & rank history: owner or public rider profile
    DROP POLICY IF EXISTS rider_achievements_select_public ON rider_achievements;
    CREATE POLICY rider_achievements_select_public ON rider_achievements
      FOR SELECT USING (
        auth.uid() = user_id
        OR EXISTS (
          SELECT 1 FROM rider_profiles rp
          WHERE rp.user_id = rider_achievements.user_id AND rp.is_profile_public = TRUE
        )
      );

    DROP POLICY IF EXISTS rider_rank_history_select_self ON rider_rank_history;
    CREATE POLICY rider_rank_history_select_self ON rider_rank_history
      FOR SELECT USING (auth.uid() = user_id);

    -- Connections: participants only
    DROP POLICY IF EXISTS connections_participant_only ON connections;
    CREATE POLICY connections_participant_only ON connections
      FOR ALL USING (auth.uid() IN (requester_id, recipient_id));

    -- Conversations & Private/Group Messages: participants or active group members only
    DROP POLICY IF EXISTS conversations_participant_only ON conversations;
    CREATE POLICY conversations_participant_only ON conversations
      FOR SELECT USING (auth.uid() IN (participant_a_id, participant_b_id));

    DROP POLICY IF EXISTS messages_participant_only ON messages;
    CREATE POLICY messages_participant_only ON messages
      FOR SELECT USING (
        (conversation_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM conversations c
          WHERE c.id = messages.conversation_id
            AND auth.uid() IN (c.participant_a_id, c.participant_b_id)
        ))
        OR
        (group_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM group_members gm
          WHERE gm.group_id = messages.group_id
            AND gm.user_id = auth.uid()
            AND gm.status = 'active'
        ))
      );

    -- Groups & Members
    DROP POLICY IF EXISTS kafila_groups_select_visible ON kafila_groups;
    CREATE POLICY kafila_groups_select_visible ON kafila_groups
      FOR SELECT USING (
        privacy = 'public'
        OR EXISTS (
          SELECT 1 FROM group_members gm
          WHERE gm.group_id = kafila_groups.id AND gm.user_id = auth.uid()
        )
      );

    DROP POLICY IF EXISTS group_members_select_member ON group_members;
    CREATE POLICY group_members_select_member ON group_members
      FOR SELECT USING (
        auth.uid() = user_id
        OR EXISTS (
          SELECT 1 FROM group_members gm2
          WHERE gm2.group_id = group_members.group_id
            AND gm2.user_id = auth.uid()
            AND gm2.status = 'active'
        )
      );

    -- Notifications: recipient only
    DROP POLICY IF EXISTS notifications_recipient_only ON notifications;
    CREATE POLICY notifications_recipient_only ON notifications
      FOR ALL USING (auth.uid() = recipient_id) WITH CHECK (auth.uid() = recipient_id);

    -- Tracking sessions & checkpoint arrivals: owner only (public simplified route served via backend API)
    DROP POLICY IF EXISTS tracking_sessions_owner_only ON tracking_sessions;
    CREATE POLICY tracking_sessions_owner_only ON tracking_sessions
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

    DROP POLICY IF EXISTS checkpoint_arrivals_owner_only ON checkpoint_arrivals;
    CREATE POLICY checkpoint_arrivals_owner_only ON checkpoint_arrivals
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

    -- Opt-in live convoy location sharing: only active group members
    DROP POLICY IF EXISTS group_locations_active_members_only ON group_locations;
    CREATE POLICY group_locations_active_members_only ON group_locations
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM group_members gm
          WHERE gm.group_id = group_locations.group_id
            AND gm.user_id = auth.uid()
            AND gm.status = 'active'
        )
      );

    -- Ride members & organisation members
    DROP POLICY IF EXISTS ride_members_self_or_org_owner ON ride_members;
    CREATE POLICY ride_members_self_or_org_owner ON ride_members
      FOR SELECT USING (
        auth.uid() = user_id
        OR EXISTS (
          SELECT 1 FROM rides r
          JOIN organisations o ON o.id = r.organisation_id
          WHERE r.id = ride_members.ride_id AND o.owner_id = auth.uid()
        )
      );

    DROP POLICY IF EXISTS org_members_select_self_or_owner ON organisation_members;
    CREATE POLICY org_members_select_self_or_owner ON organisation_members
      FOR SELECT USING (
        auth.uid() = user_id
        OR EXISTS (
          SELECT 1 FROM organisations o
          WHERE o.id = organisation_members.organisation_id AND o.owner_id = auth.uid()
        )
      );

  END IF;
END $$;

