import { readFileSync } from "node:fs";
import { describe, it, expect, vi, beforeEach } from "vitest";

const requestInitialPlanMock = vi.hoisted(() => vi.fn());
const legacyCallModelMock = vi.hoisted(() => vi.fn());
const getUserTokenMock = vi.hoisted(() => vi.fn(async () => "mock-id-token"));

vi.mock("../services/api/callModel", () => ({
  default: legacyCallModelMock,
  requestInitialPlan: requestInitialPlanMock,
}));

vi.mock("./getUserToken", () => ({
  default: getUserTokenMock,
}));

import generateInitialPlan from "./generateInitialPlan";

function makeFormData(overrides = {}) {
  return {
    goal: "build muscle",
    level: "beginner",
    selectedDays: ["Monday", "Wednesday", "Friday"],
    equipment: "full gym",
    duration: 60,
    weeks: 6,
    exclusions: "",
    priorities: "",
    ...overrides,
  };
}

describe("generateInitialPlan", () => {
  beforeEach(() => {
    requestInitialPlanMock.mockReset();
    legacyCallModelMock.mockReset();
    getUserTokenMock.mockReset();
    getUserTokenMock.mockResolvedValue("mock-id-token");
  });

  it("delegates structured profile payload and user token to requestInitialPlan", async () => {
    const mockPlan = { programName: "Starter Plan", totalWeeks: 6, weeks: [{ weekNumber: 1, schedule: [] }] };
    requestInitialPlanMock.mockResolvedValueOnce(mockPlan);

    const result = await generateInitialPlan(
      makeFormData({ exclusions: "  knee pain  ", priorities: "  legs, back  " })
    );

    expect(result).toBe(mockPlan);
    expect(getUserTokenMock).toHaveBeenCalledTimes(1);
    expect(requestInitialPlanMock).toHaveBeenCalledTimes(1);
    expect(requestInitialPlanMock).toHaveBeenCalledWith(
      {
        goal: "build muscle",
        level: "beginner",
        selectedDays: ["Monday", "Wednesday", "Friday"],
        equipment: "full gym",
        duration: 60,
        weeks: 6,
        exclusions: "knee pain",
        priorities: "legs, back",
      },
      "mock-id-token"
    );
  });

  it.each([
    { label: "empty string", value: "", expected: "None" },
    { label: "whitespace string", value: "   ", expected: "None" },
    { label: "legacy empty array", value: [], expected: "None" },
    { label: "legacy None array", value: ["", "None"], expected: "None" },
    { label: "lowercase none", value: "none", expected: "None" },
    { label: "null", value: null, expected: "None" },
    { label: "undefined", value: undefined, expected: "None" },
    { label: "legacy populated array", value: ["knee pain", "shoulder"], expected: "knee pain, shoulder" },
  ])("normalizes $label exclusions and priorities -> $expected", async ({ value, expected }) => {
    requestInitialPlanMock.mockResolvedValueOnce({ programName: "Plan", weeks: [{ weekNumber: 1, schedule: [] }] });

    await generateInitialPlan(makeFormData({ exclusions: value, priorities: value }));

    expect(requestInitialPlanMock).toHaveBeenCalledTimes(1);
    const [payload] = requestInitialPlanMock.mock.calls[0];
    expect(payload.exclusions).toBe(expected);
    expect(payload.priorities).toBe(expected);
  });

  it("propagates errors from getUserToken and requestInitialPlan", async () => {
    getUserTokenMock.mockRejectedValueOnce(new Error("User is not authenticated"));
    await expect(generateInitialPlan(makeFormData())).rejects.toThrow("User is not authenticated");
    expect(requestInitialPlanMock).not.toHaveBeenCalled();

    requestInitialPlanMock.mockRejectedValueOnce(new Error("Invalid request payload"));
    await expect(generateInitialPlan(makeFormData())).rejects.toThrow("Invalid request payload");
  });

  it("contains zero prompt text in client source module", () => {
    const source = readFileSync(new URL("./generateInitialPlan.js", import.meta.url), "utf8");
    for (const forbidden of [
      "You are an expert fitness coach",
      "DOUBLE-CHECK Exclusions",
      "DOUBLE-CHECK Prioritize",
      "OUTPUT FORMAT",
      "STRICT, parseable JSON",
      "Use a full gym with a wide range",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
