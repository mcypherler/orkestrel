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
