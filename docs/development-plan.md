# Orkestrel Development Plan

Quick, cheap and easy. Next.js on Vercel, Supabase Postgres, ship fast.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 14 (App Router, TypeScript) | Full-stack in one repo, Vercel-native |
| Database | Supabase Postgres (`oxzxtorvbmwxanptoogp`, EU-West-1) | Already provisioned, free tier, RLS, no infra management |
| Hosting | Vercel (`mark-wheeler-s-projects/orkestrel`) | Already connected, cron jobs, edge functions, env vars |
| Auth | Spotify OAuth (server-side session cookie) | No separate auth system needed, users are Spotify users |
| Messaging | Twilio WhatsApp Sandbox / Console fallback | Free sandbox for prototyping |
| Events | Ticketmaster Discovery API v2 + mock fixtures | Free tier (5k calls/day) |

## Phases

### Phase 1: Project Scaffold & Database Schema
- Initialize Next.js project with TypeScript
- Set up Supabase client + connection
- Create database schema (all tables from tech spec)
- Create `.env.example` with all required variables
- Basic layout/shell UI
- **Deliverable**: App deploys to Vercel, connects to Supabase

### Phase 2: Spotify Integration
- Spotify OAuth Authorization Code flow
- Server-side token storage (encrypted at rest)
- Import top artists + recently played
- Artist management UI (view, pin, remove, manually add)
- Token refresh handling
- **Deliverable**: Connect Spotify, see your artists

### Phase 3: User Preferences
- Preferences form: max price, cities, radius, ticket count, seat restrictions
- Store in Supabase
- Default profile matching the test profile (BH14, Bournemouth/Poole/London, etc.)
- **Deliverable**: Configure what events you want

### Phase 4: Event Sources & Normalization
- Normalized event schema (shared between all sources)
- Ticketmaster Discovery API adapter
- Mock/fixture data adapter (EVT-001, EVT-002, EVT-003)
- Manual admin importer (JSON/CSV)
- Event deduplication (provider+ID primary, artist+venue+datetime soft)
- `EVENT_SOURCE_MODE` switching (ticketmaster/mock/hybrid)
- **Deliverable**: Events flow in and get stored/deduplicated

### Phase 5: Matching Engine
- Deterministic scoring: artist affinity (+40), location (+20), price (+20), seats (+10), view (+10)
- Reject explicit restricted/obstructed views
- Distinguish tribute/inspired vs. original artist
- Handle tour announcements (watch, don't alert)
- Handle recurring experiences (label correctly)
- Price truthfulness (from, unknown, stale warnings)
- View truthfulness (not verified, not claimed)
- **Deliverable**: Events scored and ranked correctly per TC-001 through TC-006

### Phase 6: Alert System
- Alert outbox with unique constraint (user_id, event_id, alert_type)
- Console messenger (redacted preview to UI)
- Twilio WhatsApp messenger
- `WHATSAPP_PROVIDER` switching
- `ALERTS_ENABLED` kill switch
- Alert preview UI showing all 4 answers (what/why/cost/where)
- Mock data blocked from production alerts
- Delivery status tracking
- **Deliverable**: See alert previews, send test WhatsApp

### Phase 7: Polling & Automation
- Vercel Cron job route (`/api/cron/poll-events`)
- `CRON_SECRET` authentication
- Configurable poll interval (30-60 min)
- Freshness check before sending (re-verify stale prices)
- Idempotent: no duplicate events or alerts on re-run
- Manual poll trigger from admin UI
- **Deliverable**: Automated event discovery and alerting

### Phase 8: Testing & Safety
- Functional test suite covering TC-001 through TC-010
- Deterministic test clock (`2026-08-04T12:00:00Z`)
- Fixture import through normal validation pipeline
- Safety switches verified (ALERTS_ENABLED, MOCK_DATA_ENABLED, console mode)
- Opt-in/consent tracking
- Spotify disconnect/delete controls
- **Deliverable**: All acceptance tests pass, safe for family test

## Database Tables

From the tech spec, minimal set:

1. `users` - family members (linked to Spotify)
2. `preferences` - price/location/seat filters per user
3. `spotify_connections` - encrypted tokens, sync state
4. `artists` - canonical artist records
5. `user_artists` - follow/pin/remove per user (manual overrides Spotify)
6. `events` - normalized events from all sources
7. `event_offers` - price/seat details per event observation
8. `alert_candidates` - scored matches awaiting delivery
9. `message_deliveries` - sent alerts with status tracking
10. `consents` - opt-in records for WhatsApp/Spotify

## Key Constraints (quick/cheap/easy)

- **No custom auth** - Spotify OAuth IS the auth
- **No separate backend** - Next.js API routes handle everything
- **No message queue** - Supabase tables as outbox
- **No complex infra** - Vercel cron, not a separate scheduler
- **No scraping** - API-only data sources
- **Console mode first** - get matching right before spending on Twilio
- **Mock data first** - validate UX with fixtures before live API calls

## Environment Setup Required (Lead)

Before development can use live integrations, the lead needs to:
1. Set up Ticketmaster developer account + API key
2. Configure Spotify app in developer dashboard (redirect URIs, allowlist users)
3. Set up Twilio account + WhatsApp sandbox
4. Add all env vars to Vercel (see `docs/lead-setup.md`)

Development works without these using mock data + console mode.
