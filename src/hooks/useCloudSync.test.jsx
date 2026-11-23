// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";

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
});
