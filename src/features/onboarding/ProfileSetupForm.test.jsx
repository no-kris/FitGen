// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
  cleanup,
} from "@testing-library/react";
import { AppContext } from "../../context/AppContext";

const generateInitialPlanMock = vi.hoisted(() => vi.fn());

vi.mock("../../utils/generateInitialPlan", () => ({
  default: generateInitialPlanMock,
}));

import ProfileSetupForm from "./ProfileSetupForm";

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createContextValue(overrides = {}) {
  return {
    handleSavePlan: vi.fn().mockResolvedValue(undefined),
    user: { uid: "u-1", email: "athlete@example.com", isAnonymous: false },
    isSynced: true,
    syncError: null,
    retrySync: vi.fn(),
    ...overrides,
  };
}

function renderSetupForm(contextOverrides = {}) {
  const contextValue = createContextValue(contextOverrides);
  const result = render(
    <AppContext.Provider value={contextValue}>
      <ProfileSetupForm />
    </AppContext.Provider>
  );
  return { ...result, contextValue };
}

function advanceSteps(count) {
  for (let i = 0; i < count; i += 1) {
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
  }
}

describe("ProfileSetupForm", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    generateInitialPlanMock.mockResolvedValue({
      programName: "Hypertrophy Program",
      weeks: [],
    });
  });

  afterEach(() => {
    cleanup();
  });

  describe("validation error rendering, clearing, and navigation (AC-5)", () => {
    it("mounts with no role=alert and no empty error container in the DOM", () => {
      const { container } = renderSetupForm();

      expect(screen.getByText("STEP 1/8")).toBeTruthy();
      expect(screen.queryByRole("alert")).toBeNull();

      const emptyDirectChildren = Array.from(container.firstChild.children).filter(
        (el) => el.children.length === 0 && el.textContent.trim() === ""
      );
      expect(emptyDirectChildren).toHaveLength(0);
    });

    it("renders role=alert on Step 3 validation failure, then clears it and advances to Step 4 after fixing", () => {
      renderSetupForm();
      advanceSteps(2);
      expect(screen.getByText("STEP 3/8")).toBeTruthy();

      // Unselect all default days (Monday, Wednesday, Friday)
      fireEvent.click(screen.getByRole("button", { name: "MONDAY" }));
      fireEvent.click(screen.getByRole("button", { name: "WEDNESDAY" }));
      fireEvent.click(screen.getByRole("button", { name: "FRIDAY" }));

      fireEvent.click(screen.getByRole("button", { name: "Next" }));

      const alert = screen.getByRole("alert");
      expect(alert.textContent).toContain("At least one day is required");
      expect(screen.getByText("STEP 3/8")).toBeTruthy();

      // Re-select Monday and proceed
      fireEvent.click(screen.getByRole("button", { name: "MONDAY" }));
      fireEvent.click(screen.getByRole("button", { name: "Next" }));

      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.queryByText("At least one day is required")).toBeNull();
      expect(screen.getByText("STEP 4/8")).toBeTruthy();
    });

    it("clears the Step 3 validation alert when clicking Back to Step 2", () => {
      renderSetupForm();
      advanceSteps(2);
      expect(screen.getByText("STEP 3/8")).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "MONDAY" }));
      fireEvent.click(screen.getByRole("button", { name: "WEDNESDAY" }));
      fireEvent.click(screen.getByRole("button", { name: "FRIDAY" }));
      fireEvent.click(screen.getByRole("button", { name: "Next" }));

      expect(screen.getByRole("alert").textContent).toContain(
        "At least one day is required"
      );

      fireEvent.click(screen.getByRole("button", { name: "Back" }));

      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.queryByText("At least one day is required")).toBeNull();
      expect(screen.getByText("STEP 2/8")).toBeTruthy();
    });
  });

  describe("exclusions and priorities string defaults (AC-6)", () => {
    it("defaults untouched Step 7 and Step 8 inputs to empty strings and submits string fields", async () => {
      const mockPlan = { programName: "Default Plan", weeks: [] };
      generateInitialPlanMock.mockResolvedValueOnce(mockPlan);
      const { contextValue } = renderSetupForm();

      advanceSteps(6);
      expect(screen.getByText("STEP 7/8")).toBeTruthy();
      const constraintsInput = screen.getByLabelText("Constraints");
      expect(constraintsInput.value).toBe("");

      advanceSteps(1);
      expect(screen.getByText("STEP 8/8")).toBeTruthy();
      const prioritiesInput = screen.getByLabelText("Priorities");
      expect(prioritiesInput.value).toBe("");

      fireEvent.click(screen.getByRole("button", { name: "INITIATE PLAN" }));

      await waitFor(() => {
        expect(contextValue.handleSavePlan).toHaveBeenCalledTimes(1);
      });

      expect(generateInitialPlanMock).toHaveBeenCalledTimes(1);
      const submittedToGenerator = generateInitialPlanMock.mock.calls[0][0];
      expect(typeof submittedToGenerator.exclusions).toBe("string");
      expect(typeof submittedToGenerator.priorities).toBe("string");
      expect(Array.isArray(submittedToGenerator.exclusions)).toBe(false);
      expect(Array.isArray(submittedToGenerator.priorities)).toBe(false);
      expect(submittedToGenerator.exclusions).toBe("");
      expect(submittedToGenerator.priorities).toBe("");

      const [savedPlan, savedProfile] = contextValue.handleSavePlan.mock.calls[0];
      expect(savedPlan).toBe(mockPlan);
      expect(typeof savedProfile.exclusions).toBe("string");
      expect(typeof savedProfile.priorities).toBe("string");
      expect(savedProfile.exclusions).toBe("");
      expect(savedProfile.priorities).toBe("");
    });

    it('sets "None" when clicking "No Constraints" and "No Priorities"', async () => {
      const { contextValue } = renderSetupForm();

      advanceSteps(6);
      fireEvent.click(screen.getByRole("button", { name: "No Constraints" }));
      expect(screen.getByLabelText("Constraints").value).toBe("None");

      advanceSteps(1);
      fireEvent.click(screen.getByRole("button", { name: "No Priorities" }));
      expect(screen.getByLabelText("Priorities").value).toBe("None");

      fireEvent.click(screen.getByRole("button", { name: "INITIATE PLAN" }));

      await waitFor(() => {
        expect(contextValue.handleSavePlan).toHaveBeenCalledTimes(1);
      });

      const submittedFormData = generateInitialPlanMock.mock.calls[0][0];
      expect(submittedFormData.exclusions).toBe("None");
      expect(submittedFormData.priorities).toBe("None");
    });

    it("submits custom typed strings for Constraints and Priorities", async () => {
      const { contextValue } = renderSetupForm();

      advanceSteps(6);
      fireEvent.change(screen.getByLabelText("Constraints"), {
        target: { value: "knee pain" },
      });

      advanceSteps(1);
      fireEvent.change(screen.getByLabelText("Priorities"), {
        target: { value: "legs, back" },
      });

      fireEvent.click(screen.getByRole("button", { name: "INITIATE PLAN" }));

      await waitFor(() => {
        expect(contextValue.handleSavePlan).toHaveBeenCalledTimes(1);
      });

      const submittedFormData = generateInitialPlanMock.mock.calls[0][0];
      expect(submittedFormData.exclusions).toBe("knee pain");
      expect(submittedFormData.priorities).toBe("legs, back");
    });
  });

  describe("async plan generation and cloud-sync states (AC-7)", () => {
    it("shows Generating... with aria-busy, disables Back and Submit, and prevents double-submit while generating or saving", async () => {
      const genDeferred = createDeferred();
      const saveDeferred = createDeferred();
      generateInitialPlanMock.mockReturnValueOnce(genDeferred.promise);
      const handleSavePlan = vi.fn(() => saveDeferred.promise);

      renderSetupForm({ handleSavePlan });
      advanceSteps(7);
      expect(screen.getByText("STEP 8/8")).toBeTruthy();

      const submitBtn = screen.getByRole("button", { name: "INITIATE PLAN" });
      fireEvent.click(submitBtn);

      // Immediate double-submit attempt must be ignored
      fireEvent.click(submitBtn);

      const generatingBtn = screen.getByRole("button", {
        name: /generating\.\.\./i,
      });
      expect(generatingBtn.disabled).toBe(true);
      expect(generatingBtn.getAttribute("aria-busy")).toBe("true");

      const backBtn = screen.getByRole("button", { name: "Back" });
      expect(backBtn.disabled).toBe(true);
      fireEvent.click(backBtn);
      expect(screen.getByText("STEP 8/8")).toBeTruthy();

      fireEvent.click(generatingBtn);
      expect(generateInitialPlanMock).toHaveBeenCalledTimes(1);

      // Resolve generation while save is still pending
      await act(async () => {
        genDeferred.resolve({ programName: "Plan A", weeks: [] });
        await genDeferred.promise;
      });

      expect(handleSavePlan).toHaveBeenCalledTimes(1);
      expect(
        screen.getByRole("button", { name: /generating\.\.\./i }).disabled
      ).toBe(true);
      expect(
        screen
          .getByRole("button", { name: /generating\.\.\./i })
          .getAttribute("aria-busy")
      ).toBe("true");
      expect(screen.getByRole("button", { name: "Back" }).disabled).toBe(true);

      // Complete save
      await act(async () => {
        saveDeferred.resolve(undefined);
        await saveDeferred.promise;
      });

      expect(generateInitialPlanMock).toHaveBeenCalledTimes(1);
      expect(handleSavePlan).toHaveBeenCalledTimes(1);
    });

    it("renders role=alert with error message and Retry button on failure, then clears stale error on Retry and succeeds", async () => {
      const retryDeferred = createDeferred();
      const mockPlan = { programName: "Recovered Plan", weeks: [] };
      generateInitialPlanMock
        .mockRejectedValueOnce(new Error("AI service unavailable"))
        .mockReturnValueOnce(retryDeferred.promise);

      const { contextValue } = renderSetupForm();
      advanceSteps(7);

      fireEvent.click(screen.getByRole("button", { name: "INITIATE PLAN" }));

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("AI service unavailable");

      const retryBtn = screen.getByRole("button", { name: "Retry" });
      expect(retryBtn.disabled).toBe(false);
      expect(screen.getByRole("button", { name: "Back" }).disabled).toBe(false);

      // Click Retry -> stale alert clears while pending and Generating... shows
      fireEvent.click(retryBtn);

      expect(screen.queryByRole("alert")).toBeNull();
      const generatingBtn = screen.getByRole("button", {
        name: /generating\.\.\./i,
      });
      expect(generatingBtn.disabled).toBe(true);
      expect(generatingBtn.getAttribute("aria-busy")).toBe("true");

      await act(async () => {
        retryDeferred.resolve(mockPlan);
        await retryDeferred.promise;
      });

      await waitFor(() => {
        expect(contextValue.handleSavePlan).toHaveBeenCalledTimes(1);
      });
      expect(contextValue.handleSavePlan).toHaveBeenCalledWith(
        mockPlan,
        expect.objectContaining({ exclusions: "", priorities: "" })
      );
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("uses fallback message when generation rejects without a message and surfaces save rejections", async () => {
      generateInitialPlanMock
        .mockRejectedValueOnce(new Error(""))
        .mockResolvedValueOnce({ programName: "Saved Fail Plan", weeks: [] });
      const handleSavePlan = vi
        .fn()
        .mockRejectedValueOnce(new Error("Firestore write failed"));

      renderSetupForm({ handleSavePlan });
      advanceSteps(7);

      fireEvent.click(screen.getByRole("button", { name: "INITIATE PLAN" }));

      const fallbackAlert = await screen.findByRole("alert");
      expect(fallbackAlert.textContent).toContain(
        "Failed to generate plan. Please try again."
      );

      fireEvent.click(screen.getByRole("button", { name: "Retry" }));

      const saveAlert = await screen.findByRole("alert");
      expect(saveAlert.textContent).toContain("Firestore write failed");
      expect(screen.getByRole("button", { name: "Retry" }).disabled).toBe(false);
    });

    it("clears generation error when clicking Back and restores INITIATE PLAN upon returning to Step 8", async () => {
      generateInitialPlanMock.mockRejectedValueOnce(
        new Error("Generation timeout")
      );

      renderSetupForm();
      advanceSteps(7);

      fireEvent.click(screen.getByRole("button", { name: "INITIATE PLAN" }));

      await screen.findByRole("alert");
      expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "Back" }));

      expect(screen.getByText("STEP 7/8")).toBeTruthy();
      expect(screen.queryByRole("alert")).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Next" }));

      expect(screen.getByText("STEP 8/8")).toBeTruthy();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByRole("button", { name: "INITIATE PLAN" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    });

    it("renders role=status when cloud sync is pending, allows Steps 1-7 navigation, and disables Step 8 submission", () => {
      renderSetupForm({
        user: { uid: "u-1", email: "athlete@example.com", isAnonymous: false },
        isSynced: false,
        syncError: null,
      });

      const status = screen.getByRole("status");
      expect(status.textContent).toContain("Syncing your cloud data...");
      expect(screen.queryByRole("alert")).toBeNull();

      // Steps 1-7 remain navigable
      advanceSteps(7);
      expect(screen.getByText("STEP 8/8")).toBeTruthy();

      const submitBtn = screen.getByRole("button", { name: "INITIATE PLAN" });
      expect(submitBtn.disabled).toBe(true);

      fireEvent.click(submitBtn);
      expect(generateInitialPlanMock).not.toHaveBeenCalled();
    });

    it("renders role=alert with Retry Sync when cloud sync fails without masking as syncing, and disables Step 8 submission", () => {
      const retrySync = vi.fn();
      renderSetupForm({
        user: { uid: "u-1", email: "athlete@example.com", isAnonymous: false },
        isSynced: false,
        syncError: new Error("Cloud connection timed out"),
        retrySync,
      });

      const alert = screen.getByRole("alert");
      expect(alert.textContent).toContain("Cloud connection timed out");
      expect(screen.queryByRole("status")).toBeNull();
      expect(screen.queryByText(/Syncing your cloud data/i)).toBeNull();

      const retrySyncBtn = screen.getByRole("button", { name: "Retry Sync" });
      fireEvent.click(retrySyncBtn);
      expect(retrySync).toHaveBeenCalledTimes(1);

      // Steps 1-7 remain navigable, Step 8 submit disabled
      advanceSteps(7);
      expect(screen.getByText("STEP 8/8")).toBeTruthy();

      const submitBtn = screen.getByRole("button", { name: "INITIATE PLAN" });
      expect(submitBtn.disabled).toBe(true);

      fireEvent.click(submitBtn);
      expect(generateInitialPlanMock).not.toHaveBeenCalled();
    });
  });
});
