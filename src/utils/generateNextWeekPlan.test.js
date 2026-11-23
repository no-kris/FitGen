import { describe, it, expect, vi, beforeEach } from "vitest";

const callModelMock = vi.hoisted(() => vi.fn());
const getUserTokenMock = vi.hoisted(() => vi.fn(async () => "mock-id-token"));

vi.mock("../services/api/callModel", () => ({
  default: callModelMock,
}));

vi.mock("./getUserToken", () => ({
  default: getUserTokenMock,
}));

import generateNextWeekPlan from "./generateNextWeekPlan";

function makeProfile() {
  return {
    goal: "build muscle",
    level: "intermediate",
    equipment: "full gym",
    selectedDays: ["Monday", "Wednesday", "Friday"],
    sessionDuration: 60,
  };
}

function makePlan() {
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
            exercises: [{ name: "Bench Press" }],
          },
        ],
      },
    ],
  };
}

describe("generateNextWeekPlan", () => {
  beforeEach(() => {
    callModelMock.mockReset();
    getUserTokenMock.mockReset();
    getUserTokenMock.mockResolvedValue("mock-id-token");
  });

  it("builds recent history summary from flat workout entries without throwing", async () => {
    const generatedWeek = {
      weekNumber: 2,
      description: "Week 2",
      coachNotes: "Added volume",
      schedule: [],
    };
    callModelMock.mockResolvedValueOnce({
      programName: "Hypertrophy Protocol",
      description: "Week 2 progression",
      weeks: [generatedWeek],
    });

    const flatHistory = [
      {
        id: "w-1",
        weekNumber: 1,
        dayNumber: 1,
        dayName: "Monday",
        focus: "Push",
        logs: [{ name: "Bench Press", sets: [] }, { name: "Dips", sets: [] }],
        duration: 2700,
        completedAt: "2026-11-20T10:00:00.000Z",
      },
    ];

    const result = await generateNextWeekPlan(
      makeProfile(),
      makePlan(),
      flatHistory,
      "Felt strong"
    );

    expect(result.weeks).toEqual([generatedWeek]);
    expect(callModelMock).toHaveBeenCalledTimes(1);
    const [prompt, token] = callModelMock.mock.calls[0];
    expect(token).toBe("mock-id-token");
    expect(prompt).toContain(
      "Push: 2 exercises completed. Duration: 45 minutes."
    );
  });

  it("supports legacy nested workout entries and missing fields gracefully", async () => {
    const generatedWeek = { weekNumber: 2, schedule: [] };
    callModelMock.mockResolvedValueOnce(generatedWeek);

    const mixedHistory = [
      {
        workout: { focus: "Pull" },
        logs: [{ name: "Row", sets: [] }],
        duration: 1800,
      },
      {
        id: "w-incomplete",
        logs: null,
      },
    ];

    const result = await generateNextWeekPlan(
      makeProfile(),
      makePlan(),
      mixedHistory,
      ""
    );

    expect(result).toEqual({ weeks: [generatedWeek] });
    const [prompt] = callModelMock.mock.calls[0];
    expect(prompt).toContain(
      "Pull: 1 exercises completed. Duration: 30 minutes."
    );
    expect(prompt).toContain(
      "Workout: 0 exercises completed. Duration: 0 minutes."
    );
  });

  it("throws when the model returns invalid plan data", async () => {
    callModelMock.mockResolvedValueOnce({ unexpected: true });

    await expect(
      generateNextWeekPlan(makeProfile(), makePlan(), [], "")
    ).rejects.toThrow("Failed to generate valid plan data");
  });
});
