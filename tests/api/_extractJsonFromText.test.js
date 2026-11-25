import { afterEach, describe, expect, it, vi } from "vitest";
import defaultExtract, { extractJsonFromText } from "../../api/_extractJsonFromText.js";

describe("extractJsonFromText", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exports extractJsonFromText as both named and default export", () => {
    expect(extractJsonFromText).toBeTypeOf("function");
    expect(defaultExtract).toBe(extractJsonFromText);
  });

  it("parses raw JSON objects and arrays with surrounding whitespace", () => {
    expect(extractJsonFromText('  {"programName": "Strength", "weeks": []} \n')).toEqual({
      programName: "Strength",
      weeks: [],
    });
    expect(extractJsonFromText('\n  [1, {"a": true}, "x"]  ')).toEqual([1, { a: true }, "x"]);
  });

  it.each([
    [null], [undefined], [123], [true], [{}], [[]],
    [""], ["   \n\t  "], ["null"], ["true"], ["false"], ["42"], ["-3.14"], ['"hello world"'],
  ])("returns null for non-string, empty, or bare JSON primitive %j", (input) => {
    expect(extractJsonFromText(input)).toBeNull();
  });

  it("extracts JSON from labeled, uppercase, and unlabeled markdown fences", () => {
    const labeled = [
      "Here is your personalized workout plan:",
      "```json",
      '{"programName": "Upper/Lower", "totalWeeks": 6}',
      "```",
      "Let me know if you want changes!",
    ].join("\n");
    expect(extractJsonFromText(labeled)).toEqual({ programName: "Upper/Lower", totalWeeks: 6 });
    expect(extractJsonFromText('Plan:\n```JSON\n[{"weekNumber": 1}]\n```\nDone.')).toEqual([
      { weekNumber: 1 },
    ]);
    expect(extractJsonFromText('Output:\n```\n{"ok": true}\n```\nEnjoy.')).toEqual({ ok: true });
  });

  it("skips non-JSON fences and handles prose inside a fenced JSON block", () => {
    const multiFence = [
      "Warmup:",
      "```",
      "5 min light cardio",
      "```",
      "```json",
      '{"programName": "Push Pull Legs", "totalWeeks": 4}',
      "```",
    ].join("\n");
    expect(extractJsonFromText(multiFence)).toEqual({
      programName: "Push Pull Legs",
      totalWeeks: 4,
    });

    const proseInFence = '```json\nResponse payload: {"weekNumber": 2, "schedule": []} (end)\n```';
    expect(extractJsonFromText(proseInFence)).toEqual({ weekNumber: 2, schedule: [] });
  });

  it("extracts valid JSON from prose containing stray braces or brackets", () => {
    expect(
      extractJsonFromText('Note {important}: {"a": 1, "b": [2, 3]} Enjoy {your workout}!')
    ).toEqual({ a: 1, b: [2, 3] });
    expect(extractJsonFromText('Step [one] -> [{"day": "Monday"}] (note [final])')).toEqual([
      { day: "Monday" },
    ]);
  });

  it("extracts deeply nested objects and handles escaped quotes, backslashes, and brackets in strings", () => {
    const nested = {
      programName: "Hypertrophy",
      weeks: [
        {
          weekNumber: 1,
          schedule: [
            {
              dayName: "Monday",
              exercises: [{ name: "Bench Press", sets: 4, reps: "8-10", alternatives: ["DB Press"] }],
            },
          ],
        },
      ],
    };
    expect(extractJsonFromText(`Plan:\n${JSON.stringify(nested)}\nDone!`)).toEqual(nested);

    const escaped =
      'Prefix: {"quote": "Say \\"hi {there}\\"", "path": "C:\\\\dir\\\\", "brackets": "keep } and ] inside", "arr": ["{", "}"]} Suffix';
    expect(extractJsonFromText(escaped)).toEqual({
      quote: 'Say "hi {there}"',
      path: "C:\\dir\\",
      brackets: "keep } and ] inside",
      arr: ["{", "}"],
    });
  });

  it.each([
    '{"a": 1',
    "[1, 2, 3",
    '{"a": 1,}',
    "{]",
    "[}",
    "Just plain coaching advice with no JSON.",
  ])("returns null for truncated or malformed input: %s", (input) => {
    expect(extractJsonFromText(input)).toBeNull();
  });

  it("terminates quickly on pathological unclosed braces without logging", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const start = Date.now();
    expect(extractJsonFromText("{".repeat(50_000))).toBeNull();
    expect(Date.now() - start).toBeLessThan(1000);

    extractJsonFromText("not json {broken");
    extractJsonFromText("```json\n{bad}\n```");
    extractJsonFromText(null);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
