import { readFileSync } from "node:fs";
import { describe, it, expect, vi, beforeEach } from "vitest";

const requestNextWeekPlanMock = vi.hoisted(() => vi.fn());
const legacyCallModelMock = vi.hoisted(() => vi.fn());
const getUserTokenMock = vi.hoisted(() => vi.fn(async () => "mock-id-token"));

vi.mock("../services/api/callModel", () => ({
  default: legacyCallModelMock,
  requestNextWeekPlan: requestNextWeekPlanMock,
}));

vi.mock("./getUserToken", () => ({
  default: getUserTokenMock,
}));

import generateNextWeekPlan from "./generateNextWeekPlan";

function makeProfile(overrides = {}) {
  return {
    goal: "build muscle",
    level: "intermediate",
    equipment: "full gym",
    selectedDays: ["Monday", "Wednesday", "Friday"],
    duration: 60,
    exclusions: "  shoulder  ",
    priorities: "",
    ...overrides,
  };
}

function makePlan(overrides = {}) {
  return {
    programName: "Hypertrophy Protocol",
    description: "Progressive overload",
    totalWeeks: 4,
    weeks: [
      {
        weekNumber: 1,
        schedule: [
          {
            dayNumber: 1,
            dayName: "Monday",
            focus: "Push",
            exercises: [
              {
                name: "Bench Press",
                sets: 3,
                reps: "8-12",
                rest: "90s",
                alternatives: ["DB Press"],
              },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("generateNextWeekPlan", () => {
  beforeEach(() => {
    requestNextWeekPlanMock.mockReset();
    legacyCallModelMock.mockReset();
    getUserTokenMock.mockReset();
    getUserTokenMock.mockResolvedValue("mock-id-token");
  });

  it("sends lean structured payload with normalized profile, lastWeek, last 10 workouts, and feedback", async () => {
    const generated = {
      programName: "Hypertrophy Protocol",
      weeks: [{ weekNumber: 2, description: "Week 2", coachNotes: "Added volume", schedule: [] }],
    };
    requestNextWeekPlanMock.mockResolvedValueOnce(generated);

    const history = Array.from({ length: 12 }, (_, idx) => ({
      id: `w-${idx + 1}`,
      focus: `Focus ${idx + 1}`,
      logs: [{ name: "Bench Press", sets: [] }],
      duration: 2400,
    }));

    const result = await generateNextWeekPlan(makeProfile(), makePlan(), history, "Felt strong");

    expect(result).toBe(generated);
    expect(requestNextWeekPlanMock).toHaveBeenCalledTimes(1);
    const [payload, token] = requestNextWeekPlanMock.mock.calls[0];
    expect(token).toBe("mock-id-token");
    expect(payload).toEqual({
      profile: {
        goal: "build muscle",
        level: "intermediate",
        equipment: "full gym",
        selectedDays: ["Monday", "Wednesday", "Friday"],
        duration: 60,
        exclusions: "shoulder",
        priorities: "None",
      },
      programName: "Hypertrophy Protocol",
      lastWeek: {
        weekNumber: 1,
        schedule: [
          {
            dayNumber: 1,
            dayName: "Monday",
            focus: "Push",
            exercises: [{ name: "Bench Press" }],
          },
        ],
      },
      recentWorkouts: history.slice(-10),
      feedback: "Felt strong",
    });
  });

  it("excludes legacy sessionDuration alias and omits duration when undefined", async () => {
    requestNextWeekPlanMock.mockResolvedValueOnce({ weeks: [{ weekNumber: 2, schedule: [] }] });
    const legacyKey = ["session", "Duration"].join("");
    const profile = makeProfile();
    delete profile.duration;
    profile[legacyKey] = 45;

    await generateNextWeekPlan(profile, makePlan({ programName: null }), null, undefined);

    expect(requestNextWeekPlanMock).toHaveBeenCalledTimes(1);
    const [payload] = requestNextWeekPlanMock.mock.calls[0];
    expect("duration" in payload.profile).toBe(false);
    expect(legacyKey in payload.profile).toBe(false);
    expect(payload.programName).toBe("");
    expect(payload.recentWorkouts).toEqual([]);
    expect(payload.feedback).toBe("");
  });

  it("throws before fetching token when plan or plan.weeks is missing or empty", async () => {
    for (const badPlan of [null, undefined, {}, { weeks: [] }]) {
      await expect(generateNextWeekPlan(makeProfile(), badPlan, [], "")).rejects.toThrow(
        "Cannot generate next week without an existing plan"
      );
    }
    expect(getUserTokenMock).not.toHaveBeenCalled();
    expect(requestNextWeekPlanMock).not.toHaveBeenCalled();
  });

  it("rejects invalid server responses and propagates API errors", async () => {
    for (const badResponse of [null, {}, { weeks: [] }, { weekNumber: 2, schedule: [] }]) {
      requestNextWeekPlanMock.mockResolvedValueOnce(badResponse);
      await expect(generateNextWeekPlan(makeProfile(), makePlan(), [], "")).rejects.toThrow(
        "Failed to generate valid plan data"
      );
    }

    requestNextWeekPlanMock.mockRejectedValueOnce(new Error("AI provider request timed out"));
    await expect(generateNextWeekPlan(makeProfile(), makePlan(), [], "")).rejects.toThrow(
      "AI provider request timed out"
    );
  });

  it("contains zero prompt text in client source module", () => {
    const source = readFileSync(new URL("./generateNextWeekPlan.js", import.meta.url), "utf8");
    for (const forbidden of [
      "You are an expert fitness coach",
      "OUTPUT FORMAT",
      "STRICT, parseable JSON",
      "Adjust volume to fit",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
