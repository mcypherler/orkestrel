import { describe, it, expect } from "vitest";
import { matchEvent } from "./matching";

const basePrefs = {
  home_postcode: "BH15",
  preferred_cities: ["Poole", "Bournemouth", "London"],
  max_price_gbp: 80,
  ticket_count: 2,
  reject_restricted_view: true,
  allow_tributes: true,
};

const baseEvent = {
  id: "e1",
  title: "Radiohead Live",
  event_type: "concert",
  artist_name: "Radiohead",
  inspired_artist: null,
  performer: "Radiohead",
  venue_name: "O2 Arena",
  venue_postcode: "SE10 0DX",
  venue_city: "London",
  starts_at: "2025-09-15T19:30:00Z",
  official_url: "https://example.com",
  observed_at: "2025-08-07T07:00:00Z",
};

const baseOffers = [
  {
    price_amount: 55,
    price_currency: "GBP",
    price_type: "from" as const,
    seat_quality: "clear",
    section: null,
    is_adjacent: true,
    seller: "Ticketmaster",
  },
];

const followed = [
  { name: "Radiohead", relationship: "follow" },
  { name: "Muse", relationship: "follow" },
];

describe("matchEvent — regex lane", () => {
  it("scores a direct artist match (regex lane)", () => {
    const result = matchEvent({
      event: baseEvent,
      offers: baseOffers,
      userPrefs: basePrefs,
      followedArtists: followed,
    });

    expect(result.eligible).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.reasons.some((r) => r.includes("Radiohead"))).toBe(true);
  });

  it("rejects when artist is not followed and no AI/semantic match", () => {
    const result = matchEvent({
      event: { ...baseEvent, artist_name: "Unknown Band", title: "Unknown Band" },
      offers: baseOffers,
      userPrefs: basePrefs,
      followedArtists: followed,
    });

    expect(result.eligible).toBe(false);
    expect(result.status).toBe("rejected");
  });

  it("applies tribute penalty", () => {
    const result = matchEvent({
      event: { ...baseEvent, event_type: "tribute_concert", inspired_artist: "Radiohead" },
      offers: baseOffers,
      userPrefs: basePrefs,
      followedArtists: followed,
    });

    const normalResult = matchEvent({
      event: baseEvent,
      offers: baseOffers,
      userPrefs: basePrefs,
      followedArtists: followed,
    });

    expect(result.score).toBeLessThan(normalResult.score);
    expect(result.warnings.some((w) => w.includes("Tribute"))).toBe(true);
  });

  it("rejects tributes when preferences disallow", () => {
    const result = matchEvent({
      event: { ...baseEvent, event_type: "tribute_concert" },
      offers: baseOffers,
      userPrefs: { ...basePrefs, allow_tributes: false },
      followedArtists: followed,
    });

    expect(result.eligible).toBe(false);
    expect(result.status).toBe("rejected");
  });

  it("rejects when price exceeds cap", () => {
    const result = matchEvent({
      event: baseEvent,
      offers: [{ ...baseOffers[0], price_amount: 150 }],
      userPrefs: { ...basePrefs, max_price_gbp: 80 },
      followedArtists: followed,
    });

    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes("exceeds"))).toBe(true);
  });

  it("returns watching_for_dates for tour announcements", () => {
    const result = matchEvent({
      event: { ...baseEvent, event_type: "tour_announcement" },
      offers: [],
      userPrefs: basePrefs,
      followedArtists: followed,
    });

    expect(result.status).toBe("watching_for_dates");
    expect(result.eligible).toBe(false);
  });
});

describe("matchEvent — AI classify lane", () => {
  it("scores an AI-classified match at +35", () => {
    const result = matchEvent({
      event: { ...baseEvent, artist_name: "Thom Yorke Solo", title: "Thom Yorke Solo" },
      offers: baseOffers,
      userPrefs: basePrefs,
      followedArtists: followed,
      aiMatchedArtist: "Radiohead",
    });

    expect(result.eligible).toBe(true);
    expect(result.reasons.some((r) => r.includes("AI matched"))).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(35);
  });
});

describe("matchEvent — false positive prevention", () => {
  it("does not match 'Whitney Queen of the Night' when user follows 'Queen' (strict short-name regex)", () => {
    const result = matchEvent({
      event: {
        ...baseEvent,
        title: "Queen of the Night - A Tribute to Whitney Houston",
        artist_name: "Whitney Queen of the Night",
        event_type: "concert",
        inspired_artist: null,
      },
      offers: baseOffers,
      userPrefs: basePrefs,
      followedArtists: [
        { name: "Queen", relationship: "follow" },
        { name: "Muse", relationship: "follow" },
      ],
    });

    expect(result.eligible).toBe(false);
    expect(result.reasons.every((r) => !r.includes("Queen"))).toBe(true);
  });

  it("detects 'Rumours of Fleetwood Mac' as tribute even when event_type is concert", () => {
    const tributeResult = matchEvent({
      event: {
        ...baseEvent,
        title: "Rumours of Fleetwood Mac - 50th Anniversary Tour 2027",
        artist_name: "Rumours of Fleetwood Mac",
        event_type: "concert",
        inspired_artist: null,
      },
      offers: baseOffers,
      userPrefs: basePrefs,
      followedArtists: [{ name: "Fleetwood Mac", relationship: "follow" }],
    });

    const originalResult = matchEvent({
      event: {
        ...baseEvent,
        title: "Fleetwood Mac Live",
        artist_name: "Fleetwood Mac",
      },
      offers: baseOffers,
      userPrefs: basePrefs,
      followedArtists: [{ name: "Fleetwood Mac", relationship: "follow" }],
    });

    expect(tributeResult.eligible).toBe(true);
    expect(tributeResult.warnings.some((w) => w.includes("Tribute") || w.includes("tribute") || w.includes("not the original"))).toBe(true);
    expect(tributeResult.score).toBeLessThan(originalResult.score);
    expect(originalResult.score - tributeResult.score).toBeGreaterThanOrEqual(20);
    expect(tributeResult.reasons.some((r) => r.includes("tribute"))).toBe(true);
  });

  it("still matches actual Fleetwood Mac performing", () => {
    const result = matchEvent({
      event: {
        ...baseEvent,
        title: "Fleetwood Mac Live",
        artist_name: "Fleetwood Mac",
      },
      offers: baseOffers,
      userPrefs: basePrefs,
      followedArtists: [{ name: "Fleetwood Mac", relationship: "follow" }],
    });

    expect(result.eligible).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.warnings.every((w) => !w.includes("Tribute"))).toBe(true);
  });

  it("rejects partial name overlap (Roger Taylor vs Taylor Swift)", () => {
    const result = matchEvent({
      event: {
        ...baseEvent,
        title: "Taylor Swift Eras Tour",
        artist_name: "Taylor Swift",
      },
      offers: baseOffers,
      userPrefs: basePrefs,
      followedArtists: [{ name: "Roger Taylor", relationship: "follow" }],
    });

    expect(result.eligible).toBe(false);
  });

  it("rejects shared-word false positives (James Brown vs James Bay)", () => {
    const result = matchEvent({
      event: { ...baseEvent, title: "James Bay Live", artist_name: "James Bay" },
      offers: baseOffers,
      userPrefs: basePrefs,
      followedArtists: [{ name: "James Brown", relationship: "follow" }],
    });

    expect(result.eligible).toBe(false);
  });
});

describe("matchEvent — tribute scoring and visibility", () => {
  it("tribute score is significantly lower than original artist", () => {
    const tributeResult = matchEvent({
      event: {
        ...baseEvent,
        title: "Rumours of Fleetwood Mac",
        artist_name: "Rumours of Fleetwood Mac",
        event_type: "tribute_concert",
        inspired_artist: "Fleetwood Mac",
      },
      offers: baseOffers,
      userPrefs: basePrefs,
      followedArtists: [{ name: "Fleetwood Mac", relationship: "follow" }],
    });

    const originalResult = matchEvent({
      event: {
        ...baseEvent,
        title: "Fleetwood Mac Live",
        artist_name: "Fleetwood Mac",
      },
      offers: baseOffers,
      userPrefs: basePrefs,
      followedArtists: [{ name: "Fleetwood Mac", relationship: "follow" }],
    });

    expect(tributeResult.score).toBeLessThan(originalResult.score);
    expect(originalResult.score - tributeResult.score).toBeGreaterThanOrEqual(20);
    expect(tributeResult.warnings.some((w) => w.includes("Tribute") || w.includes("tribute"))).toBe(true);
  });

  it("does not match tribute name as the followed artist", () => {
    const result = matchEvent({
      event: {
        ...baseEvent,
        title: "Rumours of Fleetwood Mac",
        artist_name: "Rumours of Fleetwood Mac",
        event_type: "tribute_concert",
        inspired_artist: "Fleetwood Mac",
      },
      offers: baseOffers,
      userPrefs: basePrefs,
      followedArtists: [{ name: "Fleetwood Mac", relationship: "follow" }],
    });

    expect(result.reasons.some((r) => r.includes("Fleetwood Mac"))).toBe(true);
    expect(result.reasons.some((r) => r.includes("tribute"))).toBe(true);
  });
});

describe("matchEvent — policy filters", () => {
  it("rejects musically relevant event outside preferred cities", () => {
    const result = matchEvent({
      event: {
        ...baseEvent,
        venue_city: "Glasgow",
        venue_postcode: "G1 1AA",
      },
      offers: baseOffers,
      userPrefs: { ...basePrefs, preferred_cities: ["London"] },
      followedArtists: followed,
    });

    expect(result.eligible).toBe(true);
    expect(result.reasons.every((r) => !r.includes("Glasgow"))).toBe(true);
  });

  it("handles event with no offers gracefully", () => {
    const result = matchEvent({
      event: baseEvent,
      offers: [],
      userPrefs: basePrefs,
      followedArtists: followed,
    });

    expect(result.eligible).toBe(true);
    expect(result.warnings.some((w) => w.includes("View not verified") || w.includes("Price not supplied"))).toBe(true);
  });

  it("rejects events with only restricted view offers", () => {
    const result = matchEvent({
      event: baseEvent,
      offers: [{ ...baseOffers[0], seat_quality: "restricted view" }],
      userPrefs: { ...basePrefs, reject_restricted_view: true },
      followedArtists: followed,
    });

    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes("Rejected"))).toBe(true);
  });
});

describe("matchEvent — semantic lane", () => {
  it("scores a semantic match at +25", () => {
    const result = matchEvent({
      event: { ...baseEvent, artist_name: "Alt-J", title: "Alt-J Live" },
      offers: baseOffers,
      userPrefs: basePrefs,
      followedArtists: followed,
      semanticMatch: {
        eventId: "e1",
        decision: "recommend",
        semanticFit: 0.85,
        supportingArtists: [
          { artistId: "a1", name: "Radiohead", similarity: 0.85 },
          { artistId: "a2", name: "Muse", similarity: 0.78 },
        ],
        reasonCodes: ["genre_overlap"],
        explanation: "Alt-J shares the art-rock style of Radiohead",
        caveats: [],
      },
    });

    expect(result.eligible).toBe(true);
    expect(result.reasons.some((r) => r.includes("Taste match"))).toBe(true);
    expect(result.reasons.some((r) => r.includes("Radiohead"))).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(25);
  });

  it("semantic match score is lower than regex", () => {
    const regexResult = matchEvent({
      event: baseEvent,
      offers: baseOffers,
      userPrefs: basePrefs,
      followedArtists: followed,
    });

    const semanticResult = matchEvent({
      event: { ...baseEvent, artist_name: "Alt-J", title: "Alt-J" },
      offers: baseOffers,
      userPrefs: basePrefs,
      followedArtists: followed,
      semanticMatch: {
        eventId: "e1",
        decision: "recommend",
        semanticFit: 0.9,
        supportingArtists: [{ artistId: "a1", name: "Radiohead", similarity: 0.9 }],
        reasonCodes: [],
        explanation: "",
        caveats: [],
      },
    });

    expect(semanticResult.score).toBeLessThan(regexResult.score);
  });

  it("rejects semantic match with low fit", () => {
    const result = matchEvent({
      event: { ...baseEvent, artist_name: "Random DJ", title: "Random DJ" },
      offers: baseOffers,
      userPrefs: basePrefs,
      followedArtists: followed,
      semanticMatch: {
        eventId: "e1",
        decision: "recommend",
        semanticFit: 0.5,
        supportingArtists: [],
        reasonCodes: [],
        explanation: "",
        caveats: [],
      },
    });

    expect(result.eligible).toBe(false);
  });

  it("rejects semantic match with uncertain decision", () => {
    const result = matchEvent({
      event: { ...baseEvent, artist_name: "Random DJ", title: "Random DJ" },
      offers: baseOffers,
      userPrefs: basePrefs,
      followedArtists: followed,
      semanticMatch: {
        eventId: "e1",
        decision: "uncertain",
        semanticFit: 0.85,
        supportingArtists: [{ artistId: "a1", name: "Radiohead", similarity: 0.85 }],
        reasonCodes: [],
        explanation: "",
        caveats: [],
      },
    });

    expect(result.eligible).toBe(false);
  });
});
