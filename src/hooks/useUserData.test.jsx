// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act, cleanup } from "@testing-library/react";

const firestoreServiceMock = vi.hoisted(() => ({
  getUserData: vi.fn(),
  saveUserData: vi.fn(),
  getWorkouts: vi.fn(),
  addWorkout: vi.fn(),
  migrateLegacyHistory: vi.fn(),
  resetUserProgram: vi.fn(),
  deleteUserData: vi.fn(),
}));

vi.mock("../services/firebase/firestoreServices", () => ({
  firestoreService: firestoreServiceMock,
}));

import { useUserData } from "./useUserData";

const SYNC_PENDING_ERROR =
  "Still syncing your data from the cloud. Please try again in a moment.";
const SYNC_FAILED_SAVE_PLAN =
  "Cloud sync failed. Please retry sync before saving your plan.";
const SYNC_FAILED_DEFAULT =
  "Cloud sync failed. Please retry sync before saving changes.";
const SYNC_FAILED_RESET =
  "Cloud sync failed. Please retry sync before resetting your program.";

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeWorkout(id = "w-1", overrides = {}) {
  return {
    id,
    weekNumber: 1,
    dayNumber: 1,
    dayName: "Monday",
    focus: "Push",
    logs: [],
    duration: 1800,
    completedAt: "2026-11-20T10:00:00.000Z",
    ...overrides,
  };
}

describe("useUserData", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe("initial logged-out state and return shape", () => {
    it("returns the exact 14 keys with ready/unsynced state, skips Firestore, and makes retrySync a no-op when user is null", () => {
      const onSyncComplete = vi.fn();
      const { result } = renderHook(() =>
        useUserData(null, { onSyncComplete })
      );

      expect(Object.keys(result.current).sort()).toEqual([
        "addWorkout",
        "clearLocalData",
        "deleteAll",
        "error",
        "isSynced",
        "plan",
        "profile",
        "resetProgram",
        "retrySync",
        "savePlan",
        "status",
        "syncError",
        "updatePlan",
        "workouts",
      ]);

      expect(result.current.profile).toBeNull();
      expect(result.current.plan).toBeNull();
      expect(result.current.workouts).toEqual([]);
      expect(result.current.status).toBe("ready");
      expect(result.current.error).toBeNull();
      expect(result.current.isSynced).toBe(false);
      expect(result.current.syncError).toBeNull();

      act(() => {
        result.current.retrySync();
      });

      expect(firestoreServiceMock.getUserData).not.toHaveBeenCalled();
      expect(firestoreServiceMock.getWorkouts).not.toHaveBeenCalled();
      expect(firestoreServiceMock.migrateLegacyHistory).not.toHaveBeenCalled();
      expect(firestoreServiceMock.saveUserData).not.toHaveBeenCalled();
      expect(onSyncComplete).not.toHaveBeenCalled();
    });
  });

  describe("cloud sync lifecycle, migration, bootstrap, and retry", () => {
    it("starts in loading and transitions to ready only after getUserData and getWorkouts succeed without refetching on onSyncComplete identity changes", async () => {
      const userDeferred = createDeferred();
      const workoutsDeferred = createDeferred();
      firestoreServiceMock.getUserData.mockReturnValueOnce(
        userDeferred.promise
      );
      firestoreServiceMock.getWorkouts.mockReturnValueOnce(
        workoutsDeferred.promise
      );

      const firstCallback = vi.fn();
      const secondCallback = vi.fn();
      const user = { uid: "user-1" };

      const { result, rerender } = renderHook(
        ({ onSyncComplete }) => useUserData(user, { onSyncComplete }),
        { initialProps: { onSyncComplete: firstCallback } }
      );

      expect(result.current.status).toBe("loading");
      expect(result.current.error).toBeNull();
      expect(result.current.isSynced).toBe(false);
      expect(result.current.syncError).toBeNull();
      expect(result.current.profile).toBeNull();
      expect(result.current.plan).toBeNull();
      expect(result.current.workouts).toEqual([]);

      const cloudPlan = { programName: "PPL", totalWeeks: 4, weeks: [] };
      const cloudProfile = { goal: "muscle" };
      userDeferred.resolve({ plan: cloudPlan, profile: cloudProfile });

      await waitFor(() => {
        expect(firestoreServiceMock.getWorkouts).toHaveBeenCalledWith("user-1");
      });
      expect(result.current.status).toBe("loading");
      expect(result.current.isSynced).toBe(false);

      // Update callback reference before workouts resolves
      rerender({ onSyncComplete: secondCallback });

      const cloudWorkouts = [makeWorkout("w-1")];
      workoutsDeferred.resolve(cloudWorkouts);

      await waitFor(() => {
        expect(result.current.status).toBe("ready");
      });

      expect(result.current.isSynced).toBe(true);
      expect(result.current.error).toBeNull();
      expect(result.current.syncError).toBeNull();
      expect(result.current.profile).toEqual(cloudProfile);
      expect(result.current.plan).toEqual(cloudPlan);
      expect(result.current.workouts).toEqual(cloudWorkouts);
      expect(firestoreServiceMock.migrateLegacyHistory).not.toHaveBeenCalled();
      expect(firstCallback).not.toHaveBeenCalled();
      expect(secondCallback).toHaveBeenCalledWith(true);

      // Changing onSyncComplete again must NOT trigger another fetch
      rerender({ onSyncComplete: vi.fn() });
      expect(firestoreServiceMock.getUserData).toHaveBeenCalledTimes(1);
      expect(firestoreServiceMock.getWorkouts).toHaveBeenCalledTimes(1);
    });

    it("runs migrateLegacyHistory strictly after getUserData and before getWorkouts when cloud doc has legacy history array", async () => {
      const callOrder = [];
      const legacyHistory = [
        {
          workout: { weekNumber: 1, dayName: "Monday", focus: "Push" },
          logs: [],
          duration: 1200,
        },
      ];
      const migratedWorkouts = [
        makeWorkout("migrated-w1-monday-idx0", {
          dayNumber: null,
          duration: 1200,
          completedAt: "",
        }),
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

      const user = { uid: "user-legacy" };
      const { result } = renderHook(() => useUserData(user));

      await waitFor(() => {
        expect(result.current.status).toBe("ready");
      });

      expect(result.current.isSynced).toBe(true);
      expect(callOrder).toEqual([
        "getUserData",
        "migrateLegacyHistory",
        "getWorkouts",
      ]);
      expect(firestoreServiceMock.migrateLegacyHistory).toHaveBeenCalledWith(
        "user-legacy",
        legacyHistory
      );
      expect(result.current.workouts).toEqual(migratedWorkouts);
    });

    it("bootstraps pre-login local plan and profile without history when cloud has no doc or workouts", async () => {
      firestoreServiceMock.getUserData.mockResolvedValueOnce(null);
      firestoreServiceMock.getWorkouts.mockResolvedValueOnce([]);
      firestoreServiceMock.saveUserData.mockResolvedValueOnce(undefined);

      const onSyncComplete = vi.fn();
      const { result, rerender } = renderHook(
        ({ currentUser }) => useUserData(currentUser, { onSyncComplete }),
        { initialProps: { currentUser: null } }
      );

      const localPlan = { programName: "Local Plan", weeks: [] };
      const localProfile = { goal: "muscle" };
      await act(async () => {
        await result.current.savePlan(localPlan, localProfile);
        await result.current.addWorkout({
          weekNumber: 1,
          dayNumber: 1,
          dayName: "Monday",
          focus: "Push",
          logs: [],
          duration: 900,
          completedAt: "2026-11-24T10:00:00.000Z",
        });
      });

      expect(firestoreServiceMock.saveUserData).not.toHaveBeenCalled();

      rerender({ currentUser: { uid: "user-new" } });

      await waitFor(() => {
        expect(result.current.status).toBe("ready");
        expect(result.current.isSynced).toBe(true);
      });

      expect(firestoreServiceMock.saveUserData).toHaveBeenCalledWith(
        "user-new",
        {
          plan: localPlan,
          profile: localProfile,
        }
      );
      expect(result.current.plan).toEqual(localPlan);
      expect(result.current.profile).toEqual(localProfile);
      expect(result.current.workouts).toEqual([]);
      expect(onSyncComplete).toHaveBeenCalledWith(true);
    });

    it("hydrates null plan and profile while preserving workouts on reload after Reset Program", async () => {
      const existingWorkouts = [
        makeWorkout("w-1"),
        makeWorkout("w-2", {
          dayNumber: 2,
          dayName: "Wednesday",
          focus: "Pull",
          completedAt: "2026-11-22T10:00:00.000Z",
        }),
      ];
      firestoreServiceMock.getUserData.mockResolvedValueOnce({
        plan: null,
        profile: null,
        updatedAt: "2026-11-24T00:00:00.000Z",
      });
      firestoreServiceMock.getWorkouts.mockResolvedValueOnce(existingWorkouts);

      const onSyncComplete = vi.fn();
      const user = { uid: "user-after-reset" };

      const { result } = renderHook(() =>
        useUserData(user, { onSyncComplete })
      );

      await waitFor(() => {
        expect(result.current.status).toBe("ready");
      });

      expect(result.current.isSynced).toBe(true);
      expect(result.current.error).toBeNull();
      expect(result.current.syncError).toBeNull();
      expect(result.current.profile).toBeNull();
      expect(result.current.plan).toBeNull();
      expect(result.current.workouts).toEqual(existingWorkouts);
      expect(onSyncComplete).toHaveBeenCalledWith(false);
    });

    it("transitions to status=error with error and syncError (never masked as loading) when sync fails", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
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

      try {
        const { result } = renderHook(() =>
          useUserData(user, { onSyncComplete })
        );

        await waitFor(() => {
          expect(result.current.status).toBe("error");
        });

        expect(result.current.error).toBe(syncFailure);
        expect(result.current.syncError).toBe(syncFailure);
        expect(result.current.isSynced).toBe(false);
        expect(firestoreServiceMock.getWorkouts).not.toHaveBeenCalled();
        expect(onSyncComplete).toHaveBeenCalledWith(false);
      } finally {
        consoleErrorSpy.mockRestore();
      }
    });

    it("retrySync transitions error -> loading (clearing error immediately) -> ready on recovery, or updates error on repeat failure", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const err1 = new Error("Network offline");
      const err2 = new Error("Still offline");
      firestoreServiceMock.getUserData.mockRejectedValueOnce(err1);

      const onSyncComplete = vi.fn();
      const user = { uid: "user-retry" };

      try {
        const { result } = renderHook(() =>
          useUserData(user, { onSyncComplete })
        );

        await waitFor(() => {
          expect(result.current.status).toBe("error");
        });
        expect(result.current.error).toBe(err1);
        expect(result.current.syncError).toBe(err1);

        // First retry fails with a new error
        const firstRetryDeferred = createDeferred();
        firestoreServiceMock.getUserData.mockReturnValueOnce(
          firstRetryDeferred.promise
        );

        act(() => {
          result.current.retrySync();
        });

        expect(result.current.status).toBe("loading");
        expect(result.current.error).toBeNull();
        expect(result.current.syncError).toBeNull();
        expect(result.current.isSynced).toBe(false);

        firstRetryDeferred.reject(err2);

        await waitFor(() => {
          expect(result.current.status).toBe("error");
        });
        expect(result.current.error).toBe(err2);
        expect(result.current.syncError).toBe(err2);
        expect(result.current.isSynced).toBe(false);

        // Second retry succeeds
        const recoverUserDeferred = createDeferred();
        const recoverWorkoutsDeferred = createDeferred();
        firestoreServiceMock.getUserData.mockReturnValueOnce(
          recoverUserDeferred.promise
        );
        firestoreServiceMock.getWorkouts.mockReturnValueOnce(
          recoverWorkoutsDeferred.promise
        );

        act(() => {
          result.current.retrySync();
        });

        expect(result.current.status).toBe("loading");
        expect(result.current.error).toBeNull();
        expect(result.current.syncError).toBeNull();

        recoverUserDeferred.resolve({
          plan: { programName: "Recovered Plan", weeks: [] },
          profile: { goal: "strength" },
        });
        recoverWorkoutsDeferred.resolve([makeWorkout("w-recovered")]);

        await waitFor(() => {
          expect(result.current.status).toBe("ready");
        });
        expect(result.current.isSynced).toBe(true);
        expect(result.current.error).toBeNull();
        expect(result.current.syncError).toBeNull();
        expect(result.current.plan).toEqual({
          programName: "Recovered Plan",
          weeks: [],
        });
        expect(result.current.profile).toEqual({ goal: "strength" });
        expect(result.current.workouts).toEqual([makeWorkout("w-recovered")]);
        expect(onSyncComplete).toHaveBeenLastCalledWith(true);
      } finally {
        consoleErrorSpy.mockRestore();
      }
    });
  });

  describe("session isolation (logout, re-login, account switch, stale writes)", () => {
    it("immediately clears data on logout and ignores in-flight sync resolution/rejection", async () => {
      const inFlightDeferred = createDeferred();
      firestoreServiceMock.getUserData.mockReturnValueOnce(
        inFlightDeferred.promise
      );

      const onSyncComplete = vi.fn();
      const { result, rerender } = renderHook(
        ({ currentUser }) => useUserData(currentUser, { onSyncComplete }),
        { initialProps: { currentUser: { uid: "user-inflight" } } }
      );

      expect(result.current.status).toBe("loading");

      rerender({ currentUser: null });

      expect(result.current.status).toBe("ready");
      expect(result.current.error).toBeNull();
      expect(result.current.isSynced).toBe(false);
      expect(result.current.syncError).toBeNull();
      expect(result.current.profile).toBeNull();
      expect(result.current.plan).toBeNull();
      expect(result.current.workouts).toEqual([]);

      await act(async () => {
        inFlightDeferred.resolve({
          plan: { programName: "Late Plan", weeks: [] },
          profile: { goal: "muscle" },
        });
        await Promise.resolve();
      });

      expect(result.current.profile).toBeNull();
      expect(result.current.plan).toBeNull();
      expect(result.current.workouts).toEqual([]);
      expect(result.current.isSynced).toBe(false);
      expect(onSyncComplete).not.toHaveBeenCalled();
    });

    it("starts in loading and performs a fresh sync when logging out and logging back in as the same uid", async () => {
      firestoreServiceMock.getUserData.mockResolvedValueOnce({
        plan: { programName: "Session 1 Plan", weeks: [] },
        profile: { goal: "muscle" },
      });
      firestoreServiceMock.getWorkouts.mockResolvedValueOnce([
        makeWorkout("w-1"),
      ]);

      const { result, rerender } = renderHook(
        ({ currentUser }) => useUserData(currentUser),
        { initialProps: { currentUser: { uid: "user-same" } } }
      );

      await waitFor(() => {
        expect(result.current.status).toBe("ready");
        expect(result.current.isSynced).toBe(true);
      });
      expect(result.current.plan.programName).toBe("Session 1 Plan");

      // Logout clears immediately
      rerender({ currentUser: null });
      expect(result.current.status).toBe("ready");
      expect(result.current.isSynced).toBe(false);
      expect(result.current.plan).toBeNull();
      expect(result.current.profile).toBeNull();
      expect(result.current.workouts).toEqual([]);

      // Re-login as same uid must start in loading
      const reLoginDeferred = createDeferred();
      firestoreServiceMock.getUserData.mockReturnValueOnce(
        reLoginDeferred.promise
      );
      firestoreServiceMock.getWorkouts.mockResolvedValueOnce([]);

      rerender({ currentUser: { uid: "user-same" } });

      expect(result.current.status).toBe("loading");
      expect(result.current.isSynced).toBe(false);
      expect(result.current.plan).toBeNull();

      reLoginDeferred.resolve({
        plan: { programName: "Session 2 Plan", weeks: [] },
        profile: { goal: "strength" },
      });

      await waitFor(() => {
        expect(result.current.status).toBe("ready");
        expect(result.current.isSynced).toBe(true);
      });
      expect(result.current.plan.programName).toBe("Session 2 Plan");
      expect(firestoreServiceMock.getUserData).toHaveBeenCalledTimes(2);
    });

    it("immediately clears userA data on direct userA -> userB switch and never bootstraps userA data into userB", async () => {
      firestoreServiceMock.getUserData.mockResolvedValueOnce({
        plan: { programName: "User A Plan", weeks: [] },
        profile: { goal: "User A Goal" },
      });
      firestoreServiceMock.getWorkouts.mockResolvedValueOnce([
        makeWorkout("w-a"),
      ]);

      const onSyncComplete = vi.fn();
      const { result, rerender } = renderHook(
        ({ currentUser }) => useUserData(currentUser, { onSyncComplete }),
        { initialProps: { currentUser: { uid: "user-A" } } }
      );

      await waitFor(() => {
        expect(result.current.status).toBe("ready");
      });
      expect(result.current.plan.programName).toBe("User A Plan");

      const userBDeferred = createDeferred();
      firestoreServiceMock.getUserData.mockReturnValueOnce(
        userBDeferred.promise
      );
      firestoreServiceMock.getWorkouts.mockResolvedValueOnce([]);

      rerender({ currentUser: { uid: "user-B" } });

      // User A's data must be cleared immediately while User B loads
      expect(result.current.status).toBe("loading");
      expect(result.current.isSynced).toBe(false);
      expect(result.current.plan).toBeNull();
      expect(result.current.profile).toBeNull();
      expect(result.current.workouts).toEqual([]);

      userBDeferred.resolve(null);

      await waitFor(() => {
        expect(result.current.status).toBe("ready");
        expect(result.current.isSynced).toBe(true);
      });

      expect(firestoreServiceMock.saveUserData).not.toHaveBeenCalled();
      expect(result.current.plan).toBeNull();
      expect(result.current.profile).toBeNull();
      expect(result.current.workouts).toEqual([]);
      expect(onSyncComplete).toHaveBeenLastCalledWith(false);
    });

    it("does not write stale mutation results into logged-out state when user logs out mid-write", async () => {
      firestoreServiceMock.getUserData.mockResolvedValueOnce({
        plan: { programName: "Initial", weeks: [] },
        profile: { goal: "strength" },
      });
      firestoreServiceMock.getWorkouts.mockResolvedValueOnce([]);

      const saveDeferred = createDeferred();
      const addDeferred = createDeferred();
      firestoreServiceMock.saveUserData.mockReturnValueOnce(
        saveDeferred.promise
      );
      firestoreServiceMock.addWorkout.mockReturnValueOnce(addDeferred.promise);

      const { result, rerender } = renderHook(
        ({ currentUser }) => useUserData(currentUser),
        { initialProps: { currentUser: { uid: "user-write" } } }
      );

      await waitFor(() => {
        expect(result.current.status).toBe("ready");
      });

      const pendingSave = result.current.savePlan(
        { programName: "Stale Plan", weeks: [] },
        { goal: "stale" }
      );
      const pendingWorkout = result.current.addWorkout({
        weekNumber: 1,
        dayNumber: 1,
        dayName: "Monday",
        focus: "Push",
        logs: [],
        duration: 900,
        completedAt: "2026-11-24T10:00:00.000Z",
      });

      // User logs out before Firestore writes resolve
      rerender({ currentUser: null });

      await act(async () => {
        saveDeferred.resolve(undefined);
        addDeferred.resolve(makeWorkout("w-stale"));
        await Promise.all([pendingSave, pendingWorkout]);
      });

      expect(result.current.plan).toBeNull();
      expect(result.current.profile).toBeNull();
      expect(result.current.workouts).toEqual([]);
    });
  });

  describe("sync guards on write mutations", () => {
    it("rejects savePlan, updatePlan, addWorkout, and resetProgram with pending error and zero Firestore writes while status is loading", async () => {
      const pendingSync = createDeferred();
      firestoreServiceMock.getUserData.mockReturnValueOnce(pendingSync.promise);

      const { result } = renderHook(() => useUserData({ uid: "user-loading" }));
      expect(result.current.status).toBe("loading");

      await expect(
        result.current.savePlan({ programName: "P", weeks: [] }, { goal: "g" })
      ).rejects.toThrow(SYNC_PENDING_ERROR);
      await expect(
        result.current.updatePlan({ programName: "P2", weeks: [] })
      ).rejects.toThrow(SYNC_PENDING_ERROR);
      await expect(
        result.current.addWorkout({
          weekNumber: 1,
          dayNumber: 1,
          dayName: "Monday",
          focus: "Push",
          logs: [],
          duration: 600,
          completedAt: "2026-11-24T10:00:00.000Z",
        })
      ).rejects.toThrow(SYNC_PENDING_ERROR);
      await expect(result.current.resetProgram()).rejects.toThrow(
        SYNC_PENDING_ERROR
      );

      expect(firestoreServiceMock.saveUserData).not.toHaveBeenCalled();
      expect(firestoreServiceMock.addWorkout).not.toHaveBeenCalled();
      expect(firestoreServiceMock.resetUserProgram).not.toHaveBeenCalled();
    });

    it("rejects savePlan, updatePlan, addWorkout, and resetProgram with operation-specific sync-failed errors when status is error", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      firestoreServiceMock.getUserData.mockRejectedValueOnce(
        new Error("Offline")
      );

      try {
        const { result } = renderHook(() => useUserData({ uid: "user-failed" }));

        await waitFor(() => {
          expect(result.current.status).toBe("error");
        });

        await expect(
          result.current.savePlan({ programName: "P", weeks: [] }, { goal: "g" })
        ).rejects.toThrow(SYNC_FAILED_SAVE_PLAN);
        await expect(
          result.current.updatePlan({ programName: "P2", weeks: [] })
        ).rejects.toThrow(SYNC_FAILED_DEFAULT);
        await expect(
          result.current.addWorkout({
            weekNumber: 1,
            dayNumber: 1,
            dayName: "Monday",
            focus: "Push",
            logs: [],
            duration: 600,
            completedAt: "2026-11-24T10:00:00.000Z",
          })
        ).rejects.toThrow(SYNC_FAILED_DEFAULT);
        await expect(result.current.resetProgram()).rejects.toThrow(
          SYNC_FAILED_RESET
        );

        expect(firestoreServiceMock.saveUserData).not.toHaveBeenCalled();
        expect(firestoreServiceMock.addWorkout).not.toHaveBeenCalled();
        expect(firestoreServiceMock.resetUserProgram).not.toHaveBeenCalled();
      } finally {
        consoleErrorSpy.mockRestore();
      }
    });
  });

  describe("awaited-write mutations and clearLocalData", () => {
    it("savePlan awaits saveUserData, mutates plan/profile only after resolve while preserving workouts, and leaves state untouched on failure", async () => {
      const initialWorkout = makeWorkout("w-1");
      firestoreServiceMock.getUserData.mockResolvedValueOnce({
        plan: { programName: "Old", weeks: [] },
        profile: { goal: "old" },
      });
      firestoreServiceMock.getWorkouts.mockResolvedValueOnce([initialWorkout]);

      const { result } = renderHook(() => useUserData({ uid: "user-save" }));

      await waitFor(() => {
        expect(result.current.status).toBe("ready");
      });

      const writeDeferred = createDeferred();
      firestoreServiceMock.saveUserData.mockReturnValueOnce(
        writeDeferred.promise
      );

      const nextPlan = { programName: "New Plan", weeks: [] };
      const nextProfile = { goal: "strength" };
      const pending = result.current.savePlan(nextPlan, nextProfile);

      // Must NOT mutate state before Firestore resolves
      expect(result.current.plan.programName).toBe("Old");
      expect(result.current.profile.goal).toBe("old");

      let returned;
      await act(async () => {
        writeDeferred.resolve(undefined);
        returned = await pending;
      });

      expect(firestoreServiceMock.saveUserData).toHaveBeenCalledWith(
        "user-save",
        { plan: nextPlan, profile: nextProfile }
      );
      expect(returned).toEqual({ plan: nextPlan, profile: nextProfile });
      expect(result.current.plan).toEqual(nextPlan);
      expect(result.current.profile).toEqual(nextProfile);
      expect(result.current.workouts).toEqual([initialWorkout]);

      // Failure leaves state untouched and rethrows
      firestoreServiceMock.saveUserData.mockRejectedValueOnce(
        new Error("Save failed")
      );
      await expect(
        result.current.savePlan(
          { programName: "Broken", weeks: [] },
          { goal: "broken" }
        )
      ).rejects.toThrow("Save failed");
      expect(result.current.plan).toEqual(nextPlan);
      expect(result.current.profile).toEqual(nextProfile);
    });

    it("updatePlan awaits saveUserData, preserves profile and workouts, and rethrows without mutating state on failure", async () => {
      const initialWorkout = makeWorkout("w-1");
      firestoreServiceMock.getUserData.mockResolvedValueOnce({
        plan: { programName: "V1", weeks: [] },
        profile: { goal: "hypertrophy" },
      });
      firestoreServiceMock.getWorkouts.mockResolvedValueOnce([initialWorkout]);

      const { result } = renderHook(() => useUserData({ uid: "user-upd" }));
      await waitFor(() => {
        expect(result.current.status).toBe("ready");
      });

      const updDeferred = createDeferred();
      firestoreServiceMock.saveUserData.mockReturnValueOnce(
        updDeferred.promise
      );

      const updatedPlan = { programName: "V2", weeks: [{ weekNumber: 1 }] };
      const pending = result.current.updatePlan(updatedPlan);
      expect(result.current.plan.programName).toBe("V1");

      let returned;
      await act(async () => {
        updDeferred.resolve(undefined);
        returned = await pending;
      });

      expect(firestoreServiceMock.saveUserData).toHaveBeenCalledWith(
        "user-upd",
        { plan: updatedPlan }
      );
      expect(returned).toBe(updatedPlan);
      expect(result.current.plan).toEqual(updatedPlan);
      expect(result.current.profile).toEqual({ goal: "hypertrophy" });
      expect(result.current.workouts).toEqual([initialWorkout]);

      firestoreServiceMock.saveUserData.mockRejectedValueOnce(
        new Error("Update rejected")
      );
      await expect(
        result.current.updatePlan({ programName: "V3", weeks: [] })
      ).rejects.toThrow("Update rejected");
      expect(result.current.plan).toEqual(updatedPlan);
    });

    it("addWorkout awaits firestoreService.addWorkout, appends entry only after resolve, and rethrows on failure", async () => {
      firestoreServiceMock.getUserData.mockResolvedValueOnce({
        plan: { programName: "PPL", weeks: [] },
        profile: { goal: "strength" },
      });
      firestoreServiceMock.getWorkouts.mockResolvedValueOnce([]);

      const { result } = renderHook(() => useUserData({ uid: "user-add" }));
      await waitFor(() => {
        expect(result.current.status).toBe("ready");
      });

      const addDeferred = createDeferred();
      firestoreServiceMock.addWorkout.mockReturnValueOnce(addDeferred.promise);

      const payload = {
        weekNumber: 1,
        dayNumber: 1,
        dayName: "Monday",
        focus: "Push",
        logs: [],
        duration: 1200,
        completedAt: "2026-11-24T10:00:00.000Z",
      };
      const pending = result.current.addWorkout(payload);
      expect(result.current.workouts).toEqual([]);

      const savedDoc = { id: "doc-123", ...payload };
      let returned;
      await act(async () => {
        addDeferred.resolve(savedDoc);
        returned = await pending;
      });

      expect(firestoreServiceMock.addWorkout).toHaveBeenCalledWith(
        "user-add",
        payload
      );
      expect(returned).toEqual(savedDoc);
      expect(result.current.workouts).toEqual([savedDoc]);

      firestoreServiceMock.addWorkout.mockRejectedValueOnce(
        new Error("Workout write failed")
      );
      await expect(result.current.addWorkout(payload)).rejects.toThrow(
        "Workout write failed"
      );
      expect(result.current.workouts).toEqual([savedDoc]);
    });

    it("resetProgram awaits resetUserProgram, clears plan and profile while preserving workouts, and rethrows on failure", async () => {
      const existingWorkouts = [makeWorkout("w-1"), makeWorkout("w-2")];
      const existingPlan = { programName: "PPL", weeks: [] };
      const existingProfile = { goal: "strength" };
      firestoreServiceMock.getUserData.mockResolvedValueOnce({
        plan: existingPlan,
        profile: existingProfile,
      });
      firestoreServiceMock.getWorkouts.mockResolvedValueOnce(existingWorkouts);

      const { result } = renderHook(() => useUserData({ uid: "user-reset" }));
      await waitFor(() => {
        expect(result.current.status).toBe("ready");
      });

      firestoreServiceMock.resetUserProgram.mockRejectedValueOnce(
        new Error("Reset denied")
      );
      await expect(result.current.resetProgram()).rejects.toThrow(
        "Reset denied"
      );
      expect(result.current.plan).toEqual(existingPlan);
      expect(result.current.profile).toEqual(existingProfile);
      expect(result.current.workouts).toEqual(existingWorkouts);

      const resetDeferred = createDeferred();
      firestoreServiceMock.resetUserProgram.mockReturnValueOnce(
        resetDeferred.promise
      );
      const pendingReset = result.current.resetProgram();
      expect(result.current.plan).toEqual(existingPlan);

      await act(async () => {
        resetDeferred.resolve(undefined);
        await pendingReset;
      });

      expect(firestoreServiceMock.resetUserProgram).toHaveBeenCalledWith(
        "user-reset"
      );
      expect(result.current.plan).toBeNull();
      expect(result.current.profile).toBeNull();
      expect(result.current.workouts).toEqual(existingWorkouts);
    });

    it("deleteAll rejects when logged out, bypasses sync guards when loading or error, clears state after resolve, and preserves state on failure", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      try {
        // Logged-out rejection
        const loggedOut = renderHook(() => useUserData(null));
        await expect(loggedOut.result.current.deleteAll()).rejects.toThrow(
          "User ID is required to delete user data."
        );
        expect(firestoreServiceMock.deleteUserData).not.toHaveBeenCalled();

        // Works while status === "loading"
        const loadingDeferred = createDeferred();
        firestoreServiceMock.getUserData.mockReturnValueOnce(
          loadingDeferred.promise
        );
        firestoreServiceMock.deleteUserData.mockResolvedValueOnce({
          deletedWorkoutsCount: 2,
        });

        const loadingHook = renderHook(() =>
          useUserData({ uid: "user-del-loading" })
        );
        expect(loadingHook.result.current.status).toBe("loading");

        let loadingDelResult;
        await act(async () => {
          loadingDelResult = await loadingHook.result.current.deleteAll();
        });
        expect(firestoreServiceMock.deleteUserData).toHaveBeenCalledWith(
          "user-del-loading"
        );
        expect(loadingDelResult).toEqual({ deletedWorkoutsCount: 2 });

        // Works while status === "error"
        firestoreServiceMock.getUserData.mockRejectedValueOnce(
          new Error("Sync broke")
        );
        firestoreServiceMock.deleteUserData.mockResolvedValueOnce({
          deletedWorkoutsCount: 1,
        });

        const errHook = renderHook(() => useUserData({ uid: "user-del-err" }));
        await waitFor(() => {
          expect(errHook.result.current.status).toBe("error");
        });

        let errDelResult;
        await act(async () => {
          errDelResult = await errHook.result.current.deleteAll();
        });
        expect(firestoreServiceMock.deleteUserData).toHaveBeenCalledWith(
          "user-del-err"
        );
        expect(errDelResult).toEqual({ deletedWorkoutsCount: 1 });

        // Awaited semantics & failure preservation when status === "ready"
        firestoreServiceMock.getUserData.mockResolvedValueOnce({
          plan: { programName: "PPL", weeks: [] },
          profile: { goal: "muscle" },
        });
        firestoreServiceMock.getWorkouts.mockResolvedValueOnce([
          makeWorkout("w-1"),
        ]);

        const readyHook = renderHook(() =>
          useUserData({ uid: "user-del-ready" })
        );
        await waitFor(() => {
          expect(readyHook.result.current.status).toBe("ready");
        });

        firestoreServiceMock.deleteUserData.mockRejectedValueOnce(
          new Error("Delete failed")
        );
        await expect(readyHook.result.current.deleteAll()).rejects.toThrow(
          "Delete failed"
        );
        expect(readyHook.result.current.plan).not.toBeNull();
        expect(readyHook.result.current.workouts).toHaveLength(1);

        const delDeferred = createDeferred();
        firestoreServiceMock.deleteUserData.mockReturnValueOnce(
          delDeferred.promise
        );
        const pendingDel = readyHook.result.current.deleteAll();
        expect(readyHook.result.current.plan).not.toBeNull();

        let readyDelResult;
        await act(async () => {
          delDeferred.resolve({ deletedWorkoutsCount: 1 });
          readyDelResult = await pendingDel;
        });

        expect(readyDelResult).toEqual({ deletedWorkoutsCount: 1 });
        expect(readyHook.result.current.plan).toBeNull();
        expect(readyHook.result.current.profile).toBeNull();
        expect(readyHook.result.current.workouts).toEqual([]);
      } finally {
        consoleErrorSpy.mockRestore();
      }
    });

    it("clearLocalData resets profile, plan, and workouts locally with zero Firestore calls", async () => {
      firestoreServiceMock.getUserData.mockResolvedValueOnce({
        plan: { programName: "PPL", weeks: [] },
        profile: { goal: "muscle" },
      });
      firestoreServiceMock.getWorkouts.mockResolvedValueOnce([
        makeWorkout("w-1"),
      ]);

      const { result } = renderHook(() => useUserData({ uid: "user-clear" }));
      await waitFor(() => {
        expect(result.current.status).toBe("ready");
      });

      vi.clearAllMocks();

      act(() => {
        result.current.clearLocalData();
      });

      expect(result.current.profile).toBeNull();
      expect(result.current.plan).toBeNull();
      expect(result.current.workouts).toEqual([]);
      expect(firestoreServiceMock.saveUserData).not.toHaveBeenCalled();
      expect(firestoreServiceMock.resetUserProgram).not.toHaveBeenCalled();
      expect(firestoreServiceMock.deleteUserData).not.toHaveBeenCalled();
    });
  });
});
