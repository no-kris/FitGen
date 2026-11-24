import { describe, it, expect } from "vitest";

const MODULE_PATH = "./normalizeProfileText";

async function loadNormalizeProfileText() {
  try {
    const mod = await import(MODULE_PATH);
    return mod.default;
  } catch {
    return null;
  }
}

const EDGE_CASES = [
  // Empty and whitespace strings
  ["", "None", "new default empty string"],
  ["   ", "None", "whitespace-only string"],
  ["\t\n ", "None", "control whitespace"],

  // Canonical and case-insensitive "none"
  ["None", "None", "canonical None"],
  ["none", "None", "lowercase none"],
  ["  NONE  ", "None", "whitespace-padded uppercase NONE"],

  // Meaningful text strings
  ["knee pain", "knee pain", "plain preference text"],
  [
    "  Knee Pain, Back Injury  ",
    "Knee Pain, Back Injury",
    "trimmed while preserving casing",
  ],
  [
    "None of the overhead presses",
    "None of the overhead presses",
    "partial word None is meaningful text",
  ],

  // Legacy empty / none-only arrays
  [[], "None", "legacy empty array"],
  [[""], "None", "legacy array containing empty string"],
  [["  ", "None", "none"], "None", "legacy array with only empty and none"],

  // Legacy populated arrays
  [["knee pain"], "knee pain", "legacy single-item array"],
  [
    ["knee pain", "back injury"],
    "knee pain, back injury",
    "legacy multi-item array joined with comma-space",
  ],
  [
    ["  knee pain  ", "", "None", null, 42, "shoulder"],
    "knee pain, shoulder",
    "filters non-strings, empties, and none entries",
  ],

  // Nullish and invalid types
  [null, "None", "null field"],
  [undefined, "None", "undefined field"],
  [0, "None", "numeric zero"],
  [42, "None", "positive number"],
  [NaN, "None", "NaN"],
  [true, "None", "boolean true"],
  [false, "None", "boolean false"],
  [{}, "None", "plain object"],
];

describe("normalizeProfileText", () => {
  it.each(EDGE_CASES)(
    "normalizes %j into %j (%s)",
    async (input, expected) => {
      const normalizeProfileText = await loadNormalizeProfileText();
      expect(normalizeProfileText).toBeTypeOf("function");
      expect(normalizeProfileText(input)).toBe(expected);
    }
  );

  it("always returns a non-empty trimmed string and is idempotent across all inputs", async () => {
    const normalizeProfileText = await loadNormalizeProfileText();
    expect(normalizeProfileText).toBeTypeOf("function");

    for (const [input] of EDGE_CASES) {
      const first = normalizeProfileText(input);
      expect(typeof first).toBe("string");
      expect(first.trim().length).toBeGreaterThan(0);
      expect(first).toBe(first.trim());
      expect(normalizeProfileText(first)).toBe(first);
    }
  });

  it("never mutates input arrays", async () => {
    const normalizeProfileText = await loadNormalizeProfileText();
    expect(normalizeProfileText).toBeTypeOf("function");

    const input = ["  knee pain  ", "", "None", null, "shoulder"];
    const snapshot = [...input];

    const result = normalizeProfileText(input);

    expect(result).toBe("knee pain, shoulder");
    expect(input).toEqual(snapshot);
  });
});
