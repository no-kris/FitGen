import { describe, it, expect, vi } from "vitest";
import handleNextStep from "./handleNextStep";

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

describe("handleNextStep", () => {
  describe("invalid steps", () => {
    it.each([
      {
        step: 1,
        overrides: { goal: "" },
        expectedError: { goal: "Goal is required" },
        label: "empty goal",
      },
      {
        step: 1,
        overrides: { goal: null },
        expectedError: { goal: "Goal is required" },
        label: "null goal",
      },
      {
        step: 2,
        overrides: { level: "" },
        expectedError: { level: "Level is required" },
        label: "empty level",
      },
      {
        step: 3,
        overrides: { selectedDays: [] },
        expectedError: { selectedDays: "At least one day is required" },
        label: "empty selectedDays array",
      },
      {
        step: 3,
        overrides: { selectedDays: null },
        expectedError: { selectedDays: "At least one day is required" },
        label: "null selectedDays",
      },
      {
        step: 3,
        overrides: { selectedDays: undefined },
        expectedError: { selectedDays: "At least one day is required" },
        label: "undefined selectedDays",
      },
      {
        step: 3,
        overrides: { selectedDays: "Monday" },
        expectedError: { selectedDays: "At least one day is required" },
        label: "non-array selectedDays",
      },
      {
        step: 4,
        overrides: { equipment: "" },
        expectedError: { equipment: "Equipment is required" },
        label: "empty equipment",
      },
      {
        step: 5,
        overrides: { duration: 0 },
        expectedError: { duration: "Duration is required" },
        label: "zero duration",
      },
      {
        step: 5,
        overrides: { duration: -15 },
        expectedError: { duration: "Duration is required" },
        label: "negative duration",
      },
      {
        step: 5,
        overrides: { duration: null },
        expectedError: { duration: "Duration is required" },
        label: "null duration",
      },
      {
        step: 6,
        overrides: { weeks: 0 },
        expectedError: { weeks: "Weeks is required" },
        label: "zero weeks",
      },
      {
        step: 6,
        overrides: { weeks: -2 },
        expectedError: { weeks: "Weeks is required" },
        label: "negative weeks",
      },
      {
        step: 6,
        overrides: { weeks: undefined },
        expectedError: { weeks: "Weeks is required" },
        label: "undefined weeks",
      },
    ])(
      "step $step rejects $label with exact error and does not advance step",
      ({ step, overrides, expectedError }) => {
        const setStep = vi.fn();
        const setErrors = vi.fn();

        handleNextStep(step, 8, setStep, makeFormData(overrides), setErrors);

        expect(setErrors).toHaveBeenCalledTimes(1);
        expect(setErrors).toHaveBeenCalledWith(expectedError);
        expect(setStep).not.toHaveBeenCalled();
      }
    );
  });

  describe("valid steps", () => {
    it.each([1, 2, 3, 4, 5, 6, 7])(
      "step %i clears errors before advancing and clamps to totalSteps",
      (step) => {
        const setStep = vi.fn();
        const setErrors = vi.fn();

        handleNextStep(step, 8, setStep, makeFormData(), setErrors);

        expect(setErrors).toHaveBeenCalledTimes(1);
        expect(setErrors).toHaveBeenCalledWith({});
        expect(setStep).toHaveBeenCalledTimes(1);
        expect(setErrors.mock.invocationCallOrder[0]).toBeLessThan(
          setStep.mock.invocationCallOrder[0]
        );

        const updater = setStep.mock.calls[0][0];
        expect(updater).toBeTypeOf("function");
        expect(updater(step)).toBe(Math.min(8, step + 1));
        expect(updater(8)).toBe(8);
      }
    );

    it("allows Step 7 to proceed with empty string exclusions and clears errors", () => {
      const setStep = vi.fn();
      const setErrors = vi.fn();

      handleNextStep(7, 8, setStep, makeFormData({ exclusions: "" }), setErrors);

      expect(setErrors).toHaveBeenCalledWith({});
      expect(setStep).toHaveBeenCalledTimes(1);
      const updater = setStep.mock.calls[0][0];
      expect(updater(7)).toBe(8);
    });
  });
});
