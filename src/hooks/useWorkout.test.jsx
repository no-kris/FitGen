// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { AppContext } from "../context/AppContext";

const firestoreServiceMock = vi.hoisted(() => ({
  saveUserData: vi.fn(),
  addWorkout: vi.fn(),
  getWorkouts: vi.fn(),
  getUserData: vi.fn(),
  migrateLegacyHistory: vi.fn(),
  clearUserData: vi.fn(),
}));

const generateNextWeekPlanMock = vi.hoisted(() => vi.fn());

vi.mock("../services/firebase/firestoreServices", () => ({
  firestoreService: firestoreServiceMock,
}));

vi.mock("../utils/generateNextWeekPlan", () => ({
  default: generateNextWeekPlanMock,
}));

import { useWorkout } from "./useWorkout";

const ACTIVE_KEY = "fitgen:active:v1";
const LEGACY_ACTIVE_KEY = "fitgen-active";
const SYNC_PENDING_ERROR =
  "Still syncing your data from the cloud. Please try again in a moment.";

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makePlan() {
  return {
    programName: "Alpha Strength",
    description: "4-week linear progression",
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
                reps: "8-10",
                rest: "90s",
                alternatives: ["Dumbbell Press", "Push-ups"],
              },
              {
                name: "Overhead Press",
                sets: 3,
                reps: "8-10",
                rest: "90s",
              },
            ],
          },
          {
            dayNumber: 2,
            dayName: "Wednesday",
            focus: "Pull",
            exercises: [
              {
                name: "Barbell Row",
                sets: 3,
                reps: "8-10",
                rest: "90s",
                alternatives: ["Cable Row"],
              },
            ],
          },
        ],
      },
    ],
  };
}

function renderUseWorkout(overrides = {}) {
  let userDataState = overrides.userData ?? {
    profile: { goal: "strength", selectedDays: ["Monday", "Wednesday"] },
    plan: makePlan(),
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
    userData: userDataState,
    setUserData,
    setView,
    setActiveWorkout,
  };

  const wrapper = ({ children }) => (
    <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>
  );

  const hook = renderHook(() => useWorkout(), { wrapper });
  return {
    ...hook,
    setUserData,
    setView,
    setActiveWorkout,
    getUserData: () => userDataState,
  };
}

describe("useWorkout", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  describe("sync guard when user is signed in and isSynced is false", () => {
    it("rejects handleFinishWorkout without writing to Firestore or clearing state", async () => {
      localStorage.setItem(
        ACTIVE_KEY,
        JSON.stringify({
          weekNumber: 1,
          dayNumber: 1,
          dayName: "Monday",
          focus: "Push",
          workout: { weekNumber: 1, dayNumber: 1, dayName: "Monday" },
          logs: [],
          elapsed: 120,
        })
      );

      const { result, setUserData, setActiveWorkout, setView } =
        renderUseWorkout({ isSynced: false });

      await expect(
        Promise.resolve().then(() =>
          result.current.handleFinishWorkout({
            workout: {
              weekNumber: 1,
              dayNumber: 1,
              dayName: "Monday",
              focus: "Push",
            },
            logs: [],
            duration: 120,
          })
        )
      ).rejects.toThrow(SYNC_PENDING_ERROR);

      expect(firestoreServiceMock.addWorkout).not.toHaveBeenCalled();
      expect(firestoreServiceMock.saveUserData).not.toHaveBeenCalled();
      expect(setUserData).not.toHaveBeenCalled();
      expect(setActiveWorkout).not.toHaveBeenCalled();
      expect(setView).not.toHaveBeenCalled();
      expect(localStorage.getItem(ACTIVE_KEY)).not.toBeNull();
    });

    it("rejects handleGenerateNextWeek without calling model or Firestore", async () => {
      const { result, setUserData, setView } = renderUseWorkout({
        isSynced: false,
      });

      await expect(
        Promise.resolve().then(() =>
          result.current.handleGenerateNextWeek("Felt great")
        )
      ).rejects.toThrow(SYNC_PENDING_ERROR);

      expect(generateNextWeekPlanMock).not.toHaveBeenCalled();
      expect(firestoreServiceMock.saveUserData).not.toHaveBeenCalled();
      expect(setUserData).not.toHaveBeenCalled();
      expect(setView).not.toHaveBeenCalled();
    });

    it("rejects handleReplaceExercise without writing to Firestore or mutating state", async () => {
      const { result, setUserData } = renderUseWorkout({ isSynced: false });

      await expect(
        Promise.resolve().then(() =>
          result.current.handleReplaceExercise(0, 0, 0, "Dumbbell Press")
        )
      ).rejects.toThrow(SYNC_PENDING_ERROR);

      expect(firestoreServiceMock.saveUserData).not.toHaveBeenCalled();
      expect(setUserData).not.toHaveBeenCalled();
    });
  });

  describe("handleGenerateNextWeek", () => {
    it("falls back to previous plan programName and description, awaits saveUserData, and switches to plan view", async () => {
      const saveDeferred = createDeferred();
      firestoreServiceMock.saveUserData.mockReturnValueOnce(
        saveDeferred.promise
      );
      const nextWeek = {
        weekNumber: 2,
        description: "Week 2",
        coachNotes: "Progress weight",
        schedule: [],
      };
      generateNextWeekPlanMock.mockResolvedValueOnce({
        weeks: [nextWeek],
      });

      const { result, setView, getUserData } = renderUseWorkout();

      const pending = result.current.handleGenerateNextWeek("Good week");

      await act(async () => {
        await Promise.resolve();
      });
      expect(setView).not.toHaveBeenCalled();

      saveDeferred.resolve(undefined);
      const savedPlan = await pending;

      expect(firestoreServiceMock.saveUserData).toHaveBeenCalledWith("user-1", {
        plan: expect.objectContaining({
          programName: "Alpha Strength",
          description: "4-week linear progression",
          weeks: expect.arrayContaining([nextWeek]),
        }),
      });
      expect(savedPlan.programName).toBe("Alpha Strength");
      expect(savedPlan.description).toBe("4-week linear progression");
      expect(getUserData().plan.weeks).toHaveLength(2);
      expect(setView).toHaveBeenCalledWith("plan");
    });

    it("rethrows errors from saveUserData instead of swallowing them", async () => {
      generateNextWeekPlanMock.mockResolvedValueOnce({
        programName: "Alpha Strength",
        description: "Week 2",
        weeks: [{ weekNumber: 2, schedule: [] }],
      });
      firestoreServiceMock.saveUserData.mockRejectedValueOnce(
        new Error("Write rejected")
      );

      const { result, setUserData, setView } = renderUseWorkout();

      await expect(
        result.current.handleGenerateNextWeek("Sore shoulder")
      ).rejects.toThrow("Write rejected");

      expect(setUserData).not.toHaveBeenCalled();
      expect(setView).not.toHaveBeenCalled();
    });
  });

  describe("handleReplaceExercise", () => {
    it("immutably updates exercise and alternatives (even when missing), awaits saveUserData, and rethrows on failure", async () => {
      const initialPlan = makePlan();
      firestoreServiceMock.saveUserData.mockResolvedValueOnce(undefined);

      const { result, getUserData } = renderUseWorkout({
        userData: {
          profile: { goal: "strength" },
          plan: initialPlan,
          history: [],
        },
      });

      const updatedPlan = await result.current.handleReplaceExercise(
        0,
        0,
        1,
        "Arnold Press"
      );

      expect(firestoreServiceMock.saveUserData).toHaveBeenCalledTimes(1);
      expect(
        updatedPlan.weeks[0].schedule[0].exercises[1].name
      ).toBe("Arnold Press");
      expect(
        updatedPlan.weeks[0].schedule[0].exercises[1].alternatives
      ).toEqual(["Overhead Press"]);
      expect(
        initialPlan.weeks[0].schedule[0].exercises[1].name
      ).toBe("Overhead Press");
      expect(getUserData().plan).toBe(updatedPlan);

      firestoreServiceMock.saveUserData.mockRejectedValueOnce(
        new Error("Save failed")
      );
      await expect(
        result.current.handleReplaceExercise(0, 0, 0, "Dumbbell Press")
      ).rejects.toThrow("Save failed");
    });
  });

  describe("handleFinishWorkout", () => {
    it("saves lean workout via addWorkout, updates history, clears storage, and navigates to logs only after resolve", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-11-23T10:15:00.000Z"));

      localStorage.setItem(ACTIVE_KEY, JSON.stringify({ weekNumber: 1 }));
      localStorage.setItem(LEGACY_ACTIVE_KEY, JSON.stringify({ old: true }));

      const addDeferred = createDeferred();
      firestoreServiceMock.addWorkout.mockReturnValueOnce(addDeferred.promise);

      const { result, setActiveWorkout, setView, getUserData } =
        renderUseWorkout();

      const finishPromise = result.current.handleFinishWorkout({
        workout: {
          weekNumber: 1,
          dayNumber: 1,
          dayName: "Monday",
          focus: "Push",
          exercises: [{ name: "Bench Press" }],
        },
        logs: [
          {
            name: "Bench Press",
            sets: [{ weight: "135", reps: "10", completed: true }],
          },
        ],
        duration: 1800,
      });

      expect(firestoreServiceMock.addWorkout).toHaveBeenCalledTimes(1);
      expect(firestoreServiceMock.addWorkout).toHaveBeenCalledWith("user-1", {
        weekNumber: 1,
        dayNumber: 1,
        dayName: "Monday",
        focus: "Push",
        logs: [
          {
            name: "Bench Press",
            sets: [{ weight: "135", reps: "10", completed: true }],
          },
        ],
        duration: 1800,
        completedAt: "2026-11-23T10:15:00.000Z",
      });
      expect(firestoreServiceMock.saveUserData).not.toHaveBeenCalled();
      expect(setActiveWorkout).not.toHaveBeenCalled();
      expect(setView).not.toHaveBeenCalled();
      expect(localStorage.getItem(ACTIVE_KEY)).not.toBeNull();

      const savedDoc = {
        id: "doc-abc",
        weekNumber: 1,
        dayNumber: 1,
        dayName: "Monday",
        focus: "Push",
        logs: [
          {
            name: "Bench Press",
            sets: [{ weight: "135", reps: "10", completed: true }],
          },
        ],
        duration: 1800,
        completedAt: "2026-11-23T10:15:00.000Z",
      };
      addDeferred.resolve(savedDoc);

      const returned = await finishPromise;

      expect(returned).toEqual(savedDoc);
      expect(getUserData().history).toEqual([savedDoc]);
      expect(localStorage.getItem(ACTIVE_KEY)).toBeNull();
      expect(localStorage.getItem(LEGACY_ACTIVE_KEY)).toBeNull();
      expect(setActiveWorkout).toHaveBeenCalledWith(null);
      expect(setView).toHaveBeenCalledWith("logs");
    });

    it("guards against concurrent double-finish calls synchronously so addWorkout runs once", async () => {
      const addDeferred = createDeferred();
      firestoreServiceMock.addWorkout.mockReturnValueOnce(addDeferred.promise);

      const { result } = renderUseWorkout();
      const logArg = {
        workout: {
          weekNumber: 1,
          dayNumber: 1,
          dayName: "Monday",
          focus: "Push",
        },
        logs: [],
        duration: 900,
      };

      const firstCall = result.current.handleFinishWorkout(logArg);
      const secondCall = result.current.handleFinishWorkout(logArg);

      expect(firestoreServiceMock.addWorkout).toHaveBeenCalledTimes(1);
      await expect(secondCall).resolves.toBeNull();

      addDeferred.resolve({
        id: "w-1",
        weekNumber: 1,
        dayNumber: 1,
        dayName: "Monday",
        focus: "Push",
        logs: [],
        duration: 900,
        completedAt: "2026-11-23T10:00:00.000Z",
      });
      await firstCall;
    });

    it("preserves active workout, storage, history, and view on save failure and allows retry", async () => {
      localStorage.setItem(
        ACTIVE_KEY,
        JSON.stringify({
          weekNumber: 1,
          dayNumber: 1,
          dayName: "Monday",
          focus: "Push",
          workout: { weekNumber: 1, dayNumber: 1, dayName: "Monday" },
          logs: [],
          elapsed: 600,
        })
      );

      firestoreServiceMock.addWorkout
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({
          id: "w-retry",
          weekNumber: 1,
          dayNumber: 1,
          dayName: "Monday",
          focus: "Push",
          logs: [],
          duration: 600,
          completedAt: "2026-11-23T11:00:00.000Z",
        });

      const { result, setUserData, setActiveWorkout, setView, getUserData } =
        renderUseWorkout();
      const logArg = {
        workout: {
          weekNumber: 1,
          dayNumber: 1,
          dayName: "Monday",
          focus: "Push",
        },
        logs: [],
        duration: 600,
      };

      await expect(
        Promise.resolve().then(() => result.current.handleFinishWorkout(logArg))
      ).rejects.toThrow("Network error");

      expect(localStorage.getItem(ACTIVE_KEY)).not.toBeNull();
      expect(setUserData).not.toHaveBeenCalled();
      expect(setActiveWorkout).not.toHaveBeenCalled();
      expect(setView).not.toHaveBeenCalled();

      const retryResult = await result.current.handleFinishWorkout(logArg);
      expect(retryResult.id).toBe("w-retry");
      expect(getUserData().history).toHaveLength(1);
      expect(localStorage.getItem(ACTIVE_KEY)).toBeNull();
      expect(setActiveWorkout).toHaveBeenCalledWith(null);
      expect(setView).toHaveBeenCalledWith("logs");
    });
  });

  describe("paused workout day-matching and conflict handlers", () => {
    it("starts fresh when no paused workout exists", () => {
      const { result, setActiveWorkout, setView } = renderUseWorkout();
      const monday = {
        weekNumber: 1,
        dayNumber: 1,
        dayName: "Monday",
        focus: "Push",
        exercises: [{ name: "Bench Press", sets: 3, reps: "10", rest: "90s" }],
      };

      const outcome = result.current.handleStartWorkout(monday);

      expect(outcome).toEqual({ status: "started" });
      expect(setActiveWorkout).toHaveBeenCalledWith(monday);
      expect(setView).toHaveBeenCalledWith("active");
    });

    it("resumes saved logs and elapsed time when starting the same weekNumber and dayNumber", () => {
      const savedLogs = [
        {
          name: "Old Bench Name",
          sets: [{ weight: "135", reps: "10", completed: true }],
        },
      ];
      localStorage.setItem(
        ACTIVE_KEY,
        JSON.stringify({
          weekNumber: 1,
          dayNumber: 1,
          dayName: "Monday",
          focus: "Push",
          workout: { weekNumber: 1, dayNumber: 1, dayName: "Monday" },
          logs: savedLogs,
          elapsed: 480,
        })
      );

      const { result, setActiveWorkout, setView } = renderUseWorkout();
      const monday = {
        weekNumber: 1,
        dayNumber: 1,
        dayName: "Monday",
        focus: "Push",
        exercises: [
          { name: "Incline Bench Press", sets: 3, reps: "10", rest: "90s" },
          { name: "Dips", sets: 2, reps: "12", rest: "60s" },
        ],
      };

      const outcome = result.current.handleStartWorkout(monday);

      expect(outcome).toEqual({ status: "resumed" });
      expect(setView).toHaveBeenCalledWith("active");
      expect(setActiveWorkout).toHaveBeenCalledWith(
        expect.objectContaining({
          weekNumber: 1,
          dayNumber: 1,
          dayName: "Monday",
          elapsed: 480,
          logs: expect.arrayContaining([
            expect.objectContaining({
              name: "Incline Bench Press",
              sets: [{ weight: "135", reps: "10", completed: true }],
            }),
            expect.objectContaining({
              name: "Dips",
              sets: expect.any(Array),
            }),
          ]),
        })
      );
    });

    it("tolerates missing parsed.logs on same-day resume without throwing and resumes elapsed time", () => {
      localStorage.setItem(
        ACTIVE_KEY,
        JSON.stringify({
          weekNumber: 1,
          dayNumber: 1,
          dayName: "Monday",
          focus: "Push",
          workout: { weekNumber: 1, dayNumber: 1, dayName: "Monday" },
          elapsed: 320,
        })
      );

      const { result, setActiveWorkout, setView } = renderUseWorkout();
      const monday = {
        weekNumber: 1,
        dayNumber: 1,
        dayName: "Monday",
        focus: "Push",
        exercises: [{ name: "Bench Press", sets: 3, reps: "10", rest: "90s" }],
      };

      let outcome;
      expect(() => {
        outcome = result.current.handleStartWorkout(monday);
      }).not.toThrow();

      expect(outcome).toEqual({ status: "resumed" });
      expect(setView).toHaveBeenCalledWith("active");
      const activeArg = setActiveWorkout.mock.calls[0][0];
      expect(activeArg.elapsed).toBe(320);
      expect(activeArg.logs).toBeUndefined();
    });

    it("returns conflict without mixing sets when starting a different day than the paused workout", () => {
      const mondaySaved = {
        weekNumber: 1,
        dayNumber: 1,
        dayName: "Monday",
        focus: "Push",
        workout: {
          weekNumber: 1,
          dayNumber: 1,
          dayName: "Monday",
          focus: "Push",
          exercises: [{ name: "Bench Press", sets: 3, reps: "10", rest: "90s" }],
        },
        logs: [
          {
            name: "Bench Press",
            sets: [{ weight: "185", reps: "8", completed: true }],
          },
        ],
        elapsed: 500,
      };
      localStorage.setItem(ACTIVE_KEY, JSON.stringify(mondaySaved));

      const { result, setActiveWorkout, setView } = renderUseWorkout();
      const wednesday = {
        weekNumber: 1,
        dayNumber: 2,
        dayName: "Wednesday",
        focus: "Pull",
        exercises: [{ name: "Barbell Row", sets: 3, reps: "10", rest: "90s" }],
      };

      const outcome = result.current.handleStartWorkout(wednesday);

      expect(outcome).toEqual({
        status: "conflict",
        pausedWorkout: expect.objectContaining({
          weekNumber: 1,
          dayNumber: 1,
          dayName: "Monday",
          elapsed: 500,
        }),
        requestedDay: wednesday,
      });
      expect(setActiveWorkout).not.toHaveBeenCalled();
      expect(setView).not.toHaveBeenCalled();
    });

    it("handleResumePausedWorkout resumes the paused workout and handleDiscardAndStartWorkout replaces it", () => {
      const pausedWorkout = {
        weekNumber: 1,
        dayNumber: 1,
        dayName: "Monday",
        focus: "Push",
        workout: makePlan().weeks[0].schedule[0],
        logs: [
          {
            name: "Bench Press",
            sets: [{ weight: "155", reps: "8", completed: true }],
          },
        ],
        elapsed: 420,
      };
      localStorage.setItem(ACTIVE_KEY, JSON.stringify(pausedWorkout));
      localStorage.setItem(LEGACY_ACTIVE_KEY, JSON.stringify({ stale: true }));

      const { result, setActiveWorkout, setView } = renderUseWorkout();
      expect(result.current.handleResumePausedWorkout).toBeTypeOf("function");
      expect(result.current.handleDiscardAndStartWorkout).toBeTypeOf("function");

      const resumed = result.current.handleResumePausedWorkout(pausedWorkout);
      expect(resumed).toBe(true);
      expect(setActiveWorkout).toHaveBeenCalledWith(
        expect.objectContaining({
          weekNumber: 1,
          dayNumber: 1,
          dayName: "Monday",
          elapsed: 420,
        })
      );
      expect(setView).toHaveBeenCalledWith("active");

      setActiveWorkout.mockClear();
      setView.mockClear();

      const wednesday = {
        ...makePlan().weeks[0].schedule[1],
        weekNumber: 1,
      };
      result.current.handleDiscardAndStartWorkout(wednesday);

      expect(localStorage.getItem(ACTIVE_KEY)).toBeNull();
      expect(localStorage.getItem(LEGACY_ACTIVE_KEY)).toBeNull();
      expect(setActiveWorkout).toHaveBeenCalledWith(wednesday);
      expect(setView).toHaveBeenCalledWith("active");
    });
  });
});
