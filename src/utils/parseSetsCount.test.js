import { describe, it, expect } from "vitest";

const MODULE_PATH = "./parseSetsCount";

async function loadParseSetsCount() {
  try {
    const mod = await import(MODULE_PATH);
    return mod.default;
  } catch {
    return null;
  }
}

const EDGE_CASES = [
  // Positive integers
  [1, 1, "minimum valid positive integer"],
  [3, 3, "standard count 3"],
  [5, 5, "standard count 5"],
  [10, 10, "high-volume count 10"],

  // Positive floats (floored)
  [3.9, 3, "floors 3.9 to 3"],
  [4.2, 4, "floors 4.2 to 4"],
  [0.9, 3, "floors 0.9 to 0 and falls back to 3"],

  // Numeric strings
  ["4", 4, "plain numeric string"],
  ["  5  ", 5, "trimmed numeric string"],
  ["4.7", 4, "floors numeric string 4.7 to 4"],
  ["0.5", 3, "numeric string flooring below 1 falls back to 3"],

  // With set(s) suffix
  ["1 set", 1, "singular set suffix"],
  ["4 sets", 4, "plural sets suffix"],
  ["4SETS", 4, "case-insensitive suffix without space"],

  // Ranges
  ["3-4", 4, "range uses upper end"],
  ["3 - 5", 5, "range with spaces around hyphen"],
  ["3\u20134", 4, "range with en-dash"],
  ["3\u20145", 5, "range with em-dash"],
  ["3 to 4", 4, "range with word separator to"],
  ["3-4 sets", 4, "range with sets suffix"],
  ["3 sets to 5 sets", 5, "range with suffix on both bounds"],
  ["5-3", 5, "reversed range takes max"],
  ["0-4", 4, "zero-low range takes positive upper end"],
  ["0-0", 3, "zero-to-zero range falls back to 3"],

  // Non-numeric strings
  ["AMRAP", 3, "AMRAP falls back to 3"],
  ["amrap", 3, "lowercase amrap falls back to 3"],
  ["N/A", 3, "N/A falls back to 3"],
  ["to failure", 3, "to failure falls back to 3"],
  ["100% effort", 3, "percentage string does not parse 100 rows"],
  ["4x10", 3, "malformed sets x reps string falls back to 3"],

  // Zero / Negative
  [0, 3, "numeric zero falls back to 3"],
  ["0", 3, "string zero falls back to 3"],
  ["0 sets", 3, "zero sets string falls back to 3"],
  [-2, 3, "negative number falls back to 3"],
  ["-2", 3, "negative numeric string falls back to 3"],
  ["-3-4", 3, "negative range falls back to 3"],

  // Non-finite
  [NaN, 3, "NaN falls back to 3"],
  [Infinity, 3, "Infinity falls back to 3"],
  [-Infinity, 3, "-Infinity falls back to 3"],

  // Empty / Invalid types
  ["", 3, "empty string falls back to 3"],
  ["   ", 3, "whitespace-only string falls back to 3"],
  [null, 3, "null falls back to 3"],
  [undefined, 3, "undefined falls back to 3"],
  [true, 3, "boolean true falls back to 3"],
  [false, 3, "boolean false falls back to 3"],
  [{}, 3, "object falls back to 3"],
  [[4], 3, "array falls back to 3"],
  [() => 4, 3, "function falls back to 3"],
];

describe("parseSetsCount", () => {
  it.each(EDGE_CASES)(
    "parses %j into %i (%s)",
    async (input, expected) => {
      const parseSetsCount = await loadParseSetsCount();
      expect(parseSetsCount).toBeTypeOf("function");
      expect(parseSetsCount(input)).toBe(expected);
    }
  );

  it("always returns a positive integer and is idempotent across all inputs", async () => {
    const parseSetsCount = await loadParseSetsCount();
    expect(parseSetsCount).toBeTypeOf("function");

    for (const [input] of EDGE_CASES) {
      const first = parseSetsCount(input);
      expect(Number.isInteger(first)).toBe(true);
      expect(first).toBeGreaterThanOrEqual(1);
      expect(parseSetsCount(first)).toBe(first);
    }
  });
});
