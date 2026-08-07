import { describe, it, expect } from "vitest";
import { formatAlertPreview, buildPriceLabel, buildSeatNote } from "./messaging";

describe("formatAlertPreview", () => {
  it("formats a standard concert alert", () => {
    const preview = formatAlertPreview({
      candidateId: "c1",
      title: "Radiohead Live",
      eventType: "concert",
      inspiredArtist: null,
      venueName: "O2 Arena",
      venueCity: "London",
      startsAt: "2025-09-15T19:30:00Z",
      priceLabel: "From £55.00 per person",
      seatNote: "Clear view",
      matchReasons: ["Followed artist: Radiohead"],
      warnings: [],
      officialUrl: "https://example.com/tickets",
    });

    expect(preview).toContain("Radiohead Live");
    expect(preview).toContain("O2 Arena");
    expect(preview).toContain("London");
    expect(preview).toContain("From £55.00 per person");
    expect(preview).toContain("Why: Followed artist: Radiohead");
    expect(preview).toContain("Book: https://example.com/tickets");
  });

  it("formats a tribute concert", () => {
    const preview = formatAlertPreview({
      candidateId: "c2",
      title: "The Bends Experience",
      eventType: "tribute_concert",
      inspiredArtist: "Radiohead",
      venueName: "BIC",
      venueCity: "Bournemouth",
      startsAt: null,
      priceLabel: "Price not supplied — check seller",
      seatNote: "View not verified",
      matchReasons: ["Followed artist: Radiohead (tribute)"],
      warnings: ["Tribute/experience — not the original artist"],
      officialUrl: null,
    });

    expect(preview).toContain("Radiohead tribute");
    expect(preview).toContain("Date TBA");
    expect(preview).not.toContain("Book:");
  });

  it("uses semantic evidence for taste matches", () => {
    const preview = formatAlertPreview({
      candidateId: "c3",
      title: "Alt-J Live",
      eventType: "concert",
      inspiredArtist: null,
      venueName: "Roundhouse",
      venueCity: "London",
      startsAt: "2025-10-01T20:00:00Z",
      priceLabel: "From £45.00 per person",
      seatNote: "View not verified",
      matchReasons: ["Taste match: because you like Radiohead, Muse"],
      warnings: [],
      officialUrl: "https://example.com",
      matchLane: "semantic",
      matchEvidence: {
        supportingArtists: [{ name: "Radiohead" }, { name: "Muse" }],
        explanation: "Alt-J shares art-rock influences",
      },
    });

    expect(preview).toContain("Recommended because you like Radiohead, Muse");
    expect(preview).not.toContain("Why:");
  });
});

describe("buildPriceLabel", () => {
  it("formats a from price", () => {
    expect(buildPriceLabel([{ price_amount: 55, price_type: "from" }])).toBe("From £55.00 per person");
  });

  it("formats an exact price", () => {
    expect(buildPriceLabel([{ price_amount: 30, price_type: "exact" }])).toBe("£30.00 per person");
  });

  it("returns fallback when no prices", () => {
    expect(buildPriceLabel([])).toBe("Price not supplied — check seller");
  });

  it("picks cheapest offer", () => {
    expect(buildPriceLabel([
      { price_amount: 100, price_type: "from" },
      { price_amount: 45, price_type: "from" },
    ])).toBe("From £45.00 per person");
  });
});

describe("buildSeatNote", () => {
  it("returns clear view when available", () => {
    expect(buildSeatNote([{ seat_quality: "clear", section: null }])).toBe("Clear view");
  });

  it("returns not verified for unknown quality", () => {
    expect(buildSeatNote([{ seat_quality: "unknown", section: null }])).toBe("View not verified");
  });

  it("returns not verified for empty offers", () => {
    expect(buildSeatNote([])).toBe("View not verified");
  });
});
