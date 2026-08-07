import { describe, it, expect } from "vitest";
import { buildArtistCard, buildEventCard, cosineSimilarity } from "./embeddings";

describe("buildArtistCard", () => {
  it("builds a compact card with all fields", () => {
    const card = buildArtistCard({
      id: "a1",
      name: "Radiohead",
      genres: ["alternative rock", "art rock", "experimental"],
      spotifyScore: 85,
      relationship: "follow",
    });

    expect(card).toContain("Artist: Radiohead");
    expect(card).toContain("Genres: alternative rock, art rock, experimental");
    expect(card).toContain("Taste weight: 85 (follow)");
  });

  it("omits genres when empty", () => {
    const card = buildArtistCard({
      id: "a2",
      name: "Unknown Artist",
      genres: [],
      spotifyScore: 20,
      relationship: "follow",
    });

    expect(card).toContain("Artist: Unknown Artist");
    expect(card).not.toContain("Genres:");
  });

  it("truncates genres to 5", () => {
    const card = buildArtistCard({
      id: "a3",
      name: "Genre Hog",
      genres: ["a", "b", "c", "d", "e", "f", "g"],
      spotifyScore: null,
      relationship: "follow",
    });

    expect(card.match(/Genres: (.+)/)?.[1].split(", ").length).toBe(5);
  });
});

describe("buildEventCard", () => {
  it("builds a compact event card", () => {
    const card = buildEventCard({
      id: "e1",
      title: "Radiohead at O2",
      artistName: "Radiohead",
      genres: ["alternative rock"],
      lineup: ["Radiohead"],
      eventType: "concert",
    });

    expect(card).toContain("Event: Radiohead at O2");
    expect(card).toContain("Artist: Radiohead");
    expect(card).toContain("Genres: alternative rock");
    expect(card).toContain("Type: concert");
    expect(card).not.toContain("Lineup:");
  });

  it("includes lineup when > 1 artist", () => {
    const card = buildEventCard({
      id: "e2",
      title: "Festival",
      artistName: "Radiohead",
      genres: [],
      lineup: ["Radiohead", "Muse", "Foals"],
      eventType: "concert",
    });

    expect(card).toContain("Lineup: Radiohead, Muse, Foals");
  });
});

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const v = [1, 2, 3, 4, 5];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0, 5);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 5);
  });

  it("returns 0 for empty vectors", () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it("returns 0 for mismatched lengths", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it("returns 0 for zero vectors", () => {
    expect(cosineSimilarity([0, 0, 0], [0, 0, 0])).toBe(0);
  });

  it("computes correctly for known vectors", () => {
    const sim = cosineSimilarity([1, 2, 3], [4, 5, 6]);
    expect(sim).toBeCloseTo(0.9746, 3);
  });
});
