# KAAFILA — Motorcycle Touring Marketplace, Community & Live Expedition Tracking

> **Ride Together. Explore Further.**

KAAFILA is a full-stack motorcycle touring marketplace, rider community, and live expedition platform backed by **Supabase PostgreSQL**, **Node.js + Express**, **Socket.IO**, **React + Vite + Tailwind CSS**, and **Leaflet** maps.

---

## Project Architecture

```text
kaafila/
├── .env.example                        # Root environment template
├── README.md
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql      # Normalized 21-table PostgreSQL schema, FKs, constraints, indexes, triggers
│       ├── 002_rls_policies.sql        # Row Level Security (RLS) policies for Supabase
│       └── 003_storage_buckets.sql     # Optional Supabase Storage bucket (`kaafila-images`) & policies
├── backend/                            # Node.js + Express + pg + Socket.IO REST & real-time API
│   ├── .env.example
│   ├── package.json
│   ├── src/
│   │   ├── app.js                      # Express app, Helmet, CORS, rate limiting, /api/health, routes
│   │   ├── server.js                   # Server bootstrap, PostgreSQL connect, Socket.IO attach
│   │   ├── config/
│   │   │   ├── env.js                  # Environment config (dotenv loading backend/.env)
│   │   │   └── pg.js                   # pg.Pool (Supabase PostgreSQL) & PGlite test/offline adapter
│   │   ├── repositories/               # DTO mappers & shared parameterized SQL helpers
│   │   ├── controllers/                # Auth, Orgs, Rides, Riders, Connections, Messages, Groups, Maps, Tracking, Leaderboards
│   │   ├── middleware/                 # JWT auth, RBAC, upload (disk or Supabase Storage), error handler
│   │   ├── routes/                     # Express REST route modules
│   │   ├── socket/                     # Socket.IO real-time messaging, presence & opt-in live convoy sharing
│   │   ├── seed/                       # Idempotent, clearly labelled demo data seeder
│   │   ├── scripts/
│   │   │   └── migrateMongoToPostgres.js # Controlled MongoDB -> PostgreSQL data migration script
│   │   └── utils/                      # geo, anti-spoofing, ranking, 11 achievements, notify, slugify, validators
│   └── tests/                          # Phase 1–4 end-to-end integration tests (on real PostgreSQL via PGlite)
└── frontend/                           # React + Vite + Tailwind CSS + React Router + Axios + Leaflet
    ├── public/images/
    ├── src/
    └── package.json
```

---

## Supabase PostgreSQL Setup Guide

### 1. Create a Supabase Project
1. Sign in to [Supabase](https://supabase.com) and create a new project.
2. Open **Project Settings → Database** and copy your **Connection String** (Transaction Pooler port `6543` or Session Pooler/Direct URI).
3. *(Optional for cloud image uploads)* Open **Project Settings → API** and note your **Project URL**, **anon public key**, and **service_role key**. Never expose `DATABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` to the frontend.

### 2. Apply SQL Migrations
Open **SQL Editor** in your Supabase Dashboard and run the migration files in order:
1. `supabase/migrations/001_initial_schema.sql` — creates all 21 normalized tables (`users`, `rider_profiles`, `achievements`, `rider_achievements`, `rider_rank_history`, `organisations`, `organisation_members`, `rides`, `ride_members`, `reviews`, `connections`, `conversations`, `kafila_groups`, `group_members`, `messages`, `notifications`, `checkpoints`, `tracking_sessions`, `checkpoint_arrivals`, `group_locations`, `leaderboards`), constraints, indexes, and `updated_at` triggers.
2. `supabase/migrations/002_rls_policies.sql` — enables Row Level Security (RLS) on all 21 tables and installs access policies protecting private rider data, emergency contacts, DMs, and group messages.
3. `supabase/migrations/003_storage_buckets.sql` — *(optional)* creates the `kaafila-images` Storage bucket (2 MB limit, JPEG/PNG/WebP).

### 3. Configure Environment Variables
Copy the backend environment template and fill in your credentials:

```bash
cp backend/.env.example backend/.env
```

Key variables in `backend/.env`:
- `DATABASE_URL` — your Supabase PostgreSQL connection URI (SSL is enabled automatically for non-local hosts).
- `USE_PGLITE=false` — set to `true` only if you want zero-setup offline local development/testing without Supabase.
- `AUTO_SEED_DEMO=false` — keep `false` on production/staging databases so live data is never seeded silently.
- `JWT_SECRET` — long random string for signing Express JWT tokens.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` — *(optional)* if set, `/api/uploads/image` uploads images to Supabase Storage instead of local `backend/uploads/`.

`backend/.env` is excluded from Git by `.gitignore`.

---

## Installation & Running Locally

### 1. Install Dependencies
```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2. Seed Demo Data (Optional, Controlled)
To populate clearly labelled demo organisations, expeditions, riders, routes, checkpoints, and groups into an empty database:

```bash
cd backend
npm run seed
```

Pass `--force` only in dev/staging if you explicitly want to reset demo records (`@demo.kaafila.in` / `is_demo = TRUE`):

```bash
npm run seed -- --force
```

### 3. Run Backend & Frontend
Terminal 1 (API + Socket.IO on port `5000`):
```bash
cd backend
npm run dev
```

Terminal 2 (React + Vite on port `5173`):
```bash
cd frontend
npm run dev
```

Open `http://localhost:5173`. Check `GET http://localhost:5000/api/health` to verify PostgreSQL connectivity.

> **Offline / Quick Demo Mode**: Run `USE_PGLITE=true npm --prefix backend run dev` to boot the full backend on an embedded PostgreSQL (`@electric-sql/pglite`) instance with demo data seeded automatically.

---

## Migrating Existing Data from MongoDB

If you have existing MongoDB/Atlas collections to migrate into Supabase PostgreSQL:

1. Export your MongoDB collections as JSON arrays using `mongoexport`:
   ```bash
   for col in users riderprofiles achievements organisations organisationmembers rides ridemembers reviews connections conversations kafilagroups groupmembers messages notifications checkpoints trackingsessions checkpointarrivals grouplocations leaderboards; do
     mongoexport --uri="$MONGO_URI" --collection="$col" --jsonArray --out="./mongo_dump/${col}.json"
   done
   ```
2. Preview the migration with `--dry-run` (writes nothing):
   ```bash
   cd backend
   npm run migrate:mongo -- --dump-dir ../mongo_dump --dry-run
   ```
3. Run the transactionally safe, idempotent migration with row-count verification:
   ```bash
   npm run migrate:mongo -- --dump-dir ../mongo_dump --verify
   ```

Every MongoDB `ObjectId` is deterministically mapped to a valid UUID (`objectIdToUuid`), and all embedded arrays (`badges[]`, `rankHistory[]`) and GeoJSON points are normalized cleanly.

---

## Testing & Verification

### Backend Integration Tests (Phases 1–4)
Runs all 28 integration tests across REST APIs, JWT/RBAC, privacy gating, Socket.IO real-time messaging/convoy sharing, GPS anti-spoofing, and leaderboards against real PostgreSQL SQL via PGlite:

```bash
cd backend
npm test
```

### Frontend Production Build
```bash
cd frontend
npm run build
```

---

## Safe Rollback Plan
1. Keep your MongoDB Atlas cluster in **read-only / paused backup state** (do not delete it) until Supabase PostgreSQL has been verified in staging and production.
2. Because `migrateMongoToPostgres.js` does not modify MongoDB source data, you can revert by checking out the pre-migration Git commit and pointing `backend/.env` back to MongoDB if needed during cutover.
