import { describe, it, expect, vi, beforeEach } from "vitest";

const callModelMock = vi.hoisted(() => vi.fn());
const getUserTokenMock = vi.hoisted(() => vi.fn(async () => "mock-id-token"));

vi.mock("../services/api/callModel", () => ({
  default: callModelMock,
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
    callModelMock.mockReset();
    getUserTokenMock.mockReset();
    getUserTokenMock.mockResolvedValue("mock-id-token");
  });

  it.each([
    { label: "empty string", value: "" },
    { label: "whitespace string", value: "   " },
    { label: "legacy empty array", value: [] },
    { label: "legacy empty and None array", value: ["", "None"] },
    { label: "canonical None", value: "None" },
    { label: "lowercase none", value: "none" },
    { label: "null", value: null },
    { label: "undefined", value: undefined },
  ])(
    'normalizes $label exclusions and priorities to "None" in profile block and DOUBLE-CHECK rules',
    async ({ value }) => {
      const mockPlan = { programName: "Starter Plan", weeks: [] };
      callModelMock.mockResolvedValueOnce(mockPlan);

      const result = await generateInitialPlan(
        makeFormData({ exclusions: value, priorities: value })
      );

      expect(result).toBe(mockPlan);
      expect(callModelMock).toHaveBeenCalledTimes(1);
      const [prompt, token] = callModelMock.mock.calls[0];
      expect(token).toBe("mock-id-token");
      expect(prompt).toContain("**EXCLUSIONS & INJURIES (CRITICAL):** None ");
      expect(prompt).toContain("**PRIORITIZE MUSCLE GROUPS:** None ");
      expect(prompt).toContain("DOUBLE-CHECK Exclusions: 'None'.");
      expect(prompt).toContain("DOUBLE-CHECK Prioritize: 'None'.");
      expect(prompt).not.toContain("DOUBLE-CHECK Prioritize: 'Any'.");
      expect(prompt).not.toContain("DOUBLE-CHECK Exclusions: ''.");
      expect(prompt).not.toContain("DOUBLE-CHECK Prioritize: ''.");
    }
  );

  it("trims non-empty string exclusions and priorities in both profile block and DOUBLE-CHECK rules", async () => {
    callModelMock.mockResolvedValueOnce({ programName: "Custom Plan", weeks: [] });

    await generateInitialPlan(
      makeFormData({
        exclusions: "  knee pain  ",
        priorities: "  legs, back  ",
      })
    );

    const [prompt] = callModelMock.mock.calls[0];
    expect(prompt).toContain("**EXCLUSIONS & INJURIES (CRITICAL):** knee pain ");
    expect(prompt).toContain("**PRIORITIZE MUSCLE GROUPS:** legs, back ");
    expect(prompt).toContain("DOUBLE-CHECK Exclusions: 'knee pain'.");
    expect(prompt).toContain("DOUBLE-CHECK Prioritize: 'legs, back'.");
  });

  it("joins legacy non-empty array exclusions and priorities in both profile block and DOUBLE-CHECK rules", async () => {
    callModelMock.mockResolvedValueOnce({ programName: "Legacy Plan", weeks: [] });

    await generateInitialPlan(
      makeFormData({
        exclusions: ["knee pain", "shoulder"],
        priorities: ["legs", "core"],
      })
    );

    const [prompt] = callModelMock.mock.calls[0];
    expect(prompt).toContain(
      "**EXCLUSIONS & INJURIES (CRITICAL):** knee pain, shoulder "
    );
    expect(prompt).toContain("**PRIORITIZE MUSCLE GROUPS:** legs, core ");
    expect(prompt).toContain(
      "DOUBLE-CHECK Exclusions: 'knee pain, shoulder'."
    );
    expect(prompt).toContain("DOUBLE-CHECK Prioritize: 'legs, core'.");
  });

  it("normalizes exclusions and priorities independently when one is empty and the other is populated", async () => {
    callModelMock.mockResolvedValueOnce({ programName: "Mixed Plan", weeks: [] });

    await generateInitialPlan(
      makeFormData({
        exclusions: [],
        priorities: "  upper body  ",
      })
    );

    const [prompt] = callModelMock.mock.calls[0];
    expect(prompt).toContain("**EXCLUSIONS & INJURIES (CRITICAL):** None ");
    expect(prompt).toContain("**PRIORITIZE MUSCLE GROUPS:** upper body ");
    expect(prompt).toContain("DOUBLE-CHECK Exclusions: 'None'.");
    expect(prompt).toContain("DOUBLE-CHECK Prioritize: 'upper body'.");
  });
});
