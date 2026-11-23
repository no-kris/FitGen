// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  within,
  waitFor,
  act,
  cleanup,
} from "@testing-library/react";
import { AppContext } from "../../context/AppContext";

const firestoreServiceMock = vi.hoisted(() => ({
  addWorkout: vi.fn(),
  saveUserData: vi.fn(),
  getWorkouts: vi.fn(),
  getUserData: vi.fn(),
  migrateLegacyHistory: vi.fn(),
  clearUserData: vi.fn(),
}));

vi.mock("../../services/firebase/firestoreServices", () => ({
  firestoreService: firestoreServiceMock,
}));

vi.mock("@capacitor/haptics", () => ({
  Haptics: { vibrate: vi.fn() },
}));

vi.mock("@capacitor-community/keep-awake", () => ({
  KeepAwake: {
    keepAwake: vi.fn(),
    allowSleep: vi.fn(),
  },
}));

import ActiveWorkout from "./ActiveWorkout";

const ACTIVE_KEY = "fitgen:active:v1";

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeWorkoutDay() {
  return {
    weekNumber: 1,
    dayNumber: 1,
    dayName: "Monday",
    focus: "Push",
    exercises: [
      {
        name: "Bench Press",
        sets: 2,
        reps: "8-10",
        rest: "90s",
      },
    ],
  };
}

function renderActiveWorkout(overrides = {}) {
  let userDataState = overrides.userData ?? {
    profile: { goal: "strength" },
    plan: { programName: "PPL", totalWeeks: 4, weeks: [] },
    history: [],
  };
  const setUserData = vi.fn((updater) => {
    userDataState =
      typeof updater === "function" ? updater(userDataState) : updater;
  });
  const setView = vi.fn();
  const setActiveWorkout = vi.fn();

  const contextValue = {
    user: "user" in overrides ? overrides.user : { uid: "user-1" },
    isSynced: "isSynced" in overrides ? overrides.isSynced : true,
    syncError: null,
    activeWorkout: overrides.activeWorkout ?? makeWorkoutDay(),
    userData: userDataState,
    setUserData,
    setView,
    setActiveWorkout,
  };

  const utils = render(
    <AppContext.Provider value={contextValue}>
      <ActiveWorkout />
    </AppContext.Provider>
  );

  return {
    ...utils,
    setUserData,
    setView,
    setActiveWorkout,
    getUserData: () => userDataState,
  };
}

describe("ActiveWorkout", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("disables Finish with aria-busy and spinner while saving, then clears storage and navigates on resolve", async () => {
    const saveDeferred = createDeferred();
    firestoreServiceMock.addWorkout.mockReturnValueOnce(saveDeferred.promise);

    const { setView, setActiveWorkout, getUserData } = renderActiveWorkout();

    const exitBtn = screen.getByRole("button", { name: /exit workout/i });
    expect(exitBtn.disabled).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /^finish$/i }));

    const dialog = screen.getByRole("dialog");
    const confirmFinishBtn = within(dialog).getByRole("button", {
      name: /^finish$/i,
    });

    fireEvent.click(confirmFinishBtn);

    await waitFor(() => {
      const savingBtn = within(dialog).getByRole("button", {
        name: /saving/i,
      });
      expect(savingBtn.disabled).toBe(true);
      expect(savingBtn.getAttribute("aria-busy")).toBe("true");
      expect(savingBtn.querySelector("svg")).not.toBeNull();
    });

    expect(exitBtn.disabled).toBe(true);
    expect(setView).not.toHaveBeenCalled();
    expect(setActiveWorkout).not.toHaveBeenCalled();

    const savedEntry = {
      id: "workout-1",
      weekNumber: 1,
      dayNumber: 1,
      dayName: "Monday",
      focus: "Push",
      logs: [],
      duration: 0,
      completedAt: "2026-11-23T10:00:00.000Z",
    };

    await act(async () => {
      saveDeferred.resolve(savedEntry);
      await saveDeferred.promise;
    });

    await waitFor(() => {
      expect(setView).toHaveBeenCalledWith("logs");
    });

    expect(setActiveWorkout).toHaveBeenCalledWith(null);
    expect(getUserData().history).toEqual([savedEntry]);
    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull();
  });

  it("ignores rapid double-tap on Finish so addWorkout is called only once", async () => {
    const saveDeferred = createDeferred();
    firestoreServiceMock.addWorkout.mockReturnValueOnce(saveDeferred.promise);

    renderActiveWorkout();

    fireEvent.click(screen.getByRole("button", { name: /^finish$/i }));
    const dialog = screen.getByRole("dialog");
    const confirmFinishBtn = within(dialog).getByRole("button", {
      name: /^finish$/i,
    });

    // Two synchronous clicks before React re-renders
    fireEvent.click(confirmFinishBtn);
    fireEvent.click(confirmFinishBtn);

    expect(firestoreServiceMock.addWorkout).toHaveBeenCalledTimes(1);

    await act(async () => {
      saveDeferred.resolve({
        id: "workout-once",
        weekNumber: 1,
        dayNumber: 1,
        dayName: "Monday",
        focus: "Push",
        logs: [],
        duration: 0,
        completedAt: "2026-11-23T10:00:00.000Z",
      });
      await saveDeferred.promise;
    });
  });

  it("keeps workout intact and displays role=alert with Retry on failure, succeeding when retried", async () => {
    firestoreServiceMock.addWorkout
      .mockRejectedValueOnce(new Error("Offline write failed"))
      .mockResolvedValueOnce({
        id: "workout-retried",
        weekNumber: 1,
        dayNumber: 1,
        dayName: "Monday",
        focus: "Push",
        logs: [],
        duration: 0,
        completedAt: "2026-11-23T10:05:00.000Z",
      });

    const { setView, setActiveWorkout, getUserData } = renderActiveWorkout();

    expect(localStorage.getItem(ACTIVE_KEY)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^finish$/i }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^finish$/i }));

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toContain("Offline write failed");
    });

    expect(localStorage.getItem(ACTIVE_KEY)).not.toBeNull();
    expect(setView).not.toHaveBeenCalled();
    expect(setActiveWorkout).not.toHaveBeenCalled();

    const retryBtn = within(dialog).getByRole("button", { name: /retry/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(setView).toHaveBeenCalledWith("logs");
    });

    expect(firestoreServiceMock.addWorkout).toHaveBeenCalledTimes(2);
    expect(setActiveWorkout).toHaveBeenCalledWith(null);
    expect(getUserData().history).toHaveLength(1);
    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull();
  });

  it("does not re-save paused workout on timer tick after a successful finish", async () => {
    vi.useFakeTimers();
    firestoreServiceMock.addWorkout.mockResolvedValueOnce({
      id: "workout-clean",
      weekNumber: 1,
      dayNumber: 1,
      dayName: "Monday",
      focus: "Push",
      logs: [],
      duration: 0,
      completedAt: "2026-11-23T10:10:00.000Z",
    });

    renderActiveWorkout();

    fireEvent.click(screen.getByRole("button", { name: /^finish$/i }));
    const dialog = screen.getByRole("dialog");
    await act(async () => {
      fireEvent.click(
        within(dialog).getByRole("button", { name: /^finish$/i })
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull();
  });
});
