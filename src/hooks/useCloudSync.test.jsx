// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act, cleanup } from "@testing-library/react";

const firestoreServiceMock = vi.hoisted(() => ({
  getUserData: vi.fn(),
  saveUserData: vi.fn(),
  getWorkouts: vi.fn(),
  migrateLegacyHistory: vi.fn(),
}));

vi.mock("../services/firebase/firestoreServices", () => ({
  firestoreService: firestoreServiceMock,
}));

import { useCloudSync } from "./useCloudSync";

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useCloudSync", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("stays unsynced with null syncError and skips Firestore when user is null", () => {
    const setUserData = vi.fn();
    const onSyncComplete = vi.fn();

    const { result } = renderHook(() =>
      useCloudSync(
        null,
        { profile: null, plan: null, history: [] },
        setUserData,
        onSyncComplete
      )
    );

    expect(result.current.isSynced).toBe(false);
    expect(result.current.syncError).toBeNull();
    expect(firestoreServiceMock.getUserData).not.toHaveBeenCalled();
    expect(firestoreServiceMock.getWorkouts).not.toHaveBeenCalled();
    expect(onSyncComplete).not.toHaveBeenCalled();
  });

  it("starts with isSynced false and flips true only after getUserData and getWorkouts succeed", async () => {
    const userDeferred = createDeferred();
    const workoutsDeferred = createDeferred();
    firestoreServiceMock.getUserData.mockReturnValueOnce(userDeferred.promise);
    firestoreServiceMock.getWorkouts.mockReturnValueOnce(
      workoutsDeferred.promise
    );

    let state = { profile: null, plan: null, history: [] };
    const setUserData = vi.fn((updater) => {
      state = typeof updater === "function" ? updater(state) : updater;
    });
    const onSyncComplete = vi.fn();
    const user = { uid: "user-1" };

    const { result } = renderHook(() =>
      useCloudSync(user, state, setUserData, onSyncComplete)
    );

    expect(result.current.isSynced).toBe(false);
    expect(result.current.syncError).toBeNull();

    const cloudPlan = { programName: "PPL", totalWeeks: 4, weeks: [] };
    const cloudProfile = { goal: "muscle" };
    userDeferred.resolve({ plan: cloudPlan, profile: cloudProfile });

    await waitFor(() => {
      expect(firestoreServiceMock.getWorkouts).toHaveBeenCalledWith("user-1");
    });
    expect(result.current.isSynced).toBe(false);

    const cloudWorkouts = [
      {
        id: "w-1",
        weekNumber: 1,
        dayNumber: 1,
        dayName: "Monday",
        focus: "Push",
        logs: [],
        duration: 1800,
        completedAt: "2026-11-20T10:00:00.000Z",
      },
    ];
    workoutsDeferred.resolve(cloudWorkouts);

    await waitFor(() => {
      expect(result.current.isSynced).toBe(true);
    });

    expect(result.current.syncError).toBeNull();
    expect(firestoreServiceMock.migrateLegacyHistory).not.toHaveBeenCalled();
    expect(state).toEqual({
      profile: cloudProfile,
      plan: cloudPlan,
      history: cloudWorkouts,
    });
    expect(onSyncComplete).toHaveBeenCalledWith(true);
  });

  it("runs migrateLegacyHistory before getWorkouts when cloud doc has a legacy history array", async () => {
    const callOrder = [];
    const legacyHistory = [
      {
        workout: { weekNumber: 1, dayName: "Monday", focus: "Push" },
        logs: [],
        duration: 1200,
      },
    ];
    const migratedWorkouts = [
      {
        id: "migrated-w1-monday-idx0",
        weekNumber: 1,
        dayNumber: null,
        dayName: "Monday",
        focus: "Push",
        logs: [],
        duration: 1200,
        completedAt: "",
      },
    ];

    firestoreServiceMock.getUserData.mockImplementationOnce(async () => {
      callOrder.push("getUserData");
      return {
        profile: { goal: "strength" },
        plan: { programName: "Strength", weeks: [] },
        history: legacyHistory,
      };
    });
    firestoreServiceMock.migrateLegacyHistory.mockImplementationOnce(
      async () => {
        callOrder.push("migrateLegacyHistory");
        return { migratedCount: 1 };
      }
    );
    firestoreServiceMock.getWorkouts.mockImplementationOnce(async () => {
      callOrder.push("getWorkouts");
      return migratedWorkouts;
    });

    let state = { profile: null, plan: null, history: [] };
    const setUserData = vi.fn((updater) => {
      state = typeof updater === "function" ? updater(state) : updater;
    });
    const user = { uid: "user-legacy" };

    const { result } = renderHook(() =>
      useCloudSync(user, state, setUserData, vi.fn())
    );

    await waitFor(() => {
      expect(result.current.isSynced).toBe(true);
    });

    expect(callOrder).toEqual([
      "getUserData",
      "migrateLegacyHistory",
      "getWorkouts",
    ]);
    expect(firestoreServiceMock.migrateLegacyHistory).toHaveBeenCalledWith(
      "user-legacy",
      legacyHistory
    );
    expect(state.history).toEqual(migratedWorkouts);
  });

  it("uploads local plan/profile without history when cloud has no doc or workouts", async () => {
    firestoreServiceMock.getUserData.mockResolvedValueOnce(null);
    firestoreServiceMock.getWorkouts.mockResolvedValueOnce([]);
    firestoreServiceMock.saveUserData.mockResolvedValueOnce(undefined);

    const localData = {
      profile: { goal: "muscle" },
      plan: { programName: "Local Plan", weeks: [] },
      history: [{ id: "local-only" }],
    };
    const onSyncComplete = vi.fn();
    const user = { uid: "user-new" };

    const { result } = renderHook(() =>
      useCloudSync(user, localData, vi.fn(), onSyncComplete)
    );

    await waitFor(() => {
      expect(result.current.isSynced).toBe(true);
    });

    expect(firestoreServiceMock.saveUserData).toHaveBeenCalledWith("user-new", {
      plan: localData.plan,
      profile: localData.profile,
    });
    expect(onSyncComplete).toHaveBeenCalledWith(true);
  });

  it("keeps isSynced false and populates syncError when cloud fetch or migration fails", async () => {
    const syncFailure = new Error("Firestore unavailable");
    firestoreServiceMock.getUserData.mockResolvedValueOnce({
      plan: null,
      profile: null,
      history: [{ workout: { dayName: "Monday" } }],
    });
    firestoreServiceMock.migrateLegacyHistory.mockRejectedValueOnce(
      syncFailure
    );

    const onSyncComplete = vi.fn();
    const user = { uid: "user-err" };

    const { result } = renderHook(() =>
      useCloudSync(
        user,
        { profile: null, plan: null, history: [] },
        vi.fn(),
        onSyncComplete
      )
    );

    await waitFor(() => {
      expect(result.current.syncError).toBe(syncFailure);
    });

    expect(result.current.isSynced).toBe(false);
    expect(firestoreServiceMock.getWorkouts).not.toHaveBeenCalled();
    expect(onSyncComplete).toHaveBeenCalledWith(false);
  });

  it("resets isSynced to false and clears syncError when user logs out", async () => {
    firestoreServiceMock.getUserData.mockResolvedValueOnce({
      plan: { programName: "PPL", weeks: [] },
      profile: { goal: "muscle" },
    });
    firestoreServiceMock.getWorkouts.mockResolvedValueOnce([]);

    const setUserData = vi.fn();
    const initialUser = { uid: "user-logout" };

    const { result, rerender } = renderHook(
      ({ currentUser }) =>
        useCloudSync(
          currentUser,
          { profile: null, plan: null, history: [] },
          setUserData,
          vi.fn()
        ),
      { initialProps: { currentUser: initialUser } }
    );

    await waitFor(() => {
      expect(result.current.isSynced).toBe(true);
    });

    rerender({ currentUser: null });

    await waitFor(() => {
      expect(result.current.isSynced).toBe(false);
    });
    expect(result.current.syncError).toBeNull();
  });

  it("hydrates null plan and profile while preserving workouts on reload after Reset Program", async () => {
    const existingWorkouts = [
      {
        id: "w-1",
        weekNumber: 1,
        dayNumber: 1,
        dayName: "Monday",
        focus: "Push",
        logs: [],
        duration: 1800,
        completedAt: "2026-11-20T10:00:00.000Z",
      },
      {
        id: "w-2",
        weekNumber: 1,
        dayNumber: 2,
        dayName: "Wednesday",
        focus: "Pull",
        logs: [],
        duration: 1500,
        completedAt: "2026-11-22T10:00:00.000Z",
      },
    ];
    firestoreServiceMock.getUserData.mockResolvedValueOnce({
      plan: null,
      profile: null,
      updatedAt: "2026-11-24T00:00:00.000Z",
    });
    firestoreServiceMock.getWorkouts.mockResolvedValueOnce(existingWorkouts);

    let state = {
      profile: { goal: "Stale Local Goal" },
      plan: { programName: "Stale Local Plan", weeks: [] },
      history: [],
    };
    const setUserData = vi.fn((updater) => {
      state = typeof updater === "function" ? updater(state) : updater;
    });
    const onSyncComplete = vi.fn();
    const user = { uid: "user-after-reset" };

    const { result } = renderHook(() =>
      useCloudSync(user, state, setUserData, onSyncComplete)
    );

    await waitFor(() => {
      expect(result.current.isSynced).toBe(true);
    });

    expect(result.current.syncError).toBeNull();
    expect(state).toEqual({
      profile: null,
      plan: null,
      history: existingWorkouts,
    });
    expect(onSyncComplete).toHaveBeenCalledWith(false);
  });

  it("exposes retrySync that transitions failed -> pending -> synced on recovery", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const initialError = new Error("Network offline");
    firestoreServiceMock.getUserData.mockRejectedValueOnce(initialError);

    let state = { profile: null, plan: null, history: [] };
    const setUserData = vi.fn((updater) => {
      state = typeof updater === "function" ? updater(state) : updater;
    });
    const onSyncComplete = vi.fn();
    const user = { uid: "user-retry" };

    try {
      const { result } = renderHook(() =>
        useCloudSync(user, state, setUserData, onSyncComplete)
      );

      await waitFor(() => {
        expect(result.current.syncError).toBe(initialError);
      });
      expect(result.current.isSynced).toBe(false);
      expect(result.current.retrySync).toBeTypeOf("function");

      const retryUserDeferred = createDeferred();
      const retryWorkoutsDeferred = createDeferred();
      firestoreServiceMock.getUserData.mockReturnValueOnce(
        retryUserDeferred.promise
      );
      firestoreServiceMock.getWorkouts.mockReturnValueOnce(
        retryWorkoutsDeferred.promise
      );

      act(() => {
        result.current.retrySync();
      });

      // Immediately transitions back to pending (error cleared while re-fetching)
      expect(result.current.isSynced).toBe(false);
      expect(result.current.syncError).toBeNull();

      retryUserDeferred.resolve({
        plan: { programName: "Recovered Plan", weeks: [] },
        profile: { goal: "strength" },
      });
      retryWorkoutsDeferred.resolve([]);

      await waitFor(() => {
        expect(result.current.isSynced).toBe(true);
      });

      expect(result.current.syncError).toBeNull();
      expect(state).toEqual({
        profile: { goal: "strength" },
        plan: { programName: "Recovered Plan", weeks: [] },
        history: [],
      });
      expect(onSyncComplete).toHaveBeenLastCalledWith(true);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("updates syncError with the new error if retrySync also fails and is a no-op when user is null", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const err1 = new Error("First sync error");
    const err2 = new Error("Second sync error");
    firestoreServiceMock.getUserData
      .mockRejectedValueOnce(err1)
      .mockRejectedValueOnce(err2);

    try {
      const nullHook = renderHook(() =>
        useCloudSync(
          null,
          { profile: null, plan: null, history: [] },
          vi.fn(),
          vi.fn()
        )
      );
      expect(nullHook.result.current.retrySync).toBeTypeOf("function");
      act(() => {
        nullHook.result.current.retrySync();
      });
      expect(firestoreServiceMock.getUserData).not.toHaveBeenCalled();

      const user = { uid: "user-retry-fail" };
      const { result } = renderHook(() =>
        useCloudSync(
          user,
          { profile: null, plan: null, history: [] },
          vi.fn(),
          vi.fn()
        )
      );

      await waitFor(() => {
        expect(result.current.syncError).toBe(err1);
      });

      act(() => {
        result.current.retrySync();
      });

      await waitFor(() => {
        expect(result.current.syncError).toBe(err2);
      });
      expect(result.current.isSynced).toBe(false);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
