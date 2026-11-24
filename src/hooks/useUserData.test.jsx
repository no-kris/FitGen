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

    it("does not mutate logged-out state on late resolve OR late reject when user logs out mid-write", async () => {
      firestoreServiceMock.getUserData.mockResolvedValueOnce({
        plan: { programName: "Initial", weeks: [] },
        profile: { goal: "strength" },
      });
      firestoreServiceMock.getWorkouts.mockResolvedValueOnce([
        makeWorkout("w-initial"),
      ]);

      const saveDeferred = createDeferred();
      const addDeferred = createDeferred();
      const updateRejectDeferred = createDeferred();
      const addRejectDeferred = createDeferred();
      firestoreServiceMock.saveUserData
        .mockReturnValueOnce(saveDeferred.promise)
        .mockReturnValueOnce(updateRejectDeferred.promise);
      firestoreServiceMock.addWorkout
        .mockReturnValueOnce(addDeferred.promise)
        .mockReturnValueOnce(addRejectDeferred.promise);

      const { result, rerender } = renderHook(
        ({ currentUser }) => useUserData(currentUser),
        { initialProps: { currentUser: { uid: "user-write" } } }
      );

      await waitFor(() => {
        expect(result.current.status).toBe("ready");
      });

      let pendingSave;
      let pendingWorkout;
      let pendingUpdateReject;
      let pendingWorkoutReject;
      act(() => {
        pendingSave = result.current.savePlan(
          { programName: "Stale Plan", weeks: [] },
          { goal: "stale" }
        );
        pendingWorkout = result.current.addWorkout({
          weekNumber: 1,
          dayNumber: 1,
          dayName: "Monday",
          focus: "Push",
          logs: [],
          duration: 900,
          completedAt: "2026-11-24T10:00:00.000Z",
        });
        pendingUpdateReject = result.current.updatePlan({
          programName: "Stale Reject Plan",
          weeks: [],
        });
        pendingWorkoutReject = result.current.addWorkout({
          weekNumber: 1,
          dayNumber: 2,
          dayName: "Tuesday",
          focus: "Pull",
          logs: [],
          duration: 800,
          completedAt: "2026-11-24T11:00:00.000Z",
        });
      });

      // Attach rejection handlers before rejecting to avoid unhandled rejection noise
      const caughtUpdate = pendingUpdateReject.catch((err) => err);
      const caughtWorkout = pendingWorkoutReject.catch((err) => err);

      // User logs out before Firestore writes settle
      rerender({ currentUser: null });

      expect(result.current.plan).toBeNull();
      expect(result.current.profile).toBeNull();
      expect(result.current.workouts).toEqual([]);

      await act(async () => {
        saveDeferred.resolve(undefined);
        addDeferred.resolve(makeWorkout("w-stale"));
        updateRejectDeferred.reject(new Error("Late update failure"));
        addRejectDeferred.reject(new Error("Late add failure"));
        await Promise.all([pendingSave, pendingWorkout]);
      });

      expect((await caughtUpdate).message).toBe("Late update failure");
      expect((await caughtWorkout).message).toBe("Late add failure");
      expect(result.current.plan).toBeNull();
      expect(result.current.profile).toBeNull();
      expect(result.current.workouts).toEqual([]);
    });

    it("does not pollute userB state on late resolve OR late reject of userA in-flight writes during direct userA -> userB switch", async () => {
      firestoreServiceMock.getUserData.mockResolvedValueOnce({
        plan: { programName: "User A Plan", weeks: [] },
        profile: { goal: "User A Goal" },
      });
      firestoreServiceMock.getWorkouts.mockResolvedValueOnce([
        makeWorkout("w-a0"),
      ]);

      const { result, rerender } = renderHook(
        ({ currentUser }) => useUserData(currentUser),
        { initialProps: { currentUser: { uid: "user-A" } } }
      );

      await waitFor(() => {
        expect(result.current.status).toBe("ready");
      });

      const aUpdateResolve = createDeferred();
      const aUpdateReject = createDeferred();
      const aAddResolve = createDeferred();
      const aAddReject = createDeferred();

      firestoreServiceMock.saveUserData
        .mockReturnValueOnce(aUpdateResolve.promise)
        .mockReturnValueOnce(aUpdateReject.promise);
      firestoreServiceMock.addWorkout
        .mockReturnValueOnce(aAddResolve.promise)
        .mockReturnValueOnce(aAddReject.promise);

      let p1;
      let p2;
      let p3;
      let p4;
      act(() => {
        p1 = result.current.updatePlan({ programName: "A Optimistic 1", weeks: [] });
        p2 = result.current.updatePlan({ programName: "A Optimistic 2", weeks: [] });
        p3 = result.current.addWorkout(makeWorkout("tmp-payload-1"));
        p4 = result.current.addWorkout(makeWorkout("tmp-payload-2"));
      });
      const caught2 = p2.catch((err) => err);
      const caught4 = p4.catch((err) => err);

      const userBPlan = { programName: "User B Plan", weeks: [] };
      const userBProfile = { goal: "User B Goal" };
      const userBWorkouts = [makeWorkout("w-b1")];
      firestoreServiceMock.getUserData.mockResolvedValueOnce({
        plan: userBPlan,
        profile: userBProfile,
      });
      firestoreServiceMock.getWorkouts.mockResolvedValueOnce(userBWorkouts);

      rerender({ currentUser: { uid: "user-B" } });

      await waitFor(() => {
        expect(result.current.status).toBe("ready");
        expect(result.current.plan).toEqual(userBPlan);
      });

      await act(async () => {
        aUpdateResolve.resolve(undefined);
        aAddResolve.resolve(makeWorkout("w-a-late"));
        aUpdateReject.reject(new Error("A late update error"));
        aAddReject.reject(new Error("A late add error"));
        await Promise.all([p1, p3]);
      });

      expect((await caught2).message).toBe("A late update error");
      expect((await caught4).message).toBe("A late add error");
      expect(result.current.plan).toEqual(userBPlan);
      expect(result.current.profile).toEqual(userBProfile);
      expect(result.current.workouts).toEqual(userBWorkouts);
    });

    it("isolates logout + same-UID re-login (userA -> null -> userA) so Session 1 late resolve/reject cannot corrupt Session 2", async () => {
      firestoreServiceMock.getUserData.mockResolvedValueOnce({
        plan: { programName: "Session 1 Initial", weeks: [] },
        profile: { goal: "Session 1 Goal" },
      });
      firestoreServiceMock.getWorkouts.mockResolvedValueOnce([
        makeWorkout("w-s1"),
      ]);

      const { result, rerender } = renderHook(
        ({ currentUser }) => useUserData(currentUser),
        { initialProps: { currentUser: { uid: "user-same-epoch" } } }
      );

      await waitFor(() => {
        expect(result.current.status).toBe("ready");
      });

      const s1UpdateResolve = createDeferred();
      const s1UpdateReject = createDeferred();
      const s1AddResolve = createDeferred();
      const s1AddReject = createDeferred();
      firestoreServiceMock.saveUserData
        .mockReturnValueOnce(s1UpdateResolve.promise)
        .mockReturnValueOnce(s1UpdateReject.promise);
      firestoreServiceMock.addWorkout
        .mockReturnValueOnce(s1AddResolve.promise)
        .mockReturnValueOnce(s1AddReject.promise);

      let p1;
      let p2;
      let p3;
      let p4;
      act(() => {
        p1 = result.current.updatePlan({ programName: "S1 Optimistic Resolve", weeks: [] });
        p2 = result.current.updatePlan({ programName: "S1 Optimistic Reject", weeks: [] });
        p3 = result.current.addWorkout({
          weekNumber: 1,
          dayNumber: 1,
          dayName: "Monday",
          focus: "Push",
          logs: [],
          duration: 600,
          completedAt: "2026-11-24T10:00:00.000Z",
        });
        p4 = result.current.addWorkout({
          weekNumber: 1,
          dayNumber: 2,
          dayName: "Tuesday",
          focus: "Pull",
          logs: [],
          duration: 600,
          completedAt: "2026-11-24T11:00:00.000Z",
        });
      });
      const caught2 = p2.catch((err) => err);
      const caught4 = p4.catch((err) => err);

      // Logout
      rerender({ currentUser: null });
      expect(result.current.plan).toBeNull();

      // Re-login as the SAME uid
      const s2Plan = { programName: "Session 2 Cloud Plan", weeks: [] };
      const s2Profile = { goal: "Session 2 Cloud Goal" };
      const s2Workouts = [makeWorkout("w-s2")];
      firestoreServiceMock.getUserData.mockResolvedValueOnce({
        plan: s2Plan,
        profile: s2Profile,
      });
      firestoreServiceMock.getWorkouts.mockResolvedValueOnce(s2Workouts);

      rerender({ currentUser: { uid: "user-same-epoch" } });

      await waitFor(() => {
        expect(result.current.status).toBe("ready");
        expect(result.current.plan).toEqual(s2Plan);
      });

      // Settle Session 1 writes AFTER Session 2 is active with the same uid
      await act(async () => {
        s1UpdateResolve.resolve(undefined);
        s1AddResolve.resolve(makeWorkout("w-s1-late"));
        s1UpdateReject.reject(new Error("S1 late update reject"));
        s1AddReject.reject(new Error("S1 late add reject"));
        await Promise.all([p1, p3]);
      });

      expect((await caught2).message).toBe("S1 late update reject");
      expect((await caught4).message).toBe("S1 late add reject");
      expect(result.current.plan).toEqual(s2Plan);
      expect(result.current.profile).toEqual(s2Profile);
      expect(result.current.workouts).toEqual(s2Workouts);
    });

    it("invalidates in-flight optimistic writes when retrySync() is invoked mid-write so late resolve/reject cannot overwrite freshly hydrated state", async () => {
      firestoreServiceMock.getUserData.mockResolvedValueOnce({
        plan: { programName: "Initial", weeks: [] },
        profile: { goal: "initial" },
      });
      firestoreServiceMock.getWorkouts.mockResolvedValueOnce([
        makeWorkout("w-0"),
      ]);

      const { result } = renderHook(() =>
        useUserData({ uid: "user-retry-midwrite" })
      );

      await waitFor(() => {
        expect(result.current.status).toBe("ready");
      });

      const updResolve = createDeferred();
      const updReject = createDeferred();
      const addResolve = createDeferred();
      const addReject = createDeferred();
      firestoreServiceMock.saveUserData
        .mockReturnValueOnce(updResolve.promise)
        .mockReturnValueOnce(updReject.promise);
      firestoreServiceMock.addWorkout
        .mockReturnValueOnce(addResolve.promise)
        .mockReturnValueOnce(addReject.promise);

      let p1;
      let p2;
      let p3;
      let p4;
      act(() => {
        p1 = result.current.updatePlan({ programName: "Pre-Retry 1", weeks: [] });
        p2 = result.current.updatePlan({ programName: "Pre-Retry 2", weeks: [] });
        p3 = result.current.addWorkout({
          weekNumber: 1,
          dayNumber: 1,
          dayName: "Monday",
          focus: "Push",
          logs: [],
          duration: 600,
          completedAt: "2026-11-24T10:00:00.000Z",
        });
        p4 = result.current.addWorkout({
          weekNumber: 1,
          dayNumber: 2,
          dayName: "Tuesday",
          focus: "Pull",
          logs: [],
          duration: 600,
          completedAt: "2026-11-24T11:00:00.000Z",
        });
      });
      const caught2 = p2.catch((err) => err);
      const caught4 = p4.catch((err) => err);

      const freshPlan = { programName: "Fresh Cloud Plan", weeks: [] };
      const freshProfile = { goal: "Fresh Goal" };
      const freshWorkouts = [makeWorkout("w-fresh")];
      const retryUserDeferred = createDeferred();
      firestoreServiceMock.getUserData.mockReturnValueOnce(
        retryUserDeferred.promise
      );
      firestoreServiceMock.getWorkouts.mockResolvedValueOnce(freshWorkouts);

      act(() => {
        result.current.retrySync();
      });

      expect(result.current.status).toBe("loading");

      await act(async () => {
        retryUserDeferred.resolve({
          plan: freshPlan,
          profile: freshProfile,
        });
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(result.current.status).toBe("ready");
        expect(result.current.plan).toEqual(freshPlan);
      });

      await act(async () => {
        updResolve.resolve(undefined);
        addResolve.resolve(makeWorkout("w-stale-retry"));
        updReject.reject(new Error("Pre-retry update rejected"));
        addReject.reject(new Error("Pre-retry add rejected"));
        await Promise.all([p1, p3]);
      });

      expect((await caught2).message).toBe("Pre-retry update rejected");
      expect((await caught4).message).toBe("Pre-retry add rejected");
      expect(result.current.plan).toEqual(freshPlan);
      expect(result.current.profile).toEqual(freshProfile);
      expect(result.current.workouts).toEqual(freshWorkouts);
    });

    it("invalidates in-flight optimistic writes when clearLocalData() is invoked mid-write so late resolve/reject cannot resurrect cleared data", async () => {
      firestoreServiceMock.getUserData.mockResolvedValueOnce({
        plan: { programName: "Before Clear", weeks: [] },
        profile: { goal: "strength" },
      });
      firestoreServiceMock.getWorkouts.mockResolvedValueOnce([
        makeWorkout("w-before"),
      ]);

      const { result } = renderHook(() =>
        useUserData({ uid: "user-clear-midwrite" })
      );

      await waitFor(() => {
        expect(result.current.status).toBe("ready");
      });

      const updResolve = createDeferred();
      const updReject = createDeferred();
      const addResolve = createDeferred();
      const addReject = createDeferred();
      firestoreServiceMock.saveUserData
        .mockReturnValueOnce(updResolve.promise)
        .mockReturnValueOnce(updReject.promise);
      firestoreServiceMock.addWorkout
        .mockReturnValueOnce(addResolve.promise)
        .mockReturnValueOnce(addReject.promise);

      let p1;
      let p2;
      let p3;
      let p4;
      act(() => {
        p1 = result.current.updatePlan({ programName: "Optimistic 1", weeks: [] });
        p2 = result.current.updatePlan({ programName: "Optimistic 2", weeks: [] });
        p3 = result.current.addWorkout({
          weekNumber: 1,
          dayNumber: 1,
          dayName: "Monday",
          focus: "Push",
          logs: [],
          duration: 600,
          completedAt: "2026-11-24T10:00:00.000Z",
        });
        p4 = result.current.addWorkout({
          weekNumber: 1,
          dayNumber: 2,
          dayName: "Tuesday",
          focus: "Pull",
          logs: [],
          duration: 600,
          completedAt: "2026-11-24T11:00:00.000Z",
        });
      });
      const caught2 = p2.catch((err) => err);
      const caught4 = p4.catch((err) => err);

      act(() => {
        result.current.clearLocalData();
      });

      expect(result.current.plan).toBeNull();
      expect(result.current.profile).toBeNull();
      expect(result.current.workouts).toEqual([]);

      await act(async () => {
        updResolve.resolve(undefined);
        addResolve.resolve(makeWorkout("w-late-after-clear"));
        updReject.reject(new Error("Pre-clear update failed"));
        addReject.reject(new Error("Pre-clear add failed"));
        await Promise.all([p1, p3]);
      });

      expect((await caught2).message).toBe("Pre-clear update failed");
      expect((await caught4).message).toBe("Pre-clear add failed");
      expect(result.current.plan).toBeNull();
      expect(result.current.profile).toBeNull();
      expect(result.current.workouts).toEqual([]);
    });
  });

  describe("sync guards on write mutations", () => {
    it("rejects savePlan, updatePlan, addWorkout, and resetProgram with pending error before any optimistic mutation and with zero Firestore writes while status is loading", async () => {
      const initialPlan = { programName: "Existing", weeks: [] };
      const initialProfile = { goal: "muscle" };
      const initialWorkouts = [makeWorkout("w-existing")];
      firestoreServiceMock.getUserData.mockResolvedValueOnce({
        plan: initialPlan,
        profile: initialProfile,
      });
      firestoreServiceMock.getWorkouts.mockResolvedValueOnce(initialWorkouts);

      const { result } = renderHook(() => useUserData({ uid: "user-loading" }));
      await waitFor(() => {
        expect(result.current.status).toBe("ready");
      });

      // Trigger retrySync to enter status === "loading" while existing data is hydrated
      const pendingSync = createDeferred();
      firestoreServiceMock.getUserData.mockReturnValueOnce(pendingSync.promise);
      act(() => {
        result.current.retrySync();
      });
      expect(result.current.status).toBe("loading");
      expect(result.current.error).toBeNull();
      expect(result.current.syncError).toBeNull();

      await expect(
        result.current.savePlan({ programName: "P", weeks: [] }, { goal: "g" })
      ).rejects.toThrow(SYNC_PENDING_ERROR);
      expect(result.current.plan).toEqual(initialPlan);
      expect(result.current.profile).toEqual(initialProfile);
      expect(result.current.workouts).toEqual(initialWorkouts);

      await expect(
        result.current.updatePlan({ programName: "P2", weeks: [] })
      ).rejects.toThrow(SYNC_PENDING_ERROR);
      expect(result.current.plan).toEqual(initialPlan);

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
      expect(result.current.workouts).toEqual(initialWorkouts);

      await expect(result.current.resetProgram()).rejects.toThrow(
        SYNC_PENDING_ERROR
      );
      expect(result.current.plan).toEqual(initialPlan);
      expect(result.current.profile).toEqual(initialProfile);

      expect(firestoreServiceMock.saveUserData).not.toHaveBeenCalled();
      expect(firestoreServiceMock.addWorkout).not.toHaveBeenCalled();
      expect(firestoreServiceMock.resetUserProgram).not.toHaveBeenCalled();
    });

    it("rejects savePlan, updatePlan, addWorkout, and resetProgram with operation-specific sync-failed errors before any optimistic mutation when status is error", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const initialPlan = { programName: "Existing", weeks: [] };
      const initialProfile = { goal: "muscle" };
      const initialWorkouts = [makeWorkout("w-existing")];
      firestoreServiceMock.getUserData.mockResolvedValueOnce({
        plan: initialPlan,
        profile: initialProfile,
      });
      firestoreServiceMock.getWorkouts.mockResolvedValueOnce(initialWorkouts);

      try {
        const { result } = renderHook(() => useUserData({ uid: "user-failed" }));
        await waitFor(() => {
          expect(result.current.status).toBe("ready");
        });

        const syncFailure = new Error("Offline");
        firestoreServiceMock.getUserData.mockRejectedValueOnce(syncFailure);
        act(() => {
          result.current.retrySync();
        });

        await waitFor(() => {
          expect(result.current.status).toBe("error");
        });
        expect(result.current.error).toBe(syncFailure);
        expect(result.current.syncError).toBe(syncFailure);

        await expect(
          result.current.savePlan({ programName: "P", weeks: [] }, { goal: "g" })
        ).rejects.toThrow(SYNC_FAILED_SAVE_PLAN);
        expect(result.current.plan).toEqual(initialPlan);
        expect(result.current.profile).toEqual(initialProfile);

        await expect(
          result.current.updatePlan({ programName: "P2", weeks: [] })
        ).rejects.toThrow(SYNC_FAILED_DEFAULT);
        expect(result.current.plan).toEqual(initialPlan);

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
        expect(result.current.workouts).toEqual(initialWorkouts);

        await expect(result.current.resetProgram()).rejects.toThrow(
          SYNC_FAILED_RESET
        );
        expect(result.current.plan).toEqual(initialPlan);
        expect(result.current.profile).toEqual(initialProfile);

        expect(firestoreServiceMock.saveUserData).not.toHaveBeenCalled();
        expect(firestoreServiceMock.addWorkout).not.toHaveBeenCalled();
        expect(firestoreServiceMock.resetUserProgram).not.toHaveBeenCalled();
      } finally {
        consoleErrorSpy.mockRestore();
      }
    });
  });

  describe("optimistic mutations, rollback, deleteAll, and clearLocalData", () => {
    it("savePlan applies immediate optimistic update (preserving workouts), resolves to { plan, profile }, and rolls back cleanly while rethrowing on failure", async () => {
      const initialWorkout = makeWorkout("w-1");
      const oldPlan = { programName: "Old", weeks: [] };
      const oldProfile = { goal: "old" };
      firestoreServiceMock.getUserData.mockResolvedValueOnce({
        plan: oldPlan,
        profile: oldProfile,
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
      let pending;
      act(() => {
        pending = result.current.savePlan(nextPlan, nextProfile);
      });

      // Optimistic state MUST be visible immediately before Firestore resolves
      expect(result.current.plan).toEqual(nextPlan);
      expect(result.current.profile).toEqual(nextProfile);
      expect(result.current.workouts).toEqual([initialWorkout]);

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

      // Failure shows optimistic state while in flight, then rolls back cleanly & rethrows
      const failDeferred = createDeferred();
      firestoreServiceMock.saveUserData.mockReturnValueOnce(
        failDeferred.promise
      );
      const brokenPlan = { programName: "Broken", weeks: [] };
      const brokenProfile = { goal: "broken" };

      let pendingFail;
      act(() => {
        pendingFail = result.current.savePlan(brokenPlan, brokenProfile);
      });
      const caughtFail = pendingFail.catch((err) => err);

      expect(result.current.plan).toEqual(brokenPlan);
      expect(result.current.profile).toEqual(brokenProfile);
      expect(result.current.workouts).toEqual([initialWorkout]);

      await act(async () => {
        failDeferred.reject(new Error("Save failed"));
        await caughtFail;
      });

      expect((await caughtFail).message).toBe("Save failed");
      expect(result.current.plan).toEqual(nextPlan);
      expect(result.current.profile).toEqual(nextProfile);
      expect(result.current.workouts).toEqual([initialWorkout]);
    });

    it("updatePlan applies immediate optimistic update (preserving profile & workouts), resolves to nextPlan, and rolls back cleanly while rethrowing on failure", async () => {
      const initialWorkout = makeWorkout("w-1");
      const initialProfile = { goal: "hypertrophy" };
      firestoreServiceMock.getUserData.mockResolvedValueOnce({
        plan: { programName: "V1", weeks: [] },
        profile: initialProfile,
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
      let pending;
      act(() => {
        pending = result.current.updatePlan(updatedPlan);
      });

      // Optimistic plan MUST be visible immediately while preserving profile and workouts
      expect(result.current.plan).toEqual(updatedPlan);
      expect(result.current.profile).toEqual(initialProfile);
      expect(result.current.workouts).toEqual([initialWorkout]);

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
      expect(result.current.profile).toEqual(initialProfile);
      expect(result.current.workouts).toEqual([initialWorkout]);

      // Failure shows optimistic state while pending, then rolls back cleanly & rethrows
      const failDeferred = createDeferred();
      firestoreServiceMock.saveUserData.mockReturnValueOnce(
        failDeferred.promise
      );
      const v3Plan = { programName: "V3", weeks: [] };

      let pendingFail;
      act(() => {
        pendingFail = result.current.updatePlan(v3Plan);
      });
      const caughtFail = pendingFail.catch((err) => err);

      expect(result.current.plan).toEqual(v3Plan);
      expect(result.current.profile).toEqual(initialProfile);

      await act(async () => {
        failDeferred.reject(new Error("Update rejected"));
        await caughtFail;
      });

      expect((await caughtFail).message).toBe("Update rejected");
      expect(result.current.plan).toEqual(updatedPlan);
      expect(result.current.profile).toEqual(initialProfile);
      expect(result.current.workouts).toEqual([initialWorkout]);
    });

    it("addWorkout appends normalized optimistic entry with __optimistic_workout_* ID, forwards verbatim payload, reconciles in place on resolve, and removes only temp entry on reject", async () => {
      const existingWorkout = makeWorkout("w-existing");
      const existingPlan = { programName: "PPL", weeks: [] };
      const existingProfile = { goal: "strength" };
      firestoreServiceMock.getUserData.mockResolvedValueOnce({
        plan: existingPlan,
        profile: existingProfile,
      });
      firestoreServiceMock.getWorkouts.mockResolvedValueOnce([existingWorkout]);

      const { result } = renderHook(() => useUserData({ uid: "user-add" }));
      await waitFor(() => {
        expect(result.current.status).toBe("ready");
      });

      const addDeferred = createDeferred();
      firestoreServiceMock.addWorkout.mockReturnValueOnce(addDeferred.promise);

      // Legacy nested payload input verifies 7-field optimistic normalization while preserving verbatim payload forwarding
      const nestedPayload = {
        workout: {
          weekNumber: 2,
          dayNumber: 3,
          dayName: "Friday",
          focus: "Legs",
          date: "2026-11-24T10:00:00.000Z",
        },
        logs: [{ name: "Squat", sets: [{ weight: 100, reps: 5 }] }],
        duration: 1200,
      };
      const payloadSnapshot = structuredClone(nestedPayload);

      let pending;
      act(() => {
        pending = result.current.addWorkout(nestedPayload);
      });

      // Immediately visible with __optimistic_workout_* ID and canonical 7 flat fields
      expect(result.current.workouts).toHaveLength(2);
      expect(result.current.workouts[0]).toEqual(existingWorkout);
      const optimisticItem = result.current.workouts[1];
      expect(optimisticItem.id).toMatch(/^__optimistic_workout_\d+$/);
      expect(optimisticItem).toEqual({
        id: optimisticItem.id,
        weekNumber: 2,
        dayNumber: 3,
        dayName: "Friday",
        focus: "Legs",
        logs: nestedPayload.logs,
        duration: 1200,
        completedAt: "2026-11-24T10:00:00.000Z",
      });
      expect(result.current.plan).toEqual(existingPlan);
      expect(result.current.profile).toEqual(existingProfile);

      // Original payload forwarded verbatim without mutation (no id attached)
      expect(firestoreServiceMock.addWorkout).toHaveBeenCalledWith(
        "user-add",
        nestedPayload
      );
      expect(nestedPayload).toEqual(payloadSnapshot);
      expect("id" in nestedPayload).toBe(false);

      const savedDoc = {
        id: "doc-123",
        weekNumber: 2,
        dayNumber: 3,
        dayName: "Friday",
        focus: "Legs",
        logs: nestedPayload.logs,
        duration: 1200,
        completedAt: "2026-11-24T10:00:00.000Z",
      };
      let returned;
      await act(async () => {
        addDeferred.resolve(savedDoc);
        returned = await pending;
      });

      expect(returned).toEqual(savedDoc);
      expect(result.current.workouts).toEqual([existingWorkout, savedDoc]);

      // Rejection shows optimistic item while pending, then removes ONLY that temp item & rethrows
      const failDeferred = createDeferred();
      firestoreServiceMock.addWorkout.mockReturnValueOnce(failDeferred.promise);
      const flatPayload = {
        weekNumber: 2,
        dayNumber: 4,
        dayName: "Saturday",
        focus: "Arms",
        logs: [],
        duration: 900,
        completedAt: "2026-11-25T10:00:00.000Z",
      };

      let pendingFail;
      act(() => {
        pendingFail = result.current.addWorkout(flatPayload);
      });
      const caughtFail = pendingFail.catch((err) => err);

      expect(result.current.workouts).toHaveLength(3);
      expect(result.current.workouts[2].id).toMatch(/^__optimistic_workout_\d+$/);
      expect(result.current.workouts[2].id).not.toBe(optimisticItem.id);

      await act(async () => {
        failDeferred.reject(new Error("Workout write failed"));
        await caughtFail;
      });

      expect((await caughtFail).message).toBe("Workout write failed");
      expect(result.current.workouts).toEqual([existingWorkout, savedDoc]);
    });

    it("resetProgram optimistically clears plan and profile (preserving workouts), restores on failure, and keeps cleared on resolve", async () => {
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

      // Reject case: optimistically cleared while pending, restored on reject
      const failDeferred = createDeferred();
      firestoreServiceMock.resetUserProgram.mockReturnValueOnce(
        failDeferred.promise
      );

      let pendingFail;
      act(() => {
        pendingFail = result.current.resetProgram();
      });
      const caughtFail = pendingFail.catch((err) => err);

      expect(result.current.plan).toBeNull();
      expect(result.current.profile).toBeNull();
      expect(result.current.workouts).toEqual(existingWorkouts);

      await act(async () => {
        failDeferred.reject(new Error("Reset denied"));
        await caughtFail;
      });

      expect((await caughtFail).message).toBe("Reset denied");
      expect(result.current.plan).toEqual(existingPlan);
      expect(result.current.profile).toEqual(existingProfile);
      expect(result.current.workouts).toEqual(existingWorkouts);

      // Resolve case: optimistically cleared while pending and remains cleared on resolve
      const resetDeferred = createDeferred();
      firestoreServiceMock.resetUserProgram.mockReturnValueOnce(
        resetDeferred.promise
      );

      let pendingReset;
      act(() => {
        pendingReset = result.current.resetProgram();
      });

      expect(result.current.plan).toBeNull();
      expect(result.current.profile).toBeNull();
      expect(result.current.workouts).toEqual(existingWorkouts);

      let resolvedValue;
      await act(async () => {
        resetDeferred.resolve(undefined);
        resolvedValue = await pendingReset;
      });

      expect(resolvedValue).toBeUndefined();
      expect(firestoreServiceMock.resetUserProgram).toHaveBeenCalledWith(
        "user-reset"
      );
      expect(result.current.plan).toBeNull();
      expect(result.current.profile).toBeNull();
      expect(result.current.workouts).toEqual(existingWorkouts);
    });

    it("deleteAll remains non-optimistic, bypasses sync guards, preserves state on failure, clears on resolve, and invalidates earlier in-flight optimistic writes", async () => {
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

        // Non-optimistic behavior, failure preservation, and epoch invalidation on resolve
        const initialPlan = { programName: "PPL", weeks: [] };
        const initialProfile = { goal: "muscle" };
        const initialWorkout = makeWorkout("w-1");
        firestoreServiceMock.getUserData.mockResolvedValueOnce({
          plan: initialPlan,
          profile: initialProfile,
        });
        firestoreServiceMock.getWorkouts.mockResolvedValueOnce([
          initialWorkout,
        ]);

        const readyHook = renderHook(() =>
          useUserData({ uid: "user-del-ready" })
        );
        await waitFor(() => {
          expect(readyHook.result.current.status).toBe("ready");
        });

        // Rejection leaves state completely untouched
        firestoreServiceMock.deleteUserData.mockRejectedValueOnce(
          new Error("Delete failed")
        );
        await expect(readyHook.result.current.deleteAll()).rejects.toThrow(
          "Delete failed"
        );
        expect(readyHook.result.current.plan).toEqual(initialPlan);
        expect(readyHook.result.current.profile).toEqual(initialProfile);
        expect(readyHook.result.current.workouts).toEqual([initialWorkout]);

        // Start in-flight optimistic writes BEFORE deleteAll
        const updResolveDeferred = createDeferred();
        const updRejectDeferred = createDeferred();
        const addResolveDeferred = createDeferred();
        const addRejectDeferred = createDeferred();
        firestoreServiceMock.saveUserData
          .mockReturnValueOnce(updResolveDeferred.promise)
          .mockReturnValueOnce(updRejectDeferred.promise);
        firestoreServiceMock.addWorkout
          .mockReturnValueOnce(addResolveDeferred.promise)
          .mockReturnValueOnce(addRejectDeferred.promise);

        let pUpd1;
        let pUpd2;
        let pAdd1;
        let pAdd2;
        act(() => {
          pUpd1 = readyHook.result.current.updatePlan({
            programName: "Pre-Delete 1",
            weeks: [],
          });
          pUpd2 = readyHook.result.current.updatePlan({
            programName: "Pre-Delete 2",
            weeks: [],
          });
          pAdd1 = readyHook.result.current.addWorkout({
            weekNumber: 1,
            dayNumber: 1,
            dayName: "Monday",
            focus: "Push",
            logs: [],
            duration: 600,
            completedAt: "2026-11-24T10:00:00.000Z",
          });
          pAdd2 = readyHook.result.current.addWorkout({
            weekNumber: 1,
            dayNumber: 2,
            dayName: "Tuesday",
            focus: "Pull",
            logs: [],
            duration: 600,
            completedAt: "2026-11-24T11:00:00.000Z",
          });
        });
        const caughtUpd2 = pUpd2.catch((err) => err);
        const caughtAdd2 = pAdd2.catch((err) => err);

        // Start deleteAll: MUST NOT clear state while pending
        const delDeferred = createDeferred();
        firestoreServiceMock.deleteUserData.mockReturnValueOnce(
          delDeferred.promise
        );
        let pendingDel;
        act(() => {
          pendingDel = readyHook.result.current.deleteAll();
        });
        expect(readyHook.result.current.plan).not.toBeNull();
        expect(readyHook.result.current.profile).not.toBeNull();
        expect(readyHook.result.current.workouts.length).toBeGreaterThan(0);

        // Resolve deleteAll: clears all 3 slices and bumps epoch
        let readyDelResult;
        await act(async () => {
          delDeferred.resolve({ deletedWorkoutsCount: 1 });
          readyDelResult = await pendingDel;
        });

        expect(readyDelResult).toEqual({ deletedWorkoutsCount: 1 });
        expect(readyHook.result.current.plan).toBeNull();
        expect(readyHook.result.current.profile).toBeNull();
        expect(readyHook.result.current.workouts).toEqual([]);

        // Late settlement (both resolve and reject) of earlier writes MUST NOT resurrect deleted data
        await act(async () => {
          updResolveDeferred.resolve(undefined);
          addResolveDeferred.resolve(makeWorkout("w-zombie"));
          updRejectDeferred.reject(new Error("Pre-delete update failed"));
          addRejectDeferred.reject(new Error("Pre-delete add failed"));
          await Promise.all([pUpd1, pAdd1]);
        });

        expect((await caughtUpd2).message).toBe("Pre-delete update failed");
        expect((await caughtAdd2).message).toBe("Pre-delete add failed");
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

  describe("concurrent and out-of-order optimistic writes", () => {
    const P0 = { programName: "P0", weeks: [] };
    const P1 = { programName: "P1", weeks: [{ weekNumber: 1 }] };
    const P2 = { programName: "P2", weeks: [{ weekNumber: 1 }, { weekNumber: 2 }] };
    const P3 = { programName: "P3", weeks: [{ weekNumber: 1 }, { weekNumber: 2 }, { weekNumber: 3 }] };
    const PR0 = { goal: "Initial Goal" };
    const PR1 = { goal: "New Goal" };

    async function renderSyncedHook(
      uid,
      { plan = P0, profile = PR0, workouts = [makeWorkout("w-0")] } = {}
    ) {
      firestoreServiceMock.getUserData.mockResolvedValueOnce({
        plan,
        profile,
      });
      firestoreServiceMock.getWorkouts.mockResolvedValueOnce(workouts);

      const hook = renderHook(() => useUserData({ uid }));
      await waitFor(() => {
        expect(hook.result.current.status).toBe("ready");
      });
      return hook;
    }

    it("overlapping updatePlan #1 fails, #2 succeeds: #1 failure never clobbers #2", async () => {
      const { result } = await renderSyncedHook("user-c1");
      const d1 = createDeferred();
      const d2 = createDeferred();
      firestoreServiceMock.saveUserData
        .mockReturnValueOnce(d1.promise)
        .mockReturnValueOnce(d2.promise);

      let p1;
      let p2;
      act(() => {
        p1 = result.current.updatePlan(P1);
      });
      expect(result.current.plan).toEqual(P1);

      act(() => {
        p2 = result.current.updatePlan(P2);
      });
      expect(result.current.plan).toEqual(P2);

      const caught1 = p1.catch((err) => err);

      await act(async () => {
        d1.reject(new Error("Write 1 failed"));
        await caught1;
      });
      expect((await caught1).message).toBe("Write 1 failed");
      // #1 failed, but #2 is still pending -> MUST remain P2
      expect(result.current.plan).toEqual(P2);

      await act(async () => {
        d2.resolve(undefined);
        await p2;
      });
      expect(result.current.plan).toEqual(P2);
      expect(result.current.profile).toEqual(PR0);
    });

    it("overlapping updatePlan #1 succeeds, #2 fails: #2 rolls back to committed P1 (not initial P0)", async () => {
      const { result } = await renderSyncedHook("user-c2");
      const d1 = createDeferred();
      const d2 = createDeferred();
      firestoreServiceMock.saveUserData
        .mockReturnValueOnce(d1.promise)
        .mockReturnValueOnce(d2.promise);

      let p1;
      let p2;
      act(() => {
        p1 = result.current.updatePlan(P1);
        p2 = result.current.updatePlan(P2);
      });
      const caught2 = p2.catch((err) => err);
      expect(result.current.plan).toEqual(P2);

      await act(async () => {
        d1.resolve(undefined);
        await p1;
      });
      expect(result.current.plan).toEqual(P2);

      await act(async () => {
        d2.reject(new Error("Write 2 failed"));
        await caught2;
      });
      expect((await caught2).message).toBe("Write 2 failed");
      expect(result.current.plan).toEqual(P1);
      expect(result.current.profile).toEqual(PR0);
    });

    it("overlapping updatePlan #2 fails first then #1 fails: rolls back to P1 then P0", async () => {
      const { result } = await renderSyncedHook("user-c3");
      const d1 = createDeferred();
      const d2 = createDeferred();
      firestoreServiceMock.saveUserData
        .mockReturnValueOnce(d1.promise)
        .mockReturnValueOnce(d2.promise);

      let p1;
      let p2;
      act(() => {
        p1 = result.current.updatePlan(P1);
        p2 = result.current.updatePlan(P2);
      });
      const caught1 = p1.catch((err) => err);
      const caught2 = p2.catch((err) => err);
      expect(result.current.plan).toEqual(P2);

      await act(async () => {
        d2.reject(new Error("Write 2 failed"));
        await caught2;
      });
      expect(result.current.plan).toEqual(P1);

      await act(async () => {
        d1.reject(new Error("Write 1 failed"));
        await caught1;
      });
      expect(result.current.plan).toEqual(P0);
    });

    it("overlapping updatePlan #2 succeeds before #1 settles: keeps P2 whether #1 resolves or rejects and does not regress committedPlanId", async () => {
      // Subcase A: #2 resolves first, then #1 resolves late
      const hookA = await renderSyncedHook("user-c4a");
      const d1a = createDeferred();
      const d2a = createDeferred();
      const d3a = createDeferred();
      firestoreServiceMock.saveUserData
        .mockReturnValueOnce(d1a.promise)
        .mockReturnValueOnce(d2a.promise)
        .mockReturnValueOnce(d3a.promise);

      let p1a;
      let p2a;
      act(() => {
        p1a = hookA.result.current.updatePlan(P1);
        p2a = hookA.result.current.updatePlan(P2);
      });

      await act(async () => {
        d2a.resolve(undefined);
        await p2a;
      });
      expect(hookA.result.current.plan).toEqual(P2);

      await act(async () => {
        d1a.resolve(undefined);
        await p1a;
      });
      expect(hookA.result.current.plan).toEqual(P2);

      // Verify committed baseline stayed P2 (a subsequent failing P3 rolls back to P2, NOT P1)
      let p3a;
      act(() => {
        p3a = hookA.result.current.updatePlan(P3);
      });
      const caught3a = p3a.catch((err) => err);
      expect(hookA.result.current.plan).toEqual(P3);

      await act(async () => {
        d3a.reject(new Error("Write 3 failed"));
        await caught3a;
      });
      expect(hookA.result.current.plan).toEqual(P2);

      // Subcase B: #2 resolves first, then #1 rejects late
      const hookB = await renderSyncedHook("user-c4b");
      const d1b = createDeferred();
      const d2b = createDeferred();
      firestoreServiceMock.saveUserData
        .mockReturnValueOnce(d1b.promise)
        .mockReturnValueOnce(d2b.promise);

      let p1b;
      let p2b;
      act(() => {
        p1b = hookB.result.current.updatePlan(P1);
        p2b = hookB.result.current.updatePlan(P2);
      });
      const caught1b = p1b.catch((err) => err);

      await act(async () => {
        d2b.resolve(undefined);
        await p2b;
      });
      expect(hookB.result.current.plan).toEqual(P2);

      await act(async () => {
        d1b.reject(new Error("Stale write 1 failed"));
        await caught1b;
      });
      expect((await caught1b).message).toBe("Stale write 1 failed");
      expect(hookB.result.current.plan).toEqual(P2);
    });

    it("overlapping updatePlan (#1) + resetProgram (#2): handles #1 fail/#2 succeed, #1 succeed/#2 fail, and #2 succeed first", async () => {
      const existingWorkouts = [makeWorkout("w-keep")];

      // Subcase 1: #1 fails, #2 succeeds -> { null, null } with workouts preserved
      const h1 = await renderSyncedHook("user-ur1", { workouts: existingWorkouts });
      const u1 = createDeferred();
      const r1 = createDeferred();
      firestoreServiceMock.saveUserData.mockReturnValueOnce(u1.promise);
      firestoreServiceMock.resetUserProgram.mockReturnValueOnce(r1.promise);

      let pu1;
      let pr1;
      act(() => {
        pu1 = h1.result.current.updatePlan(P1);
      });
      expect(h1.result.current.plan).toEqual(P1);
      expect(h1.result.current.profile).toEqual(PR0);

      act(() => {
        pr1 = h1.result.current.resetProgram();
      });
      expect(h1.result.current.plan).toBeNull();
      expect(h1.result.current.profile).toBeNull();
      expect(h1.result.current.workouts).toEqual(existingWorkouts);

      const caughtU1 = pu1.catch((err) => err);
      await act(async () => {
        u1.reject(new Error("U1 failed"));
        await caughtU1;
      });
      expect(h1.result.current.plan).toBeNull();
      expect(h1.result.current.profile).toBeNull();

      await act(async () => {
        r1.resolve(undefined);
        await pr1;
      });
      expect(h1.result.current.plan).toBeNull();
      expect(h1.result.current.profile).toBeNull();
      expect(h1.result.current.workouts).toEqual(existingWorkouts);

      // Subcase 2: #1 succeeds, #2 fails -> { P1, PR0 } with workouts preserved
      const h2 = await renderSyncedHook("user-ur2", { workouts: existingWorkouts });
      const u2 = createDeferred();
      const r2 = createDeferred();
      firestoreServiceMock.saveUserData.mockReturnValueOnce(u2.promise);
      firestoreServiceMock.resetUserProgram.mockReturnValueOnce(r2.promise);

      let pu2;
      let pr2;
      act(() => {
        pu2 = h2.result.current.updatePlan(P1);
        pr2 = h2.result.current.resetProgram();
      });
      const caughtR2 = pr2.catch((err) => err);

      await act(async () => {
        u2.resolve(undefined);
        await pu2;
      });
      expect(h2.result.current.plan).toBeNull();
      expect(h2.result.current.profile).toBeNull();

      await act(async () => {
        r2.reject(new Error("R2 failed"));
        await caughtR2;
      });
      expect(h2.result.current.plan).toEqual(P1);
      expect(h2.result.current.profile).toEqual(PR0);
      expect(h2.result.current.workouts).toEqual(existingWorkouts);

      // Subcase 3: #2 succeeds first, #1 resolves later -> { null, null } (committedPlanId = 2 > 1)
      const h3 = await renderSyncedHook("user-ur3", { workouts: existingWorkouts });
      const u3 = createDeferred();
      const r3 = createDeferred();
      firestoreServiceMock.saveUserData.mockReturnValueOnce(u3.promise);
      firestoreServiceMock.resetUserProgram.mockReturnValueOnce(r3.promise);

      let pu3;
      let pr3;
      act(() => {
        pu3 = h3.result.current.updatePlan(P1);
        pr3 = h3.result.current.resetProgram();
      });

      await act(async () => {
        r3.resolve(undefined);
        await pr3;
      });
      expect(h3.result.current.plan).toBeNull();
      expect(h3.result.current.profile).toBeNull();

      await act(async () => {
        u3.resolve(undefined);
        await pu3;
      });
      expect(h3.result.current.plan).toBeNull();
      expect(h3.result.current.profile).toBeNull();
      expect(h3.result.current.workouts).toEqual(existingWorkouts);
    });

    it("overlapping savePlan (#1) + updatePlan (#2): preserves profile when #1 succeeds/#2 fails, and preserves plan when #1 fails/#2 succeeds", async () => {
      // Subcase 1: #1 succeeds, #2 fails -> { P1, PR1 }
      const h1 = await renderSyncedHook("user-su1", { plan: null, profile: null });
      const s1 = createDeferred();
      const u1 = createDeferred();
      firestoreServiceMock.saveUserData
        .mockReturnValueOnce(s1.promise)
        .mockReturnValueOnce(u1.promise);

      let ps1;
      let pu1;
      act(() => {
        ps1 = h1.result.current.savePlan(P1, PR1);
        pu1 = h1.result.current.updatePlan(P2);
      });
      const caughtU1 = pu1.catch((err) => err);
      expect(h1.result.current.plan).toEqual(P2);
      expect(h1.result.current.profile).toEqual(PR1);

      await act(async () => {
        s1.resolve(undefined);
        await ps1;
      });
      await act(async () => {
        u1.reject(new Error("U1 failed"));
        await caughtU1;
      });
      expect(h1.result.current.plan).toEqual(P1);
      expect(h1.result.current.profile).toEqual(PR1);

      // Subcase 2: #1 fails, #2 succeeds -> { P2, null } (matches Firestore merge)
      const h2 = await renderSyncedHook("user-su2", { plan: null, profile: null });
      const s2 = createDeferred();
      const u2 = createDeferred();
      firestoreServiceMock.saveUserData
        .mockReturnValueOnce(s2.promise)
        .mockReturnValueOnce(u2.promise);

      let ps2;
      let pu2;
      act(() => {
        ps2 = h2.result.current.savePlan(P1, PR1);
        pu2 = h2.result.current.updatePlan(P2);
      });
      const caughtS2 = ps2.catch((err) => err);
      expect(h2.result.current.plan).toEqual(P2);
      expect(h2.result.current.profile).toEqual(PR1);

      await act(async () => {
        s2.reject(new Error("S2 failed"));
        await caughtS2;
      });
      expect(h2.result.current.plan).toEqual(P2);
      expect(h2.result.current.profile).toBeNull();

      await act(async () => {
        u2.resolve(undefined);
        await pu2;
      });
      expect(h2.result.current.plan).toEqual(P2);
      expect(h2.result.current.profile).toBeNull();
    });

    it("concurrent addWorkout #1 fails and #2 succeeds (both settlement orders): removes only #1 and reconciles #2 to Firestore ID", async () => {
      const existing = makeWorkout("w-base");
      const payloadA = {
        weekNumber: 1,
        dayNumber: 1,
        dayName: "Monday",
        focus: "Push",
        logs: [],
        duration: 1000,
        completedAt: "2026-11-24T10:00:00.000Z",
      };
      const payloadB = {
        weekNumber: 1,
        dayNumber: 2,
        dayName: "Tuesday",
        focus: "Pull",
        logs: [],
        duration: 1100,
        completedAt: "2026-11-24T11:00:00.000Z",
      };
      const docB = { id: "doc-B", ...payloadB };

      // Order 1: #1 fails first, #2 succeeds second
      const h1 = await renderSyncedHook("user-aw1", { workouts: [existing] });
      const dA1 = createDeferred();
      const dB1 = createDeferred();
      firestoreServiceMock.addWorkout
        .mockReturnValueOnce(dA1.promise)
        .mockReturnValueOnce(dB1.promise);

      let pA1;
      let pB1;
      act(() => {
        pA1 = h1.result.current.addWorkout(payloadA);
        pB1 = h1.result.current.addWorkout(payloadB);
      });
      const caughtA1 = pA1.catch((err) => err);

      expect(h1.result.current.workouts).toHaveLength(3);
      const temp1Id = h1.result.current.workouts[1].id;
      const temp2Id = h1.result.current.workouts[2].id;
      expect(temp1Id).toMatch(/^__optimistic_workout_\d+$/);
      expect(temp2Id).toMatch(/^__optimistic_workout_\d+$/);
      expect(temp1Id).not.toBe(temp2Id);

      await act(async () => {
        dA1.reject(new Error("Workout A failed"));
        await caughtA1;
      });
      expect(h1.result.current.workouts.map((w) => w.id)).toEqual([
        "w-base",
        temp2Id,
      ]);

      await act(async () => {
        dB1.resolve(docB);
        await pB1;
      });
      expect(h1.result.current.workouts).toEqual([existing, docB]);

      // Order 2: #2 succeeds first, #1 fails second
      const h2 = await renderSyncedHook("user-aw2", { workouts: [existing] });
      const dA2 = createDeferred();
      const dB2 = createDeferred();
      firestoreServiceMock.addWorkout
        .mockReturnValueOnce(dA2.promise)
        .mockReturnValueOnce(dB2.promise);

      let pA2;
      let pB2;
      act(() => {
        pA2 = h2.result.current.addWorkout(payloadA);
        pB2 = h2.result.current.addWorkout(payloadB);
      });
      const caughtA2 = pA2.catch((err) => err);
      expect(h2.result.current.workouts).toHaveLength(3);
      const tempA2Id = h2.result.current.workouts[1].id;

      await act(async () => {
        dB2.resolve(docB);
        await pB2;
      });
      expect(h2.result.current.workouts.map((w) => w.id)).toEqual([
        "w-base",
        tempA2Id,
        "doc-B",
      ]);

      await act(async () => {
        dA2.reject(new Error("Workout A failed late"));
        await caughtA2;
      });
      expect(h2.result.current.workouts).toEqual([existing, docB]);
    });

    it("concurrent addWorkout #1 and #2 resolving out-of-order (#2 before #1) reconcile in place preserving original order with zero duplicates", async () => {
      const existing = makeWorkout("w-base");
      const { result } = await renderSyncedHook("user-aw-ooo", {
        workouts: [existing],
      });

      const dA = createDeferred();
      const dB = createDeferred();
      firestoreServiceMock.addWorkout
        .mockReturnValueOnce(dA.promise)
        .mockReturnValueOnce(dB.promise);

      const payloadA = {
        weekNumber: 1,
        dayNumber: 1,
        dayName: "Monday",
        focus: "Push",
        logs: [],
        duration: 1000,
        completedAt: "2026-11-24T10:00:00.000Z",
      };
      const payloadB = {
        weekNumber: 1,
        dayNumber: 2,
        dayName: "Tuesday",
        focus: "Pull",
        logs: [],
        duration: 1100,
        completedAt: "2026-11-24T11:00:00.000Z",
      };
      const docA = { id: "doc-A", ...payloadA };
      const docB = { id: "doc-B", ...payloadB };

      let pA;
      let pB;
      act(() => {
        pA = result.current.addWorkout(payloadA);
        pB = result.current.addWorkout(payloadB);
      });
      expect(result.current.workouts).toHaveLength(3);
      const tempAId = result.current.workouts[1].id;

      // #2 resolves before #1
      await act(async () => {
        dB.resolve(docB);
        await pB;
      });
      expect(result.current.workouts.map((w) => w.id)).toEqual([
        "w-base",
        tempAId,
        "doc-B",
      ]);

      await act(async () => {
        dA.resolve(docA);
        await pA;
      });
      expect(result.current.workouts).toEqual([existing, docA, docB]);
    });

    it("concurrent addWorkout and updatePlan/resetProgram isolate doc and workout slices on resolve and rollback", async () => {
      const existing = makeWorkout("w-base");
      const { result } = await renderSyncedHook("user-slice-iso", {
        workouts: [existing],
      });

      const updDeferred = createDeferred();
      const addDeferred = createDeferred();
      firestoreServiceMock.saveUserData.mockReturnValueOnce(updDeferred.promise);
      firestoreServiceMock.addWorkout.mockReturnValueOnce(addDeferred.promise);

      const payloadA = {
        weekNumber: 1,
        dayNumber: 1,
        dayName: "Monday",
        focus: "Push",
        logs: [],
        duration: 900,
        completedAt: "2026-11-24T10:00:00.000Z",
      };
      const docA = { id: "doc-A", ...payloadA };

      let pUpd;
      let pAdd;
      act(() => {
        pUpd = result.current.updatePlan(P1);
        pAdd = result.current.addWorkout(payloadA);
      });
      const caughtUpd = pUpd.catch((err) => err);

      expect(result.current.plan).toEqual(P1);
      expect(result.current.workouts).toHaveLength(2);

      // updatePlan fails (rolls back plan), addWorkout succeeds (reconciles workout)
      await act(async () => {
        updDeferred.reject(new Error("Plan update failed"));
        await caughtUpd;
      });
      expect(result.current.plan).toEqual(P0);
      expect(result.current.workouts).toHaveLength(2);

      await act(async () => {
        addDeferred.resolve(docA);
        await pAdd;
      });
      expect(result.current.plan).toEqual(P0);
      expect(result.current.workouts).toEqual([existing, docA]);

      // Now run resetProgram (succeeds) + addWorkout (fails) concurrently
      const resetDeferred = createDeferred();
      const addFailDeferred = createDeferred();
      firestoreServiceMock.resetUserProgram.mockReturnValueOnce(
        resetDeferred.promise
      );
      firestoreServiceMock.addWorkout.mockReturnValueOnce(
        addFailDeferred.promise
      );

      let pReset;
      let pAddFail;
      act(() => {
        pReset = result.current.resetProgram();
        pAddFail = result.current.addWorkout({
          weekNumber: 1,
          dayNumber: 2,
          dayName: "Tuesday",
          focus: "Pull",
          logs: [],
          duration: 800,
          completedAt: "2026-11-24T11:00:00.000Z",
        });
      });
      const caughtAddFail = pAddFail.catch((err) => err);

      expect(result.current.plan).toBeNull();
      expect(result.current.profile).toBeNull();
      expect(result.current.workouts).toHaveLength(3);

      await act(async () => {
        resetDeferred.resolve(undefined);
        await pReset;
      });
      await act(async () => {
        addFailDeferred.reject(new Error("Add failed during reset"));
        await caughtAddFail;
      });

      expect(result.current.plan).toBeNull();
      expect(result.current.profile).toBeNull();
      expect(result.current.workouts).toEqual([existing, docA]);
    });
  });
});
