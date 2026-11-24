import { describe, it, expect } from "vitest";

const MODULE_PATH = "./parseRestSeconds";

async function loadParseRestSeconds() {
  try {
    const mod = await import(MODULE_PATH);
    return mod.default;
  } catch {
    return null;
  }
}

const EDGE_CASES = [
  // Seconds (units)
  ["60s", 60, "standard seconds shorthand"],
  ["90S", 90, "case-insensitive seconds shorthand"],
  ["45 s", 45, "space before s unit"],
  ["45 sec", 45, "sec unit"],
  ["45 secs", 45, "secs unit"],
  ["1 second", 1, "singular second unit"],
  ["120 seconds", 120, "plural seconds unit"],

  // Minutes (units)
  ["2m", 120, "standard minutes shorthand"],
  ["3M", 180, "case-insensitive minutes shorthand"],
  ["2 m", 120, "space before m unit"],
  ["1 min", 60, "min unit"],
  ["2 mins", 120, "mins unit"],
  ["1 minute", 60, "singular minute unit"],
  ["3 minutes", 180, "plural minutes unit"],

  // Decimals
  ["1.5m", 90, "decimal minutes 1.5m"],
  ["0.5 min", 30, "decimal minutes 0.5 min"],
  ["1.25m", 75, "decimal minutes 1.25m"],
  ["45.6s", 46, "decimal seconds rounded to nearest integer"],
  ["0.5s", 1, "decimal seconds rounding to 1"],
  ["0.4s", 90, "decimal seconds rounding to 0 falls back to 90"],

  // Ranges (minutes)
  ["2-3m", 180, "minute range uses upper end"],
  ["1.5-2m", 120, "decimal-to-integer minute range"],
  ["1.5-2.5 min", 150, "decimal minute range with min unit"],
  ["2\u20133m", 180, "minute range with en-dash"],
  ["2\u20143 minutes", 180, "minute range with em-dash"],
  ["2 - 3 mins", 180, "minute range with spaces around hyphen"],
  ["2 to 3 min", 180, "minute range with word separator to"],

  // Ranges (seconds)
  ["60-90s", 90, "second range uses upper end"],
  ["30\u201345 sec", 45, "second range with en-dash"],
  ["60s-90s", 90, "second range with unit on both bounds"],

  // Ranges (mixed units, reversed, unitless, zero)
  ["90s-2m", 120, "mixed-unit range takes max seconds"],
  ["2m-90s", 120, "reversed mixed-unit range takes max seconds"],
  ["3-2m", 180, "reversed minute range takes max seconds"],
  ["60-120", 120, "unitless range defaults to seconds"],
  ["0-30s", 30, "zero-low range with positive upper end"],
  ["0-0s", 90, "zero-to-zero range falls back to 90"],

  // Compound minute + second
  ["1m 30s", 90, "compound minutes and seconds with space"],
  ["1m30s", 90, "compound minutes and seconds without space"],
  ["2 min 15 sec", 135, "compound min and sec words"],
  ["0m 45s", 45, "compound with 0 minutes and positive seconds"],
  ["0m 0s", 90, "compound zero falls back to 90"],

  // Clock M:SS
  ["1:30", 90, "clock format 1:30"],
  ["2:00", 120, "clock format 2:00"],
  ["0:45", 45, "clock format 0:45"],
  ["0:00", 90, "clock format 0:00 falls back to 90"],
  ["1:60", 90, "invalid clock seconds 60 falls back to 90"],

  // Numeric inputs and numeric strings
  [60, 60, "positive integer number 60"],
  [120, 120, "positive integer number 120"],
  [45.6, 46, "positive float number rounded"],
  [0.4, 90, "positive float rounding to 0 falls back to 90"],
  ["60", 60, "unitless numeric string"],
  ["  120  ", 120, "trimmed numeric string"],

  // Zero / Negative
  [0, 90, "numeric zero falls back to 90"],
  ["0", 90, "string zero falls back to 90"],
  ["0s", 90, "zero seconds falls back to 90"],
  ["0m", 90, "zero minutes falls back to 90"],
  [-30, 90, "negative number falls back to 90"],
  ["-30s", 90, "negative seconds string falls back to 90"],
  ["-2m", 90, "negative minutes string falls back to 90"],
  ["-2-3m", 90, "negative range falls back to 90"],

  // Non-finite
  [NaN, 90, "NaN falls back to 90"],
  [Infinity, 90, "Infinity falls back to 90"],
  [-Infinity, 90, "-Infinity falls back to 90"],

  // Invalid / Empty strings
  ["", 90, "empty string falls back to 90"],
  ["   ", 90, "whitespace-only string falls back to 90"],
  ["N/A", 90, "N/A falls back to 90"],
  ["none", 90, "none falls back to 90"],
  ["as needed", 90, "as needed falls back to 90"],
  ["2h", 90, "unsupported unit 2h falls back to 90"],
  ["60x", 90, "invalid unit 60x falls back to 90"],
  ["1.2.3m", 90, "malformed number falls back to 90"],
  ["2--3m", 90, "malformed double-hyphen range falls back to 90"],

  // Invalid types
  [null, 90, "null falls back to 90"],
  [undefined, 90, "undefined falls back to 90"],
  [true, 90, "boolean true falls back to 90"],
  [false, 90, "boolean false falls back to 90"],
  [{}, 90, "object falls back to 90"],
  [[60], 90, "array falls back to 90"],
  [() => 60, 90, "function falls back to 90"],
];

describe("parseRestSeconds", () => {
  it.each(EDGE_CASES)(
    "parses %j into %i (%s)",
    async (input, expected) => {
      const parseRestSeconds = await loadParseRestSeconds();
      expect(parseRestSeconds).toBeTypeOf("function");
      expect(parseRestSeconds(input)).toBe(expected);
    }
  );

  it("always returns a positive integer and is idempotent across all inputs", async () => {
    const parseRestSeconds = await loadParseRestSeconds();
    expect(parseRestSeconds).toBeTypeOf("function");

    for (const [input] of EDGE_CASES) {
      const first = parseRestSeconds(input);
      expect(Number.isInteger(first)).toBe(true);
      expect(first).toBeGreaterThanOrEqual(1);
      expect(parseRestSeconds(first)).toBe(first);
    }
  });
});
