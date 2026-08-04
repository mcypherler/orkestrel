# Orkestrel prototype — technical setup

Implementation brief for Claude Code. Based on the edited PRD; sources checked 4 August 2026.

## 1. MVP boundary

Build a family prototype that:

1. Connects one Spotify account and imports favourite artists.
2. Checks supported event sources for UK music events near Poole, Bournemouth and London.
3. Ranks new events against price, travel and basic seat-quality preferences.
4. Sends Jo a short WhatsApp alert with an official booking link.
5. Records what was found and sent, so alerts are not duplicated.

Orkestrel is a **discovery and alerting service**, not a ticket seller. Never claim that a ticket is reserved, still available, exactly priced or has a clear view unless the source explicitly supplies that fact at send time.

## 2. Recommended event sources

### Primary: Ticketmaster Discovery API v2

Use this first. It offers UK event, artist, venue, location, date, image, public sale information, optional price ranges and a Ticketmaster purchase URL. It covers Ticketmaster and several related sources and has an immediately accessible developer tier. The default allowance is 5,000 calls/day and 5 requests/second. See the [Discovery API reference](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/) and [developer getting-started guide](https://developer.ticketmaster.com/products-and-docs/apis/getting-started/).

Suggested query shape:

```text
GET https://app.ticketmaster.com/discovery/v2/events.json
  ?apikey=...
  &countryCode=GB
  &classificationName=music
  &geoPoint=<geohash>
  &radius=<configured miles>
  &startDateTime=<ISO timestamp>
  &sort=date,asc
```

Fetch by followed artist/attraction when an ID mapping exists; also run a broader location query to discover related artists. Cache normalized responses and respect response rate-limit headers.

Important limitation: Discovery is not the partners-only transactional inventory API. Ticketmaster describes offer transactions as a Partner API use case. Treat `priceRanges`, `seatmap.staticUrl` and sale status as helpful metadata, not proof of current seat-level stock, total checkout price or view quality.

### Secondary source: manual/mock feed

Ship a small admin-only importer accepting JSON or CSV in the same normalized event schema. Include realistic fixtures for:

- Harry Styles at Wembley, £50, lower tier, clear view;
- an event with no price;
- an obstructed/restricted-view ticket;
- an event whose price changes or availability disappears; and
- duplicate events from two sources.

This is not merely test data: it lets the family validate ranking, alert wording and urgency before paid or partner inventory is available. Set `EVENT_SOURCE_MODE=ticketmaster`, `mock`, or `hybrid`.

### Later, only with permission/commercial agreement

- **Songkick:** strong artist/location discovery, but current access is paid, pre-approved partnership access; hobby requests are not approved. See [Songkick developer access](https://www.songkick.com/developer/).
- **Bandsintown:** artist events and ticket links are available, but normal keys are tied to a single artist and other platform use requires approval. See [Bandsintown API access](https://help.artists.bandsintown.com/en/articles/7053475-what-is-the-bandsintown-api).
- **Eventbrite:** useful for organizer-owned or specifically identified events, but its documented listing endpoints centre on an authenticated organization rather than a general public discovery catalogue. See [Eventbrite event data](https://www.eventbrite.com/platform/docs/events).

Do not make any of these a launch dependency.

## 3. Spotify integration

Use Spotify OAuth **Authorization Code flow** on the server. Spotify recommends it for long-running server applications that can keep a client secret and refresh tokens. Request only:

```text
user-top-read user-read-recently-played
```

Call:

- `GET /me/top/artists?time_range=short_term|medium_term|long_term&limit=50`
- `GET /me/player/recently-played?limit=50`

Score artists using frequency plus recency, then let users add, remove or pin artists manually. Manual choices override Spotify-derived choices. Do not infer sensitive traits or expose listening history in WhatsApp.

Implementation requirements:

- Generate and validate OAuth `state` on every attempt.
- Perform code exchange and refresh server-side.
- Encrypt access and refresh tokens at rest; never put them in browser storage or logs.
- Refresh access tokens when needed. Spotify currently states access tokens last about one hour and refresh tokens issued to dashboard apps last six months, after which reauthorization is required; handle `invalid_grant` by prompting reconnect. See [authorization guidance](https://developer.spotify.com/documentation/web-api/concepts/authorization), [Authorization Code flow](https://developer.spotify.com/documentation/web-api/tutorials/code-flow), [refreshing tokens](https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens), [top items](https://developer.spotify.com/documentation/web-api/reference/get-users-top-artists-and-tracks) and [recently played](https://developer.spotify.com/documentation/web-api/reference/get-recently-played).
- Handle HTTP 429 with `Retry-After` and bounded backoff.

Prototype constraint: Spotify Development Mode currently requires the app owner to have Premium, supports up to five allowlisted authenticated users, and is explicitly intended for construction/personal prototypes. Broader commercial access has demanding eligibility criteria. See [Spotify quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes). Keep manual artist entry as a permanent fallback.

## 4. WhatsApp communication

### MVP recommendation: Twilio Sandbox for WhatsApp

It is the fastest way to test without registering a production sender. Jo must join the sandbox. A user message opens a 24-hour service window for free-form replies; outside that window, proactive messages require an approved template. The sandbox only provides its own pre-approved templates and is for testing, not production. See the [Twilio Sandbox guide](https://www.twilio.com/docs/whatsapp/sandbox) and [WhatsApp quickstart](https://www.twilio.com/docs/whatsapp/quickstart).

For the first demo, implement both `WHATSAPP_PROVIDER=console` and `twilio`. Console mode writes a redacted alert preview to the app/admin screen; Twilio mode sends it.

Suggested production template:

```text
New Orkestrel match: {{1}} at {{2}} on {{3}}. From {{4}} per ticket.
Seat note: {{5}}. Why it matches: {{6}}. Book: {{7}}
```

The app must store opt-in time/source and support `STOP`. Verify Twilio webhook signatures. Store delivery status and provider message ID. Do not repeatedly send failures.

### Production alternatives

- **Twilio registered WhatsApp sender:** easiest migration from the sandbox; register a sender and submit a custom content template. See [Twilio template notifications](https://www.twilio.com/docs/whatsapp/tutorial/send-whatsapp-notification-messages-templates).
- **Meta WhatsApp Cloud API:** fewer intermediaries and usually more operational control, but more onboarding and webhook/token management. Start with Meta's [Cloud API getting-started guide](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started/). Keep a provider interface so this can replace Twilio without changing matching logic.

## 5. Suggested architecture

Use one TypeScript Next.js application deployed to Vercel:

```text
Browser → Next.js UI / server routes → Postgres
                     ├─ Spotify OAuth + sync
Vercel Cron ─────────┼─ source adapters → normalized events → matcher
                     └─ alert outbox → WhatsApp adapter
```

Recommended modules:

- `integrations/spotify`: OAuth, token refresh, artist sync
- `integrations/events`: `TicketmasterSource` and `MockSource`
- `integrations/messaging`: `ConsoleMessenger` and `TwilioMessenger`
- `domain/matching`: deterministic rules and explanations
- `jobs/poll-events`: fetch, normalize, deduplicate, score, enqueue
- `jobs/send-alerts`: idempotent outbox delivery with retries

Minimal tables: `users`, `preferences`, `spotify_connections`, `artists`, `user_artists`, `events`, `event_offers`, `alert_candidates`, `message_deliveries`, `consents`.

Key rules:

- Use Spotify OAuth as the prototype sign-in, a signed `HttpOnly`, `Secure`, `SameSite=Lax` session cookie, and Spotify's Development Mode user allowlist. Do not expose admin, polling or preview routes anonymously.
- Unique event identity: provider + provider event ID; add a soft duplicate key from artist, venue and start time.
- Store source payload and `observed_at`; do not silently turn stale data into a current claim.
- A matcher returns a score plus human-readable reasons and warnings.
- A unique constraint on `(user_id, event_id, alert_type)` prevents duplicate alerts.
- Use `CRON_SECRET` to protect job routes; Vercel documents this pattern in [Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
- Start polling every 30–60 minutes if the Vercel plan supports it. Do not promise “within minutes” until provider freshness and plan scheduling have been measured.

## 6. Ranking and alert truthfulness

Use deterministic scoring for the prototype:

- +40 followed/pinned artist
- +20 within preferred city/radius
- +20 known price at or below cap
- +10 adjacent-seat claim from an authorized source
- +10 explicit clear-view or preferred-section metadata
- reject explicit `restricted view`, `obstructed view`, `side view` or equivalent

Unknown is not bad, but it is not good. Show `Price not supplied — check seller` and `View not verified` rather than inventing confidence. Never derive a “great view” judgment from a generic venue seat-map image. For the Harry Styles scenario, the mock fixture may explicitly assert seat quality and must be visibly labelled demo data in non-production environments.

## 7. Practical and legal trade-offs

- **Inventory:** public discovery feeds are good at announcing events, not reserving seats. Link to the authorized seller and re-check the event immediately before alerting.
- **Price:** an API price range may omit fees, be stale, cover only some ticket classes or be absent. Display `from`, currency, source and observation time; never say “£50 total” without fee-inclusive source data.
- **Seat quality:** reliable assessment needs offer-level section/row data plus venue-specific knowledge or licensed seat-view data. MVP can reject explicit restrictions and collect user preferences; otherwise say “view not verified”.
- **Scraping:** do not scrape Ticketmaster, venue, resale or social sites or bypass queues/CAPTCHAs. Use documented APIs, feeds, affiliate links or written permission. Review each provider's API terms, caching, attribution and branding rules before launch. Legal review is required before commercial use.
- **Resale:** do not mix unverified resale into the MVP. If later enabled, identify seller, face value where legally required, fees, restrictions and timestamp.
- **Privacy:** obtain explicit Spotify and WhatsApp consent; provide disconnect/delete controls; retain only required listening-derived preferences and tokens. Do not commit secrets or production personal data.
- **Fallback:** if all live sources fail, show mock/manual results only with an unmistakable `Demo data — cannot be purchased` label and suppress real outbound alerts by default.

## 8. Definition of done

- One allowlisted family member can connect Spotify and see/edit imported artists.
- Ticketmaster and mock adapters produce the same validated event schema.
- Preferences include locations/radius, maximum price, ticket count and seat restrictions.
- A scheduled or manually triggered poll creates no duplicate events or alerts.
- Alert preview includes artist, venue, date, `from` price or warning, seat note, match reason and official URL.
- Console mode works without paid messaging; Twilio sandbox sends to an opted-in test number.
- Secrets stay server-side; OAuth state, webhook signatures, cron authentication and token encryption are tested.
- Empty, rate-limited, expired-token and stale-price cases have visible, safe fallbacks.

