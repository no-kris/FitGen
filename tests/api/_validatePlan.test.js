import { afterEach, describe, expect, it, vi } from "vitest";
import defaultValidate, { validatePlan } from "../../api/_validatePlan.js";

const makeExercise = (overrides = {}) => ({
  name: "Barbell Squat", sets: 4, reps: "6-8", rest: "2-3m",
  notes: "Control eccentric", alternatives: ["Goblet Squat", "Leg Press"], ...overrides,
});

const makeDay = (overrides = {}) => ({
  dayNumber: 1, dayName: "Monday", focus: "Lower Body Strength", exercises: [makeExercise()], ...overrides,
});

const makeWeek = (overrides = {}) => ({
  weekNumber: 1, description: "Foundation week", coachNotes: "Focus on bracing",
  schedule: [
    makeDay({ dayNumber: 1, dayName: "Monday", focus: "Lower Body" }),
    makeDay({ dayNumber: 2, dayName: "Wednesday", focus: "Upper Push", exercises: [makeExercise({ name: "Bench Press", sets: 3, reps: "8-10", rest: "90s", alternatives: ["DB Press"] })] }),
    makeDay({ dayNumber: 3, dayName: "Friday", focus: "Upper Pull", exercises: [makeExercise({ name: "Barbell Row", sets: 3, reps: "8-12", rest: "90s", alternatives: ["Cable Row"] })] }),
  ],
  ...overrides,
});

const makeInitialPlan = (overrides = {}) => ({
  programName: "Strength Foundation", description: "6-week progressive overload program",
  totalWeeks: 6, weeks: [makeWeek()], ...overrides,
});

const planWithSchedule = (schedule, weekOverrides = {}) =>
  makeInitialPlan({ weeks: [makeWeek({ schedule, ...weekOverrides })] });

const planWithExercise = (exerciseOverrides) =>
  planWithSchedule([makeDay({ exercises: [makeExercise(exerciseOverrides)] })]);

function assertNoUndefined(value, path = "plan") {
  expect(value, `${path} must not be undefined`).not.toBeUndefined();
  if (Array.isArray(value)) value.forEach((item, i) => assertNoUndefined(item, `${path}[${i}]`));
  else if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) assertNoUndefined(value[key], `${path}.${key}`);
  }
}

describe("validatePlan", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("exports validatePlan as both named and default export", () => {
    expect(validatePlan).toBeTypeOf("function");
    expect(defaultValidate).toBe(validatePlan);
  });

  describe("initial & week mode happy paths", () => {
    it("sanitizes a valid initial plan with trimmed strings, canonical rest, and zero undefined values", () => {
      const result = validatePlan(
        makeInitialPlan({
          programName: "  Strength Foundation  ", description: "  6-week progressive overload  ",
          weeks: [makeWeek({ description: "  Week 1 intro  ", coachNotes: "  Keep 2 RIR  " })],
        }),
        { mode: "initial", selectedDays: ["Monday", "Wednesday", "Friday"], expectedWeekNumber: 1, expectedTotalWeeks: 6 }
      );
      expect(result.ok).toBe(true);
      expect(result.plan).toMatchObject({ programName: "Strength Foundation", description: "6-week progressive overload", totalWeeks: 6 });
      expect(result.plan.weeks[0]).toMatchObject({ description: "Week 1 intro", coachNotes: "Keep 2 RIR" });
      expect(result.plan.weeks[0].schedule[0].exercises[0]).toMatchObject({ restSeconds: 180, rest: "180s" });
      assertNoUndefined(result.plan);
    });

    it("resolves totalWeeks and defaults missing optional strings to empty string", () => {
      expect(validatePlan(makeInitialPlan({ totalWeeks: 12 }), { expectedTotalWeeks: 8 }).plan.totalWeeks).toBe(8);
      expect(validatePlan(makeInitialPlan({ totalWeeks: " 10 " })).plan.totalWeeks).toBe(10);

      for (const badTotal of [undefined, null, 0, -3, 2.5, "six"]) {
        const res = validatePlan(makeInitialPlan({ totalWeeks: badTotal, weeks: [makeWeek({ weekNumber: 1 }), makeWeek({ weekNumber: 2 })] }));
        expect(res.ok).toBe(true);
        expect(res.plan.totalWeeks).toBe(2);
      }

      const minimal = validatePlan({
        programName: "Minimal", description: undefined,
        weeks: [{ weekNumber: 1, description: null, coachNotes: 123, schedule: [{ dayName: "Monday", focus: "Full Body", exercises: [{ name: "Push-Up", sets: 3, reps: "12" }] }] }],
      });
      expect(minimal.ok).toBe(true);
      expect(minimal.plan.description).toBe("");
      expect(minimal.plan.weeks[0]).toMatchObject({ description: "", coachNotes: "" });
      expect(minimal.plan.weeks[0].schedule[0].exercises[0].notes).toBe("");
      assertNoUndefined(minimal.plan);
    });

    it("accepts wrapped and bare week payloads, omits absent/blank optional fields, and rejects bad week counts", () => {
      const wrapped = validatePlan(
        { programName: "  Phase 2 ", description: " Intensification ", totalWeeks: 8, weeks: [makeWeek({ weekNumber: 2 })] },
        { mode: "week", selectedDays: ["Monday", "Wednesday", "Friday"], expectedWeekNumber: 2 }
      );
      expect(wrapped.ok).toBe(true);
      expect(wrapped.plan).toMatchObject({ programName: "Phase 2", description: "Intensification" });
      expect("totalWeeks" in wrapped.plan).toBe(false);

      const blankMeta = validatePlan({ programName: "   ", description: "  ", weeks: [makeWeek({ weekNumber: 2 })] }, { mode: "week", expectedWeekNumber: 2 });
      expect(blankMeta.ok).toBe(true);
      expect("programName" in blankMeta.plan).toBe(false);
      expect("description" in blankMeta.plan).toBe(false);

      const bare = validatePlan(
        { weekNumber: 2, coachNotes: "Add 2.5kg", schedule: [makeDay({ dayName: "Monday" })] },
        { mode: "week", selectedDays: ["Monday", "Wednesday"], expectedWeekNumber: 2 }
      );
      expect(bare.ok).toBe(true);
      expect("programName" in bare.plan).toBe(false);
      expect("description" in bare.plan).toBe(false);
      expect("totalWeeks" in bare.plan).toBe(false);
      expect(bare.plan.weeks[0].coachNotes).toBe("Add 2.5kg");

      expect(validatePlan({ weeks: [] }, { mode: "week" }).ok).toBe(false);
      expect(validatePlan({ weeks: [makeWeek({ weekNumber: 2 }), makeWeek({ weekNumber: 3 })] }, { mode: "week" }).ok).toBe(false);
      expect(validatePlan({ programName: "No weeks" }, { mode: "week" }).ok).toBe(false);
    });
  });

  describe("structural, weekNumber, and weekday/dayNumber validation", () => {
    it.each([[null], [undefined], [[]], ["plan"], [42], [true]])("rejects non-object rawPlan %j", (badInput) => {
      const res = validatePlan(badInput);
      expect(res.ok).toBe(false);
      expect(res.errors.length).toBeGreaterThan(0);
    });

    it("rejects missing required fields and invalid or mismatched weekNumber values", () => {
      for (const programName of [undefined, "", "   ", 123]) {
        const res = validatePlan(makeInitialPlan({ programName }));
        expect(res.ok).toBe(false);
        expect(res.errors.some((e) => e.includes("programName"))).toBe(true);
      }

      for (const badPlan of [
        makeInitialPlan({ weeks: [] }),
        planWithSchedule([]),
        planWithSchedule([makeDay({ dayName: "" })]),
        planWithSchedule([makeDay({ dayName: undefined })]),
        planWithSchedule([makeDay({ focus: "  " })]),
        planWithSchedule([makeDay({ exercises: [] })]),
        planWithExercise({ name: "" }),
      ]) {
        expect(validatePlan(badPlan).ok).toBe(false);
      }

      expect(validatePlan(makeInitialPlan({ weeks: [makeWeek({ weekNumber: 1 }), makeWeek({ weekNumber: 2 })] }), { mode: "initial", expectedWeekNumber: 1 }).ok).toBe(false);
      expect(validatePlan(makeInitialPlan({ weeks: [makeWeek({ weekNumber: 1 })] }), { expectedWeekNumber: 2 }).ok).toBe(false);

      for (const badWeek of [1.5, 0, -1, "1", null, undefined, NaN]) {
        const res = validatePlan(makeInitialPlan({ weeks: [makeWeek({ weekNumber: badWeek })] }));
        expect(res.ok).toBe(false);
        expect(res.errors.some((e) => e.includes("weekNumber"))).toBe(true);
      }
    });

    it("normalizes weekday abbreviations, enforces selectedDays subset & uniqueness, and normalizes dayNumbers", () => {
      const allDays = validatePlan(
        planWithSchedule(["mon", "tues", "weds", "thur", "fri", "sat", "sun"].map((dayName, i) => makeDay({ dayNumber: i + 1, dayName })))
      );
      expect(allDays.ok).toBe(true);
      expect(allDays.plan.weeks[0].schedule.map((d) => d.dayName)).toEqual([
        "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
      ]);

      const subset = validatePlan(
        planWithSchedule([makeDay({ dayName: " mon. " }), makeDay({ dayNumber: 2, dayName: "FRI" })]),
        { selectedDays: ["monday", "tues", "WEDNESDAY", "Friday"] }
      );
      expect(subset.ok).toBe(true);
      expect(subset.plan.weeks[0].schedule.map((d) => d.dayName)).toEqual(["Monday", "Friday"]);

      expect(validatePlan(planWithSchedule([makeDay({ dayName: "Tuesday" })]), { selectedDays: ["Monday", "Wednesday"] }).ok).toBe(false);
      expect(
        validatePlan(
          planWithSchedule([makeDay({ dayNumber: 1, dayName: "Monday" }), makeDay({ dayNumber: 2, dayName: "mon" })]),
          { selectedDays: ["Monday", "Wednesday"] }
        ).ok
      ).toBe(false);

      const preserved = validatePlan(
        planWithSchedule([makeDay({ dayNumber: 1, dayName: "Monday" }), makeDay({ dayNumber: 3, dayName: "Wednesday" }), makeDay({ dayNumber: 5, dayName: "Friday" })])
      );
      expect(preserved.plan.weeks[0].schedule.map((d) => d.dayNumber)).toEqual([1, 3, 5]);

      for (const [n1, n2, n3] of [[1, 1, 2], [undefined, 2, 3], [0, 1, 2], [1.5, 2, 3], ["1", 2, 3]]) {
        const res = validatePlan(planWithSchedule([
          makeDay({ dayNumber: n1, dayName: "Monday" }),
          makeDay({ dayNumber: n2, dayName: "Wednesday" }),
          makeDay({ dayNumber: n3, dayName: "Friday" }),
        ]));
        expect(res.plan.weeks[0].schedule.map((d) => d.dayNumber)).toEqual([1, 2, 3]);
      }
    });

    it.each(["constructor", "__proto__"])(
      "rejects prototype key %j in dayName and selectedDays without throwing",
      (protoKey) => {
        const dayRes = validatePlan(planWithSchedule([makeDay({ dayName: protoKey })]), { selectedDays: ["Monday"] });
        expect(dayRes.ok).toBe(false);
        expect(dayRes.errors.length).toBeGreaterThan(0);

        const optRes = validatePlan(makeInitialPlan(), { selectedDays: [protoKey] });
        expect(optRes.ok).toBe(false);
        expect(optRes.errors.length).toBeGreaterThan(0);
      }
    );
  });

  describe("exercise sanitization", () => {
    it.each([
      [1, 1], [3.9, 3], [0.9, 3], ["  5  ", 5], ["4 sets", 4],
      ["3-4", 4], ["3\u20135", 5], ["3 to 4", 4], ["5-3", 5], ["0-4", 4],
      ["AMRAP", 3], ["4x10", 3], [0, 3], [-2, 3], [null, 3],
    ])("sanitizes sets %j -> %i", (rawSets, expected) => {
      const res = validatePlan(planWithExercise({ sets: rawSets }));
      expect(res.ok).toBe(true);
      expect(res.plan.weeks[0].schedule[0].exercises[0].sets).toBe(expected);
    });

    it("sanitizes valid reps and rejects invalid reps", () => {
      for (const [raw, expected] of [["  8-12  ", "8-12"], ["AMRAP", "AMRAP"], [10, "10"]]) {
        const res = validatePlan(planWithExercise({ reps: raw }));
        expect(res.ok).toBe(true);
        expect(res.plan.weeks[0].schedule[0].exercises[0].reps).toBe(expected);
      }
      for (const bad of [0, -5, NaN, Infinity, "", "   ", null, undefined, true, {}]) {
        const res = validatePlan(planWithExercise({ reps: bad }));
        expect(res.ok).toBe(false);
        expect(res.errors.some((e) => e.includes("reps"))).toBe(true);
      }
    });

    it.each([
      ["60s", 60], ["2m", 120], ["1.5m", 90], ["2-3m", 180], ["90s-2m", 120],
      ["2 to 3 min", 180], ["1m 30s", 90], ["1:30", 90], ["1:60", 90],
      [45.6, 46], [0.4, 90], ["N/A", 90], [0, 90], [undefined, 90],
    ])("sanitizes rest %j -> %is", (rawRest, expectedSeconds) => {
      const res = validatePlan(planWithExercise({ rest: rawRest, restSeconds: undefined }));
      expect(res.ok).toBe(true);
      expect(res.plan.weeks[0].schedule[0].exercises[0]).toMatchObject({ restSeconds: expectedSeconds, rest: `${expectedSeconds}s` });
    });

    it("honors restSeconds precedence over rest and sanitizes alternatives", () => {
      expect(validatePlan(planWithExercise({ restSeconds: 75, rest: "120s" })).plan.weeks[0].schedule[0].exercises[0]).toMatchObject({ restSeconds: 75, rest: "75s" });
      expect(validatePlan(planWithExercise({ restSeconds: "N/A", rest: "2-3m" })).plan.weeks[0].schedule[0].exercises[0]).toMatchObject({ restSeconds: 180, rest: "180s" });
      expect(validatePlan(planWithExercise({ alternatives: "not-an-array" })).plan.weeks[0].schedule[0].exercises[0].alternatives).toEqual([]);

      const cleaned = validatePlan(planWithExercise({
        name: "Barbell Squat",
        alternatives: ["  barbell squat ", "Goblet Squat", "goblet squat", "", 42, null, "  Front Squat  ", "FRONT SQUAT"],
      }));
      expect(cleaned.plan.weeks[0].schedule[0].exercises[0].alternatives).toEqual(["Goblet Squat", "Front Squat"]);
    });
  });

  describe("options, multi-error collection, immutability, idempotency, and purity", () => {
    it.each([
      { mode: "full" }, { mode: null }, { selectedDays: [] }, { selectedDays: "Monday" },
      { selectedDays: ["Monday", "Funday"] }, { expectedWeekNumber: 0 }, { expectedWeekNumber: 1.5 },
      { expectedWeekNumber: "1" }, { expectedTotalWeeks: 0 }, { expectedTotalWeeks: -2 }, { expectedTotalWeeks: "6" },
    ])("fails closed on invalid options %j", (opts) => {
      expect(validatePlan(makeInitialPlan(), opts).ok).toBe(false);
    });

    it("collects multiple validation errors in a single pass", () => {
      const broken = {
        programName: "   ",
        weeks: [{ weekNumber: 1, schedule: [{ dayNumber: 1, dayName: "Tuesday", focus: "", exercises: [{ name: "", sets: 3, reps: 0 }] }] }],
      };
      const res = validatePlan(broken, { mode: "initial", selectedDays: ["Monday", "Wednesday"], expectedWeekNumber: 2 });
      expect(res.ok).toBe(false);
      expect(res.errors.length).toBeGreaterThanOrEqual(5);
    });

    it("is pure, non-mutating, idempotent across initial and week modes, and silent on console", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const raw = planWithExercise({ sets: "3-4", reps: 10, rest: "2-3m", alternatives: ["Goblet Squat", "goblet squat", "Barbell Squat"] });
      const snapshot = structuredClone(raw);
      const opts = { mode: "initial", selectedDays: ["Monday", "Wednesday", "Friday"], expectedWeekNumber: 1, expectedTotalWeeks: 6 };

      const first = validatePlan(raw, opts);
      expect(first.ok).toBe(true);
      expect(raw).toEqual(snapshot);
      expect(validatePlan(first.plan, opts)).toEqual(first);
      assertNoUndefined(first.plan);

      const weekOpts = { mode: "week", selectedDays: ["Monday", "Wednesday", "Friday"], expectedWeekNumber: 2 };
      const weekFirst = validatePlan({ weekNumber: 2, schedule: [makeDay({ dayName: "fri" })] }, weekOpts);
      expect(weekFirst.ok).toBe(true);
      expect(validatePlan(weekFirst.plan, weekOpts)).toEqual(weekFirst);
      assertNoUndefined(weekFirst.plan);

      validatePlan(null);
      expect(errorSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});
