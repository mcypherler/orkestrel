# Orkestrel prototype — functional acceptance tests

For Claude Code. These tests use real, forthcoming opportunities matching the Wheeler family profile. Facts and official pages were checked on 4 August 2026.

The tests deliberately separate **bookable events**, **recurring experiences**, and **announced-but-undated tours**. A passing app must not turn incomplete information into a ticket claim.

## Test profile

Use this deterministic profile unless a test overrides it:

```json
{
  "homePostcode": "BH14",
  "preferredCities": ["Poole", "Bournemouth", "London"],
  "maximumPriceGbpPerPerson": 50,
  "ticketCount": 3,
  "followedArtists": ["Taylor Swift", "Shania Twain"],
  "allowTributesAndInspiredExperiences": true,
  "rejectExplicitRestrictedView": true,
  "whatsappOptIn": true,
  "timezone": "Europe/London"
}
```

Interpret the £50 cap as the advertised per-person ticket price, not the family total. Unknown fees or availability must remain explicit.

## Event truth set

### EVT-001 — Taylormania, Bournemouth

Official source: [Bournemouth Pavilion Theatre](https://www.bournemouthpavilion.co.uk/events/taylormania-2026)

Verified facts:

```json
{
  "title": "Taylormania",
  "eventType": "tribute_concert",
  "inspiredArtist": "Taylor Swift",
  "performer": "Katy Ellis / Taylormania",
  "venue": "Bournemouth Pavilion Theatre",
  "venuePostcode": "BH1 2BU",
  "startsAtLocal": "2026-08-16T17:00:00+01:00",
  "timezone": "Europe/London",
  "advertisedFromPrice": { "amount": 34.75, "currency": "GBP" },
  "viewQuality": "unknown",
  "officialUrl": "https://www.bournemouthpavilion.co.uk/events/taylormania-2026",
  "sourceObservedAt": "2026-08-04T00:00:00Z"
}
```

Notes: the official page says the performance was rescheduled from 12 April 2026. It confirms Katy Ellis, a live band and dancers, and Taylor Swift hits. BH14 is the user's home area; the venue itself is BH1 2BU.

### EVT-002 — Shania Twain 2027 UK tour teaser

Official sources: [Universal Music UK presale eligibility](https://umusicstoresupport.zendesk.com/hc/en-us/articles/41824063441559-How-do-I-become-eligible-for-pre-sale-access) and [Shania Twain UK store](https://shopuk.shaniatwain.com/).

Verified facts:

```json
{
  "title": "Shania Twain 2027 UK tour",
  "eventType": "tour_announcement",
  "artist": "Shania Twain",
  "tourYear": 2027,
  "datesAnnounced": false,
  "venuesAnnounced": false,
  "ticketsOnSale": false,
  "price": null,
  "bookingUrl": null,
  "presaleEligibilityDeadlineLocal": "2026-07-30T10:00:00+01:00",
  "presaleDelivery": "Eligible customers receive a link by email when dates are announced",
  "sourceObservedAt": "2026-08-04T00:00:00Z"
}
```

Notes: `Little Miss Twain` is Shania Twain's album. The official support page describes the tour dates as forthcoming and yet to be announced. The album-preorder eligibility deadline has already passed at the test observation time. No presale code, arena, date, price or ticket URL is currently public in this source.

### EVT-003 — Taylor Swift-inspired London afternoon-tea bus

Official source: [Golden Tours](https://www.goldentours.com/afternoon-tea-in-london/london-afternoon-tea-bus-taylors-version)

Verified facts:

```json
{
  "title": "Taylor Swift Inspired London Afternoon Tea Bus",
  "eventType": "recurring_experience",
  "inspiredArtist": "Taylor Swift",
  "officiallyEndorsedByArtist": false,
  "durationMinutes": 90,
  "departurePoint": "Golden Tours Stop 1, Bulleid Way, London SW1W 9SR",
  "advertisedDepartureTimesLocal": ["12:15", "15:15"],
  "advertisedFromPrice": { "amount": 49.00, "currency": "GBP" },
  "standardPriceSeatQuality": "not stated",
  "premiumBestViewPriceGbp": 69.00,
  "officialUrl": "https://www.goldentours.com/afternoon-tea-in-london/london-afternoon-tea-bus-taylors-version",
  "sourceObservedAt": "2026-08-04T00:00:00Z"
}
```

Notes: Golden Tours currently advertises multiple start times, a 90-minute journey, famous songs, afternoon tea and a glass of Prosecco or soft drink. The page does not support treating the Tower of London as a departure point or promising daily availability through 31 March 2027. Availability for the selected date and three adjacent places must be checked at booking time.

## Core acceptance scenarios

### TC-001 — Finds and ranks the local tribute concert

Given the test profile and EVT-001 enters through any approved source adapter or the manual fixture importer  
When matching runs at `2026-08-04T12:00:00Z`  
Then one candidate is created  
And it scores for Taylor Swift affinity, Bournemouth proximity and price under £50  
And the local time is displayed as `Sunday 16 August 2026, 17:00`  
And the displayed price is `£34.75 per person` or `From £34.75 per person`  
And the alert identifies it as a **tribute concert**, not a Taylor Swift performance  
And it says `View not verified`  
And it uses the official source URL  
And it does not claim three tickets are available unless the source confirms quantity at send time.

Suggested assertions:

```text
candidate.status == "eligible"
candidate.reasons includes "Followed artist: Taylor Swift (tribute)"
candidate.reasons includes "Near BH14 / Bournemouth"
candidate.reasons includes "Within £50 price cap"
candidate.warnings includes "View not verified"
alert.title contains "Taylormania"
alert.title contains "tribute"
alert.title does not equal "Taylor Swift live"
```

### TC-002 — Does not fabricate Shania Twain tour inventory

Given the test profile and EVT-002  
When matching runs  
Then it may create a watchlist/announcement record for Shania Twain  
But it must not create a `tickets_available` alert  
And it must not invent an arena, date, price, code or booking URL  
And it must not tell the user to buy the album now to gain presale access, because the stated deadline has passed  
And it records that eligible customers should expect the official presale link by email.

Suggested assertions:

```text
announcement.status == "watching_for_dates"
announcement.artist == "Shania Twain"
announcement.tourYear == 2027
alert.type != "tickets_available"
alert.bookingUrl == null
alert.presaleCode == null
```

### TC-003 — Promotes the Shania tour only after a real listing appears

Given TC-002 has stored the watch record  
And a later approved event source returns a dated Shania Twain UK arena event with an official URL  
When the next poll runs  
Then the event is linked to the existing watch record  
And location, date, price and sale state are taken only from the new source  
And one new-event or on-sale alert is eligible  
And no alert is sent if the venue is outside the configured geography or a known price exceeds £50.

### TC-004 — Finds the London inspired experience without mislabelling it

Given the test profile and EVT-003  
And the supplier confirms a selectable future date with at least three places  
When matching runs  
Then the candidate scores for Taylor Swift affinity, London and a from-price of £49  
And the alert says **Taylor Swift-inspired afternoon-tea bus**  
And it never implies Taylor Swift performs, appears or endorses it  
And it uses Bulleid Way as the departure point  
And it labels £49 as a `from` price  
And it says the view/seat quality is not verified at that price  
And it does not recommend the £69 premium best-view option under a £50 cap.

Suggested assertions:

```text
candidate.status == "eligible"
candidate.priceLabel == "From £49 per person"
candidate.warnings includes "Availability must be checked"
candidate.warnings includes "View not verified"
alert.body contains "inspired"
alert.body does not contain "Taylor Swift concert"
alert.body does not contain "Tower of London departure"
```

### TC-005 — Rejects unsupported recurrence claims

Given EVT-003's official product page has no verified end date in the normalized source response  
When the app renders availability  
Then it must not state `Daily until 31 March 2027`  
And it asks the supplier/booking flow for a specific date  
And an unavailable date produces no outbound alert.

### TC-006 — Handles seat quality honestly

Given any matched event has no section, row, restriction or licensed view data  
When an alert is composed  
Then it says `View not verified`  
And it does not infer view quality from a generic seat-map image.

Given an offer explicitly contains `restricted view`, `obstructed view` or `side view`  
When matching runs  
Then the offer is rejected for this profile.

### TC-007 — Deduplicates repeated observations

Given EVT-001 is ingested twice with the same provider ID  
And once more from another source with the same normalized title, venue and start time  
When polling and alert delivery run twice  
Then there is one canonical event  
And at most one `new_event` alert is sent to the test user  
And source observations remain auditable.

### TC-008 — Re-checks stale prices before sending

Given EVT-001 was last observed more than the configured freshness threshold ago  
When it is about to be sent  
Then the source is refreshed  
And a missing or changed price is reflected in the alert  
And a price now above £50 makes it ineligible unless the user explicitly changes the cap.

### TC-009 — Enforces outbound safety switches

Given `ALERTS_ENABLED=false` or `WHATSAPP_PROVIDER=console`  
When any of EVT-001 through EVT-003 matches  
Then no real WhatsApp request is made  
And a redacted preview is stored.

Given a fixture is marked `isMock=true`  
When the environment is Production  
Then it can never enqueue or send a real alert.

### TC-010 — Produces a complete, truthful alert

For an eligible bookable event, the preview must answer:

1. What is it?
2. Why does it match?
3. When and where is it?
4. What is the known price status?
5. What is known about the view?
6. Where is the official booking link?

Expected EVT-001 preview shape:

```text
🎵 Taylormania — Taylor Swift tribute
Bournemouth Pavilion Theatre · Sun 16 Aug · 17:00
£34.75 per person · View not verified
Why: Taylor Swift interest, near BH14, within your £50 cap
Availability and fees can change — check seller
Book: <official URL>
```

## Live smoke-test procedure

Run fixture tests in every build. Run live-source smoke tests separately because provider data and availability change.

1. Freeze the application clock at `2026-08-04T12:00:00Z` for deterministic fixture tests.
2. Import the three truth-set records through the normalized source contract; do not bypass normal validation, matching or deduplication.
3. Keep messaging in console mode and compare previews with TC-001, TC-002 and TC-004.
4. Run the Ticketmaster adapter live and record whether it exposes each item. Absence is a coverage result, not permission to scrape the venue/store/supplier page.
5. Test any venue, store or experience source only through an approved API/feed or the manual importer.
6. Before a real family test, reopen each official URL and re-check date, price and availability. Update `sourceObservedAt` and expected values if the supplier has changed them.

## Pass criteria

- All deterministic scenarios TC-001–TC-010 pass.
- No tribute/inspired experience is represented as the artist performing.
- No undated tour becomes a ticket alert.
- No unknown price, availability or view becomes a positive claim.
- No duplicate, mock or disabled alert reaches WhatsApp.
- A source-coverage miss is visible to the leads and does not trigger scraping or fabricated data.

