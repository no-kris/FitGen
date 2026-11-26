import { beforeAll, describe, expect, it } from "vitest";

const promptsUrl = new URL("../../api/_prompts.js", import.meta.url).href;
let promptsModule = null;

beforeAll(async () => {
  try {
    promptsModule = await import(/* @vite-ignore */ promptsUrl);
  } catch {
    promptsModule = null;
  }
});

function getPrompts() {
  expect(promptsModule, "api/_prompts.js must exist").not.toBeNull();
  return promptsModule;
}

function makeInitialProfile(overrides = {}) {
  return {
    goal: "build muscle",
    level: "intermediate",
    selectedDays: ["Monday", "Wednesday", "Friday"],
    equipment: "full gym",
    duration: 60,
    weeks: 6,
    exclusions: "None",
    priorities: "None",
    ...overrides,
  };
}

function makeLastWeek(overrides = {}) {
  return {
    weekNumber: 1,
    schedule: [
      {
        dayNumber: 1,
        dayName: "Monday",
        focus: "Push",
        exercises: [{ name: "Bench Press" }, { name: "Incline DB Press" }],
      },
    ],
    ...overrides,
  };
}

describe("api/_prompts helpers", () => {
  it("exports DEFAULT_DURATION_MINUTES = 60 and normalizes profile text identically to client", () => {
    const { DEFAULT_DURATION_MINUTES, normalizeProfileText } = getPrompts();
    expect(DEFAULT_DURATION_MINUTES).toBe(60);

    for (const empty of ["", "   ", "none", "None", "  NONE ", [], ["", "None"], null, undefined, 42, true, {}]) {
      expect(normalizeProfileText(empty)).toBe("None");
    }

    expect(normalizeProfileText("  Knee Pain  ")).toBe("Knee Pain");

    const input = ["  Lower Back  ", "", "none", 123, "Right Shoulder"];
    const snapshot = [...input];
    expect(normalizeProfileText(input)).toBe("Lower Back, Right Shoulder");
    expect(input).toEqual(snapshot);
  });

  it("resolves valid numeric/string durations and falls back to 60 for invalid values", () => {
    const { resolveDurationMinutes } = getPrompts();

    for (const [raw, expected] of [
      [30, 30],
      [45, 45],
      [90, 90],
      ["30", 30],
      [" 45 ", 45],
      [45.6, 46],
    ]) {
      expect(resolveDurationMinutes(raw)).toBe(expected);
    }

    for (const invalid of [
      undefined, null, 0, 0.4, -15, NaN, Infinity, "", "   ", "invalid", true, false, {}, [45],
    ]) {
      expect(resolveDurationMinutes(invalid)).toBe(60);
    }
  });

  it("formats flat and legacy nested recentWorkouts, caps at last 10, and handles empty input", () => {
    const { formatRecentWorkouts } = getPrompts();
    const fallback = "No logs recorded yet (assume standard progression).";

    expect(formatRecentWorkouts(null)).toBe(fallback);
    expect(formatRecentWorkouts([])).toBe(fallback);
    expect(formatRecentWorkouts([null, "bad", 42])).toBe(fallback);

    const mixed = [
      { focus: "Push", logs: [{ name: "Bench" }, { name: "Dips" }], duration: 2700 },
      { workout: { focus: "Pull" }, logs: [{ name: "Row" }], duration: 1850 },
      { id: "incomplete", logs: null, duration: -10 },
    ];
    expect(formatRecentWorkouts(mixed)).toBe(
      [
        "Push: 2 exercises completed. Duration: 45 minutes.",
        "Pull: 1 exercises completed. Duration: 30 minutes.",
        "Workout: 0 exercises completed. Duration: 0 minutes.",
      ].join("\n")
    );

    const twelveLogs = Array.from({ length: 12 }, (_, idx) => ({
      focus: `Session ${idx + 1}`,
      logs: [{ name: "Ex" }],
      duration: 600,
    }));
    const formatted = formatRecentWorkouts(twelveLogs);
    expect(formatted).not.toContain("Session 1:");
    expect(formatted).not.toContain("Session 2:");
    expect(formatted).toContain("Session 3: 1 exercises completed. Duration: 10 minutes.");
    expect(formatted).toContain("Session 12: 1 exercises completed. Duration: 10 minutes.");
    expect(formatted.split("\n")).toHaveLength(10);
  });

  it("builds single-source JSON schema snippet for initial and week modes", () => {
    const { buildPlanSchemaSnippet } = getPrompts();

    const initialSnippet = buildPlanSchemaSnippet({ mode: "initial", weekNumber: 1, totalWeeks: 6 });
    expect(initialSnippet).toContain('"programName"');
    expect(initialSnippet).toContain('"totalWeeks": 6');
    expect(initialSnippet).toContain('"weekNumber": 1');
    expect(initialSnippet).toContain('"restSeconds": 60');
    expect(initialSnippet).toContain('"rest": "60s"');
    expect(initialSnippet).toContain('"alternatives"');

    const weekSnippet = buildPlanSchemaSnippet({ mode: "week", weekNumber: 3 });
    expect(weekSnippet).toContain('"programName"');
    expect(weekSnippet).toContain('"weekNumber": 3');
    expect(weekSnippet).toContain('"restSeconds": 60');
    expect(weekSnippet).not.toContain('"totalWeeks"');
  });
});

describe("buildInitialPlanPrompt", () => {
  it.each([
    {
      goal: "  Build Muscle ",
      equipment: " Full Gym ",
      goalFragment: "Focus on higher reps (8-12), moderate weights, and shorter rest periods (2-3m) to build muscle.",
      equipmentFragment: "Use a full gym with a wide range of equipment to perform a variety of exercises.",
    },
    {
      goal: "lose weight",
      equipment: "Home Gym (Basic Equipment)",
      goalFragment: "Focus on metabolic conditioning, high reps (12-15+), circuit training or supersets, and short rest periods (1-2m) to keep heart rate up.",
      equipmentFragment: "Use basic equipment at home, such as dumbbells, resistance bands, and a mat.",
    },
    {
      goal: "GAIN STRENGTH",
      equipment: "bodyweight",
      goalFragment: "Focus on lower reps (4-6), heavy weights, and longer rest periods (3-5m) to maximize strength.",
      equipmentFragment: "Use only bodyweight exercises to perform a variety of exercises.",
    },
  ])("maps canonical goal=$goal and equipment=$equipment instructions", ({ goal, equipment, goalFragment, equipmentFragment }) => {
    const { buildInitialPlanPrompt } = getPrompts();
    const prompt = buildInitialPlanPrompt(makeInitialProfile({ goal, equipment }));

    expect(prompt).toContain(goalFragment);
    expect(prompt).toContain(equipmentFragment);
    expect(prompt).not.toContain("undefined");
  });

  it("uses safe fallbacks for unknown goal/equipment and normalizes exclusions, priorities, and duration", () => {
    const { buildInitialPlanPrompt, buildPlanSchemaSnippet } = getPrompts();
    const prompt = buildInitialPlanPrompt(
      makeInitialProfile({
        goal: "Athletic Power",
        equipment: "Kettlebells only",
        duration: "45",
        weeks: 8,
        exclusions: ["  knee pain ", "none"],
        priorities: "   ",
      })
    );

    expect(prompt).toContain("Tailor reps, intensity, and rest periods specifically to achieve: Athletic Power.");
    expect(prompt).toContain("Use only the user's available equipment: Kettlebells only.");
    expect(prompt).not.toContain("undefined");
    expect(prompt).toContain("45 minutes");
    expect(prompt).toContain("8-week program");
    expect(prompt).toContain("**EXCLUSIONS & INJURIES (CRITICAL):** knee pain ");
    expect(prompt).toContain("**PRIORITIZE MUSCLE GROUPS:** None ");
    expect(prompt).toContain("DOUBLE-CHECK Exclusions: 'knee pain'.");
    expect(prompt).toContain("DOUBLE-CHECK Prioritize: 'None'.");
    expect(prompt).toContain(buildPlanSchemaSnippet({ mode: "initial", weekNumber: 1, totalWeeks: 8 }));
  });
});

describe("buildNextWeekPrompt", () => {
  it("computes nextWeekNumber, formats previous week/history/feedback, and uses shared week schema", () => {
    const { buildNextWeekPrompt, buildPlanSchemaSnippet } = getPrompts();
    const prompt = buildNextWeekPrompt({
      profile: {
        goal: "build muscle",
        level: "intermediate",
        equipment: "full gym",
        selectedDays: ["Monday", "Thursday"],
        duration: 45,
        exclusions: "lower back",
        priorities: "upper chest",
      },
      programName: "Hypertrophy Protocol",
      lastWeek: makeLastWeek({ weekNumber: 2 }),
      recentWorkouts: [{ focus: "Push", logs: [{ name: "Bench Press" }], duration: 2400 }],
      feedback: "Left shoulder felt tight",
    });

    expect(prompt).toContain('Week 2 of "Hypertrophy Protocol"');
    expect(prompt).toContain("WEEK 3");
    expect(prompt).toContain("Monday, Thursday");
    expect(prompt).toContain("lower back");
    expect(prompt).toContain("upper chest");
    expect(prompt).toContain("Left shoulder felt tight");
    expect(prompt).toContain("Push: 1 exercises completed. Duration: 40 minutes.");
    expect(prompt).toContain("Adjust volume to fit 45 minutes.");
    expect(prompt).toContain(
      JSON.stringify([{ day: "Monday", focus: "Push", exercises: ["Bench Press", "Incline DB Press"] }])
    );
    expect(prompt).toContain(buildPlanSchemaSnippet({ mode: "week", weekNumber: 3 }));
    expect(prompt).not.toContain('"totalWeeks"');
  });

  it("ignores legacy sessionDuration alias and handles omitted programName, feedback, and history", () => {
    const { buildNextWeekPrompt } = getPrompts();
    const legacyKey = ["session", "Duration"].join("");
    const profile = {
      goal: "gain strength",
      level: "beginner",
      equipment: "bodyweight",
      selectedDays: ["Tuesday", "Friday"],
      [legacyKey]: 30,
    };

    const prompt = buildNextWeekPrompt({
      profile,
      programName: "   ",
      lastWeek: makeLastWeek({ weekNumber: 1 }),
      recentWorkouts: [],
      feedback: "   ",
    });

    expect(prompt).toContain('"their training program"');
    expect(prompt).toContain("Adjust volume to fit 60 minutes.");
    expect(prompt).toContain("No logs recorded yet (assume standard progression).");
    expect(prompt).toContain('"None"');
    expect(prompt).not.toContain("undefined");
  });
});
