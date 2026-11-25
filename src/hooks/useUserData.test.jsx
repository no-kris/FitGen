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
  subscribeUserData: vi.fn(),
  subscribeWorkouts: vi.fn(),
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

function createSubscriptionHarness() {
  const userSubs = [];
  const workoutSubs = [];

  firestoreServiceMock.subscribeUserData.mockImplementation(
    (uid, onData, onError) => {
      const sub = {
        uid,
        onData,
        onError,
        unsub: vi.fn(),
        emit: (data) => {
          act(() => {
            onData(data);
          });
        },
        emitError: (err) => {
          act(() => {
            onError?.(err);
          });
        },
      };
      userSubs.push(sub);
      return sub.unsub;
    }
  );

  firestoreServiceMock.subscribeWorkouts.mockImplementation(
    (uid, onData, onError) => {
      const sub = {
        uid,
        onData,
        onError,
        unsub: vi.fn(),
        emit: (workouts) => {
          act(() => {
            onData(workouts);
          });
        },
        emitError: (err) => {
          act(() => {
            onError?.(err);
          });
        },
      };
      workoutSubs.push(sub);
      return sub.unsub;
    }
  );

  return {
    userSubs,
    workoutSubs,
    latestUserSub: () => {
      expect(userSubs.length).toBeGreaterThan(0);
      return userSubs[userSubs.length - 1];
    },
    latestWorkoutsSub: () => {
      expect(workoutSubs.length).toBeGreaterThan(0);
      return workoutSubs[workoutSubs.length - 1];
    },
    emitUser: (data) => {
      expect(userSubs.length).toBeGreaterThan(0);
      act(() => {
        userSubs[userSubs.length - 1].onData(data);
      });
    },
    emitUserError: (err) => {
      expect(userSubs.length).toBeGreaterThan(0);
      act(() => {
        userSubs[userSubs.length - 1].onError?.(err);
      });
    },
    emitWorkouts: (workouts) => {
      expect(workoutSubs.length).toBeGreaterThan(0);
      act(() => {
        workoutSubs[workoutSubs.length - 1].onData(workouts);
      });
    },
    emitWorkoutsError: (err) => {
      expect(workoutSubs.length).toBeGreaterThan(0);
      act(() => {
        workoutSubs[workoutSubs.length - 1].onError?.(err);
      });
    },
    emitInitial: (userData, workouts = []) => {
      expect(userSubs.length).toBeGreaterThan(0);
      act(() => {
        userSubs[userSubs.length - 1].onData(userData);
      });
      expect(workoutSubs.length).toBeGreaterThan(0);
      act(() => {
        workoutSubs[workoutSubs.length - 1].onData(workouts);
      });
    },
  };
}

describe("useUserData", () => {
  let subs;

  beforeEach(() => {
    vi.resetAllMocks();
    subs = createSubscriptionHarness();
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

      expect(firestoreServiceMock.subscribeUserData).not.toHaveBeenCalled();
      expect(firestoreServiceMock.subscribeWorkouts).not.toHaveBeenCalled();
      expect(firestoreServiceMock.getUserData).not.toHaveBeenCalled();
      expect(firestoreServiceMock.getWorkouts).not.toHaveBeenCalled();
      expect(firestoreServiceMock.migrateLegacyHistory).not.toHaveBeenCalled();
      expect(firestoreServiceMock.saveUserData).not.toHaveBeenCalled();
      expect(onSyncComplete).not.toHaveBeenCalled();
    });
  });

  describe("cloud sync lifecycle, migration, bootstrap, and retry", () => {
    it("starts in loading and transitions to ready only after subscribeUserData and subscribeWorkouts emit initial snapshots without resubscribing on onSyncComplete identity changes", () => {
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
      expect(firestoreServiceMock.subscribeUserData).toHaveBeenCalledTimes(1);
      expect(firestoreServiceMock.subscribeUserData).toHaveBeenCalledWith(
        "user-1",
        expect.any(Function),
        expect.any(Function)
      );
      expect(firestoreServiceMock.subscribeWorkouts).not.toHaveBeenCalled();

      const cloudPlan = { programName: "PPL", totalWeeks: 4, weeks: [] };
      const cloudProfile = { goal: "muscle" };
      subs.emitUser({ plan: cloudPlan, profile: cloudProfile });

      expect(firestoreServiceMock.subscribeWorkouts).toHaveBeenCalledTimes(1);
      expect(firestoreServiceMock.subscribeWorkouts).toHaveBeenCalledWith(
        "user-1",
        expect.any(Function),
        expect.any(Function)
      );
      expect(result.current.status).toBe("loading");
      expect(result.current.isSynced).toBe(false);

      // Update callback reference before workouts snapshot arrives
      rerender({ onSyncComplete: secondCallback });

      const cloudWorkouts = [makeWorkout("w-1")];
      subs.emitWorkouts(cloudWorkouts);

      expect(result.current.status).toBe("ready");
      expect(result.current.isSynced).toBe(true);
      expect(result.current.error).toBeNull();
      expect(result.current.syncError).toBeNull();
      expect(result.current.profile).toEqual(cloudProfile);
      expect(result.current.plan).toEqual(cloudPlan);
      expect(result.current.workouts).toEqual(cloudWorkouts);
      expect(firestoreServiceMock.migrateLegacyHistory).not.toHaveBeenCalled();
      expect(firestoreServiceMock.getUserData).not.toHaveBeenCalled();
      expect(firestoreServiceMock.getWorkouts).not.toHaveBeenCalled();
      expect(firstCallback).not.toHaveBeenCalled();
      expect(secondCallback).toHaveBeenCalledTimes(1);
      expect(secondCallback).toHaveBeenCalledWith(true);

      // Changing onSyncComplete again must NOT unsubscribe or re-subscribe
      rerender({ onSyncComplete: vi.fn() });
      expect(firestoreServiceMock.subscribeUserData).toHaveBeenCalledTimes(1);
      expect(firestoreServiceMock.subscribeWorkouts).toHaveBeenCalledTimes(1);
      expect(subs.latestUserSub().unsub).not.toHaveBeenCalled();
      expect(subs.latestWorkoutsSub().unsub).not.toHaveBeenCalled();
    });

    it("runs migrateLegacyHistory strictly after initial subscribeUserData snapshot and before subscribeWorkouts when cloud doc has legacy history array", async () => {
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

      const origSubUser = firestoreServiceMock.subscribeUserData.getMockImplementation();
      const origSubWorkouts = firestoreServiceMock.subscribeWorkouts.getMockImplementation();
      firestoreServiceMock.subscribeUserData.mockImplementationOnce(
        (uid, onData, onError) => {
          callOrder.push("subscribeUserData");
          return origSubUser(uid, onData, onError);
        }
      );
      firestoreServiceMock.subscribeWorkouts.mockImplementationOnce(
        (uid, onData, onError) => {
          callOrder.push("subscribeWorkouts");
          return origSubWorkouts(uid, onData, onError);
        }
      );

      const migrateDeferred = createDeferred();
      firestoreServiceMock.migrateLegacyHistory.mockImplementationOnce(() => {
        callOrder.push("migrateLegacyHistory");
        return migrateDeferred.promise;
      });

      const user = { uid: "user-legacy" };
      const { result } = renderHook(() => useUserData(user));

      subs.emitUser({
        profile: { goal: "strength" },
        plan: { programName: "Strength", weeks: [] },
        history: legacyHistory,
      });

      expect(firestoreServiceMock.migrateLegacyHistory).toHaveBeenCalledWith(
        "user-legacy",
        legacyHistory
      );
      expect(firestoreServiceMock.subscribeWorkouts).not.toHaveBeenCalled();

      await act(async () => {
        migrateDeferred.resolve({ migratedCount: 1 });
        await migrateDeferred.promise;
      });

      await waitFor(() => {
        expect(firestoreServiceMock.subscribeWorkouts).toHaveBeenCalledTimes(1);
      });

      subs.emitWorkouts(migratedWorkouts);

      expect(result.current.status).toBe("ready");
      expect(result.current.isSynced).toBe(true);
      expect(callOrder).toEqual([
        "subscribeUserData",
        "migrateLegacyHistory",
        "subscribeWorkouts",
      ]);
      expect(result.current.workouts).toEqual(migratedWorkouts);
    });

    it("bootstraps pre-login local plan and profile without history when cloud has no doc or workouts", async () => {
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
      subs.emitInitial(null, []);

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
      expect(onSyncComplete).toHaveBeenCalledTimes(1);
      expect(onSyncComplete).toHaveBeenCalledWith(true);
    });

    it("hydrates null plan and profile while preserving workouts on reload after Reset Program", () => {
      const existingWorkouts = [
        makeWorkout("w-1"),
        makeWorkout("w-2", {
          dayNumber: 2,
          dayName: "Wednesday",
          focus: "Pull",
          completedAt: "2026-11-22T10:00:00.000Z",
        }),
      ];

      const onSyncComplete = vi.fn();
      const user = { uid: "user-after-reset" };

      const { result } = renderHook(() =>
        useUserData(user, { onSyncComplete })
      );

      subs.emitInitial(
        {
          plan: null,
          profile: null,
          updatedAt: "2026-11-24T00:00:00.000Z",
        },
        existingWorkouts
      );

      expect(result.current.status).toBe("ready");
      expect(result.current.isSynced).toBe(true);
      expect(result.current.error).toBeNull();
      expect(result.current.syncError).toBeNull();
      expect(result.current.profile).toBeNull();
      expect(result.current.plan).toBeNull();
      expect(result.current.workouts).toEqual(existingWorkouts);
      expect(onSyncComplete).toHaveBeenCalledWith(false);
    });

    it("transitions to status=error with error and syncError (never masked as loading) when legacy migration fails", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const syncFailure = new Error("Firestore unavailable");
      firestoreServiceMock.migrateLegacyHistory.mockRejectedValueOnce(
        syncFailure
      );

      const onSyncComplete = vi.fn();
      const user = { uid: "user-err" };

      try {
        const { result } = renderHook(() =>
          useUserData(user, { onSyncComplete })
        );

        subs.emitUser({
          plan: null,
          profile: null,
          history: [{ workout: { dayName: "Monday" } }],
        });

        await waitFor(() => {
          expect(result.current.status).toBe("error");
        });

        expect(result.current.error).toBe(syncFailure);
        expect(result.current.syncError).toBe(syncFailure);
        expect(result.current.isSynced).toBe(false);
        expect(firestoreServiceMock.subscribeWorkouts).not.toHaveBeenCalled();
        expect(subs.latestUserSub().unsub).toHaveBeenCalledTimes(1);
        expect(onSyncComplete).toHaveBeenCalledWith(false);
      } finally {
        consoleErrorSpy.mockRestore();
      }
    });

    it("retrySync transitions error -> loading (clearing error immediately) -> ready on recovery, or updates error on repeat failure", () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const err1 = new Error("Network offline");
      const err2 = new Error("Still offline");

      const onSyncComplete = vi.fn();
      const user = { uid: "user-retry" };

      try {
        const { result } = renderHook(() =>
          useUserData(user, { onSyncComplete })
        );

        subs.emitUserError(err1);

        expect(result.current.status).toBe("error");
        expect(result.current.error).toBe(err1);
        expect(result.current.syncError).toBe(err1);

        // First retry fails with a new error
        act(() => {
          result.current.retrySync();
        });

        expect(result.current.status).toBe("loading");
        expect(result.current.error).toBeNull();
        expect(result.current.syncError).toBeNull();
        expect(result.current.isSynced).toBe(false);

        subs.emitUserError(err2);

        expect(result.current.status).toBe("error");
        expect(result.current.error).toBe(err2);
        expect(result.current.syncError).toBe(err2);
        expect(result.current.isSynced).toBe(false);

        // Second retry succeeds
        act(() => {
          result.current.retrySync();
        });

        expect(result.current.status).toBe("loading");
        expect(result.current.error).toBeNull();
        expect(result.current.syncError).toBeNull();

        subs.emitInitial(
          {
            plan: { programName: "Recovered Plan", weeks: [] },
            profile: { goal: "strength" },
          },
          [makeWorkout("w-recovered")]
        );

        expect(result.current.status).toBe("ready");
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
    it("immediately clears data on logout and ignores late snapshot/error callbacks", () => {
      const onSyncComplete = vi.fn();
      const { result, rerender } = renderHook(
        ({ currentUser }) => useUserData(currentUser, { onSyncComplete }),
        { initialProps: { currentUser: { uid: "user-inflight" } } }
      );

      expect(result.current.status).toBe("loading");
      const firstSub = subs.latestUserSub();

      rerender({ currentUser: null });

      expect(result.current.status).toBe("ready");
      expect(result.current.error).toBeNull();
      expect(result.current.isSynced).toBe(false);
      expect(result.current.syncError).toBeNull();
      expect(result.current.profile).toBeNull();
      expect(result.current.plan).toBeNull();
      expect(result.current.workouts).toEqual([]);
      expect(firstSub.unsub).toHaveBeenCalledTimes(1);

      firstSub.emit({
        plan: { programName: "Late Plan", weeks: [] },
        profile: { goal: "muscle" },
      });
      firstSub.emitError(new Error("Late error"));

      expect(result.current.profile).toBeNull();
      expect(result.current.plan).toBeNull();
      expect(result.current.workouts).toEqual([]);
      expect(result.current.isSynced).toBe(false);
      expect(onSyncComplete).not.toHaveBeenCalled();
    });

    it("starts in loading and performs a fresh subscription when logging out and logging back in as the same uid", () => {
      const { result, rerender } = renderHook(
        ({ currentUser }) => useUserData(currentUser),
        { initialProps: { currentUser: { uid: "user-same" } } }
      );

      subs.emitInitial(
        {
          plan: { programName: "Session 1 Plan", weeks: [] },
          profile: { goal: "muscle" },
        },
        [makeWorkout("w-1")]
      );

      expect(result.current.status).toBe("ready");
      expect(result.current.isSynced).toBe(true);
      expect(result.current.plan.programName).toBe("Session 1 Plan");

      // Logout clears immediately
      rerender({ currentUser: null });
      expect(result.current.status).toBe("ready");
      expect(result.current.isSynced).toBe(false);
      expect(result.current.plan).toBeNull();
      expect(result.current.profile).toBeNull();
      expect(result.current.workouts).toEqual([]);

      // Re-login as same uid must start in loading
      rerender({ currentUser: { uid: "user-same" } });

      expect(result.current.status).toBe("loading");
      expect(result.current.isSynced).toBe(false);
      expect(result.current.plan).toBeNull();

      subs.emitInitial(
        {
          plan: { programName: "Session 2 Plan", weeks: [] },
          profile: { goal: "strength" },
        },
        []
      );

      expect(result.current.status).toBe("ready");
      expect(result.current.isSynced).toBe(true);
      expect(result.current.plan.programName).toBe("Session 2 Plan");
      expect(firestoreServiceMock.subscribeUserData).toHaveBeenCalledTimes(2);
    });

    it("immediately clears userA data on direct userA -> userB switch and never bootstraps userA data into userB", () => {
      const onSyncComplete = vi.fn();
      const { result, rerender } = renderHook(
        ({ currentUser }) => useUserData(currentUser, { onSyncComplete }),
        { initialProps: { currentUser: { uid: "user-A" } } }
      );

      subs.emitInitial(
        {
          plan: { programName: "User A Plan", weeks: [] },
          profile: { goal: "User A Goal" },
        },
        [makeWorkout("w-a")]
      );

      expect(result.current.status).toBe("ready");
      expect(result.current.plan.programName).toBe("User A Plan");

      rerender({ currentUser: { uid: "user-B" } });

      // User A's data must be cleared immediately while User B loads
      expect(result.current.status).toBe("loading");
      expect(result.current.isSynced).toBe(false);
      expect(result.current.plan).toBeNull();
      expect(result.current.profile).toBeNull();
      expect(result.current.workouts).toEqual([]);

      subs.emitInitial(null, []);

      expect(result.current.status).toBe("ready");
      expect(result.current.isSynced).toBe(true);
      expect(firestoreServiceMock.saveUserData).not.toHaveBeenCalled();
      expect(result.current.plan).toBeNull();
      expect(result.current.profile).toBeNull();
      expect(result.current.workouts).toEqual([]);
      expect(onSyncComplete).toHaveBeenLastCalledWith(false);
    });

    it("does not mutate logged-out state on late resolve OR late reject when user logs out mid-write", async () => {
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

      subs.emitInitial(
        {
          plan: { programName: "Initial", weeks: [] },
          profile: { goal: "strength" },
        },
        [makeWorkout("w-initial")]
      );
      expect(result.current.status).toBe("ready");

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
      const { result, rerender } = renderHook(
        ({ currentUser }) => useUserData(currentUser),
        { initialProps: { currentUser: { uid: "user-A" } } }
      );

      subs.emitInitial(
        {
          plan: { programName: "User A Plan", weeks: [] },
          profile: { goal: "User A Goal" },
        },
        [makeWorkout("w-a0")]
      );
      expect(result.current.status).toBe("ready");

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

      rerender({ currentUser: { uid: "user-B" } });
      subs.emitInitial({ plan: userBPlan, profile: userBProfile }, userBWorkouts);

      expect(result.current.status).toBe("ready");
      expect(result.current.plan).toEqual(userBPlan);

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
      const { result, rerender } = renderHook(
        ({ currentUser }) => useUserData(currentUser),
        { initialProps: { currentUser: { uid: "user-same-epoch" } } }
      );

      subs.emitInitial(
        {
          plan: { programName: "Session 1 Initial", weeks: [] },
          profile: { goal: "Session 1 Goal" },
        },
        [makeWorkout("w-s1")]
      );
      expect(result.current.status).toBe("ready");

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

      rerender({ currentUser: { uid: "user-same-epoch" } });
      subs.emitInitial({ plan: s2Plan, profile: s2Profile }, s2Workouts);

      expect(result.current.status).toBe("ready");
      expect(result.current.plan).toEqual(s2Plan);

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
      const { result } = renderHook(() =>
        useUserData({ uid: "user-retry-midwrite" })
      );

      subs.emitInitial(
        {
          plan: { programName: "Initial", weeks: [] },
          profile: { goal: "initial" },
        },
        [makeWorkout("w-0")]
      );
      expect(result.current.status).toBe("ready");

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

      act(() => {
        result.current.retrySync();
      });

      expect(result.current.status).toBe("loading");

      subs.emitInitial({ plan: freshPlan, profile: freshProfile }, freshWorkouts);

      expect(result.current.status).toBe("ready");
      expect(result.current.plan).toEqual(freshPlan);

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
      const { result } = renderHook(() =>
        useUserData({ uid: "user-clear-midwrite" })
      );

      subs.emitInitial(
        {
          plan: { programName: "Before Clear", weeks: [] },
          profile: { goal: "strength" },
        },
        [makeWorkout("w-before")]
      );
      expect(result.current.status).toBe("ready");

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

      const { result } = renderHook(() => useUserData({ uid: "user-loading" }));
      subs.emitInitial(
        { plan: initialPlan, profile: initialProfile },
        initialWorkouts
      );
      expect(result.current.status).toBe("ready");

      // Trigger retrySync to enter status === "loading" while existing data is hydrated
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

      try {
        const { result } = renderHook(() => useUserData({ uid: "user-failed" }));
        subs.emitInitial(
          { plan: initialPlan, profile: initialProfile },
          initialWorkouts
        );
        expect(result.current.status).toBe("ready");

        const syncFailure = new Error("Offline");
        act(() => {
          result.current.retrySync();
        });
        subs.emitUserError(syncFailure);

        expect(result.current.status).toBe("error");
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

      const { result } = renderHook(() => useUserData({ uid: "user-save" }));
      subs.emitInitial({ plan: oldPlan, profile: oldProfile }, [initialWorkout]);
      expect(result.current.status).toBe("ready");

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

      const { result } = renderHook(() => useUserData({ uid: "user-upd" }));
      subs.emitInitial(
        { plan: { programName: "V1", weeks: [] }, profile: initialProfile },
        [initialWorkout]
      );
      expect(result.current.status).toBe("ready");

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

      const { result } = renderHook(() => useUserData({ uid: "user-add" }));
      subs.emitInitial(
        { plan: existingPlan, profile: existingProfile },
        [existingWorkout]
      );
      expect(result.current.status).toBe("ready");

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

      const { result } = renderHook(() => useUserData({ uid: "user-reset" }));
      subs.emitInitial(
        { plan: existingPlan, profile: existingProfile },
        existingWorkouts
      );
      expect(result.current.status).toBe("ready");

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
        firestoreServiceMock.deleteUserData.mockResolvedValueOnce({
          deletedWorkoutsCount: 1,
        });

        const errHook = renderHook(() => useUserData({ uid: "user-del-err" }));
        subs.emitUserError(new Error("Sync broke"));
        expect(errHook.result.current.status).toBe("error");

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

        const readyHook = renderHook(() =>
          useUserData({ uid: "user-del-ready" })
        );
        subs.emitInitial(
          { plan: initialPlan, profile: initialProfile },
          [initialWorkout]
        );
        expect(readyHook.result.current.status).toBe("ready");

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

    it("clearLocalData resets profile, plan, and workouts locally with zero Firestore calls", () => {
      const { result } = renderHook(() => useUserData({ uid: "user-clear" }));
      subs.emitInitial(
        {
          plan: { programName: "PPL", weeks: [] },
          profile: { goal: "muscle" },
        },
        [makeWorkout("w-1")]
      );
      expect(result.current.status).toBe("ready");

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
      const hook = renderHook(() => useUserData({ uid }));
      subs.emitInitial({ plan, profile }, workouts);
      expect(hook.result.current.status).toBe("ready");
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

  describe("real-time multi-device sync, reconciliation, errors, and listener lifecycle", () => {
    const P0 = { programName: "P0", weeks: [] };
    const P1 = { programName: "P1", weeks: [{ weekNumber: 1 }] };
    const P_REMOTE = { programName: "Remote Plan", weeks: [{ weekNumber: 2 }] };
    const PR0 = { goal: "Initial Goal" };
    const PR1 = { goal: "Updated Goal" };
    const PR_REMOTE = { goal: "Remote Goal" };

    it("applies live multi-device users/{uid} snapshots immediately (updates, remote reset, doc deletion) while preserving workouts and never re-invoking onSyncComplete", () => {
      const existingWorkouts = [makeWorkout("w-1")];
      const onSyncComplete = vi.fn();
      const { result } = renderHook(() =>
        useUserData({ uid: "user-live-doc" }, { onSyncComplete })
      );

      subs.emitInitial({ plan: P0, profile: PR0 }, existingWorkouts);

      expect(result.current.status).toBe("ready");
      expect(result.current.plan).toEqual(P0);
      expect(result.current.profile).toEqual(PR0);
      expect(result.current.workouts).toEqual(existingWorkouts);
      expect(onSyncComplete).toHaveBeenCalledTimes(1);
      expect(onSyncComplete).toHaveBeenCalledWith(true);

      // Remote plan/profile update from another device
      subs.emitUser({ plan: P1, profile: PR1 });
      expect(result.current.plan).toEqual(P1);
      expect(result.current.profile).toEqual(PR1);
      expect(result.current.workouts).toEqual(existingWorkouts);
      expect(onSyncComplete).toHaveBeenCalledTimes(1);

      // Remote resetProgram from another device
      subs.emitUser({ plan: null, profile: null });
      expect(result.current.plan).toBeNull();
      expect(result.current.profile).toBeNull();
      expect(result.current.workouts).toEqual(existingWorkouts);
      expect(onSyncComplete).toHaveBeenCalledTimes(1);

      // Remote doc deletion (null)
      subs.emitUser(null);
      expect(result.current.plan).toBeNull();
      expect(result.current.profile).toBeNull();
      expect(result.current.workouts).toEqual(existingWorkouts);
      expect(onSyncComplete).toHaveBeenCalledTimes(1);
    });

    it("applies live multi-device workouts snapshots immediately (additions, edits, deletions) while preserving plan/profile and never re-invoking onSyncComplete", () => {
      const w0 = makeWorkout("w-0");
      const w1 = makeWorkout("w-1", {
        dayNumber: 2,
        dayName: "Wednesday",
        focus: "Pull",
        completedAt: "2026-11-22T10:00:00.000Z",
      });
      const onSyncComplete = vi.fn();
      const { result } = renderHook(() =>
        useUserData({ uid: "user-live-workouts" }, { onSyncComplete })
      );

      subs.emitInitial({ plan: P0, profile: PR0 }, [w0]);
      expect(onSyncComplete).toHaveBeenCalledTimes(1);

      // Remote addition
      subs.emitWorkouts([w0, w1]);
      expect(result.current.workouts).toEqual([w0, w1]);
      expect(result.current.plan).toEqual(P0);
      expect(result.current.profile).toEqual(PR0);
      expect(onSyncComplete).toHaveBeenCalledTimes(1);

      // Remote edit
      const w1Edited = { ...w1, duration: 2400 };
      subs.emitWorkouts([w0, w1Edited]);
      expect(result.current.workouts).toEqual([w0, w1Edited]);
      expect(result.current.plan).toEqual(P0);
      expect(result.current.profile).toEqual(PR0);
      expect(onSyncComplete).toHaveBeenCalledTimes(1);

      // Remote deletion
      subs.emitWorkouts([]);
      expect(result.current.workouts).toEqual([]);
      expect(result.current.plan).toEqual(P0);
      expect(result.current.profile).toEqual(PR0);
      expect(onSyncComplete).toHaveBeenCalledTimes(1);
    });

    it("runs migrateLegacyHistory at most once even if subsequent users/{uid} snapshots arrive during or after migration with legacy history", async () => {
      const legacyHistory = [
        {
          workout: { weekNumber: 1, dayName: "Monday", focus: "Push" },
          logs: [],
          duration: 1200,
        },
      ];
      const migratedWorkout = makeWorkout("migrated-w1-monday-idx0");
      const migrateDeferred = createDeferred();
      firestoreServiceMock.migrateLegacyHistory.mockReturnValueOnce(
        migrateDeferred.promise
      );

      const { result } = renderHook(() =>
        useUserData({ uid: "user-mig-once" })
      );

      // Initial snapshot triggers migration
      subs.emitUser({ plan: P0, profile: PR0, history: legacyHistory });
      expect(firestoreServiceMock.migrateLegacyHistory).toHaveBeenCalledTimes(1);
      expect(firestoreServiceMock.subscribeWorkouts).not.toHaveBeenCalled();

      // Second snapshot arrives while migration is still in flight
      subs.emitUser({ plan: P1, profile: PR0, history: legacyHistory });
      expect(firestoreServiceMock.migrateLegacyHistory).toHaveBeenCalledTimes(1);
      expect(firestoreServiceMock.subscribeWorkouts).not.toHaveBeenCalled();

      await act(async () => {
        migrateDeferred.resolve({ migratedCount: 1 });
        await migrateDeferred.promise;
      });

      await waitFor(() => {
        expect(firestoreServiceMock.subscribeWorkouts).toHaveBeenCalledTimes(1);
      });

      subs.emitWorkouts([migratedWorkout]);
      expect(result.current.status).toBe("ready");
      expect(result.current.plan).toEqual(P1);
      expect(result.current.workouts).toEqual([migratedWorkout]);

      // Subsequent live snapshot after ready still carrying legacy history must NOT re-migrate or re-subscribe
      subs.emitUser({ plan: P_REMOTE, profile: PR1, history: legacyHistory });
      expect(firestoreServiceMock.migrateLegacyHistory).toHaveBeenCalledTimes(1);
      expect(firestoreServiceMock.subscribeWorkouts).toHaveBeenCalledTimes(1);
      expect(result.current.plan).toEqual(P_REMOTE);
      expect(result.current.profile).toEqual(PR1);
    });

    it("runs pre-login bootstrap saveUserData at most once even if echoed snapshots arrive during or after bootstrap", async () => {
      const bootstrapDeferred = createDeferred();
      firestoreServiceMock.saveUserData.mockReturnValueOnce(
        bootstrapDeferred.promise
      );

      const onSyncComplete = vi.fn();
      const { result, rerender } = renderHook(
        ({ currentUser }) => useUserData(currentUser, { onSyncComplete }),
        { initialProps: { currentUser: null } }
      );

      await act(async () => {
        await result.current.savePlan(P0, PR0);
      });

      rerender({ currentUser: { uid: "user-boot-once" } });
      subs.emitInitial(null, []);

      expect(firestoreServiceMock.saveUserData).toHaveBeenCalledTimes(1);
      expect(result.current.status).toBe("loading");
      expect(onSyncComplete).not.toHaveBeenCalled();

      // Echoed snapshots during in-flight bootstrap must NOT re-trigger bootstrap or complete early
      subs.emitUser({ plan: P0, profile: PR0 });
      subs.emitWorkouts([]);
      expect(firestoreServiceMock.saveUserData).toHaveBeenCalledTimes(1);
      expect(result.current.status).toBe("loading");
      expect(onSyncComplete).not.toHaveBeenCalled();

      await act(async () => {
        bootstrapDeferred.resolve(undefined);
        await bootstrapDeferred.promise;
      });

      await waitFor(() => {
        expect(result.current.status).toBe("ready");
      });
      expect(result.current.plan).toEqual(P0);
      expect(result.current.profile).toEqual(PR0);
      expect(onSyncComplete).toHaveBeenCalledTimes(1);
      expect(onSyncComplete).toHaveBeenCalledWith(true);

      // Subsequent empty snapshots after ready must NOT re-trigger bootstrap or onSyncComplete
      subs.emitUser(null);
      subs.emitWorkouts([]);
      expect(firestoreServiceMock.saveUserData).toHaveBeenCalledTimes(1);
      expect(onSyncComplete).toHaveBeenCalledTimes(1);
    });

    it("surfaces error on pre-login bootstrap saveUserData failure, preserves local data, and retries bootstrap cleanly via retrySync()", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const bootErr = new Error("Bootstrap write failed");
      firestoreServiceMock.saveUserData
        .mockRejectedValueOnce(bootErr)
        .mockResolvedValueOnce(undefined);

      const onSyncComplete = vi.fn();

      try {
        const { result, rerender } = renderHook(
          ({ currentUser }) => useUserData(currentUser, { onSyncComplete }),
          { initialProps: { currentUser: null } }
        );

        await act(async () => {
          await result.current.savePlan(P0, PR0);
        });

        rerender({ currentUser: { uid: "user-boot-retry" } });
        subs.emitInitial(null, []);

        const firstUserSub = subs.latestUserSub();
        const firstWorkoutsSub = subs.latestWorkoutsSub();

        await waitFor(() => {
          expect(result.current.status).toBe("error");
        });

        expect(result.current.error).toBe(bootErr);
        expect(result.current.syncError).toBe(bootErr);
        expect(result.current.isSynced).toBe(false);
        expect(firstUserSub.unsub).toHaveBeenCalledTimes(1);
        expect(firstWorkoutsSub.unsub).toHaveBeenCalledTimes(1);
        expect(onSyncComplete).toHaveBeenCalledTimes(1);
        expect(onSyncComplete).toHaveBeenCalledWith(false);

        act(() => {
          result.current.retrySync();
        });
        expect(result.current.status).toBe("loading");

        subs.emitInitial(null, []);

        await waitFor(() => {
          expect(result.current.status).toBe("ready");
        });

        expect(result.current.isSynced).toBe(true);
        expect(result.current.plan).toEqual(P0);
        expect(result.current.profile).toEqual(PR0);
        expect(firestoreServiceMock.saveUserData).toHaveBeenCalledTimes(2);
        expect(firestoreServiceMock.saveUserData).toHaveBeenNthCalledWith(
          2,
          "user-boot-retry",
          { plan: P0, profile: PR0 }
        );
        expect(onSyncComplete).toHaveBeenCalledTimes(2);
        expect(onSyncComplete).toHaveBeenLastCalledWith(true);
      } finally {
        consoleErrorSpy.mockRestore();
      }
    });

    it("reconciles live users/{uid} snapshots with in-flight docSliceRef optimistic writes (reject rolls back to latest live baseline, resolve keeps local edit)", async () => {
      const { result } = renderHook(() =>
        useUserData({ uid: "user-doc-reconcile" })
      );
      subs.emitInitial({ plan: P0, profile: PR0 }, [makeWorkout("w-0")]);

      // Subcase A: reject rolls back to latest committed live snapshot baseline P_REMOTE (NOT stale P0)
      const rejectDeferred = createDeferred();
      firestoreServiceMock.saveUserData.mockReturnValueOnce(
        rejectDeferred.promise
      );

      let pendingReject;
      act(() => {
        pendingReject = result.current.updatePlan(P1);
      });
      const caughtReject = pendingReject.catch((err) => err);

      expect(result.current.plan).toEqual(P1);
      expect(result.current.profile).toEqual(PR0);

      // Live snapshot arrives while local updatePlan(P1) is in flight
      subs.emitUser({ plan: P_REMOTE, profile: PR_REMOTE });

      // Untouched field (profile) updates immediately; touched pending field (plan) keeps optimistic P1
      expect(result.current.profile).toEqual(PR_REMOTE);
      expect(result.current.plan).toEqual(P1);

      await act(async () => {
        rejectDeferred.reject(new Error("Plan update failed"));
        await caughtReject;
      });

      expect((await caughtReject).message).toBe("Plan update failed");
      expect(result.current.plan).toEqual(P_REMOTE);
      expect(result.current.profile).toEqual(PR_REMOTE);

      // Subcase B: resolve keeps local edit P1 while preserving live profile update PR1
      const resolveDeferred = createDeferred();
      firestoreServiceMock.saveUserData.mockReturnValueOnce(
        resolveDeferred.promise
      );

      let pendingResolve;
      act(() => {
        pendingResolve = result.current.updatePlan(P1);
      });
      expect(result.current.plan).toEqual(P1);

      subs.emitUser({ plan: P0, profile: PR1 });
      expect(result.current.profile).toEqual(PR1);
      expect(result.current.plan).toEqual(P1);

      await act(async () => {
        resolveDeferred.resolve(undefined);
        await pendingResolve;
      });

      expect(result.current.plan).toEqual(P1);
      expect(result.current.profile).toEqual(PR1);
    });

    it("reconciles remote workout snapshot arriving while local addWorkout is pending without dropping or duplicating either entry", async () => {
      const w0 = makeWorkout("w-0");
      const wRemote = makeWorkout("w-remote", {
        dayNumber: 2,
        dayName: "Tuesday",
        focus: "Pull",
        completedAt: "2026-11-23T10:00:00.000Z",
      });
      const payloadA = {
        weekNumber: 1,
        dayNumber: 3,
        dayName: "Wednesday",
        focus: "Legs",
        logs: [],
        duration: 1400,
        completedAt: "2026-11-24T10:00:00.000Z",
      };
      const docA = { id: "doc-A", ...payloadA };

      const { result } = renderHook(() =>
        useUserData({ uid: "user-w-remote" })
      );
      subs.emitInitial({ plan: P0, profile: PR0 }, [w0]);

      const addDeferred = createDeferred();
      firestoreServiceMock.addWorkout.mockReturnValueOnce(addDeferred.promise);

      let pendingAdd;
      act(() => {
        pendingAdd = result.current.addWorkout(payloadA);
      });
      expect(result.current.workouts).toHaveLength(2);
      const tempId = result.current.workouts[1].id;
      expect(tempId).toMatch(/^__optimistic_workout_\d+$/);

      // Remote workout arrives from Device B before local addWorkout resolves
      subs.emitWorkouts([w0, wRemote]);

      expect(result.current.workouts.map((w) => w.id)).toEqual([
        "w-0",
        "w-remote",
        tempId,
      ]);

      await act(async () => {
        addDeferred.resolve(docA);
        await pendingAdd;
      });

      expect(result.current.workouts).toEqual([w0, wRemote, docA]);

      // Subsequent snapshot containing docA produces zero duplicates
      subs.emitWorkouts([w0, wRemote, docA]);
      expect(result.current.workouts).toEqual([w0, wRemote, docA]);
    });

    it("deduplicates when subscribeWorkouts echoes the added workout BEFORE addWorkout resolves", async () => {
      const w0 = makeWorkout("w-0");
      const payloadA = {
        weekNumber: 1,
        dayNumber: 1,
        dayName: "Monday",
        focus: "Push",
        logs: [{ name: "Bench", sets: [{ weight: 135, reps: 8 }] }],
        duration: 1800,
        completedAt: "2026-11-24T10:00:00.000Z",
      };
      const docA = { id: "doc-A", ...payloadA };

      const { result } = renderHook(() =>
        useUserData({ uid: "user-w-echo-before" })
      );
      subs.emitInitial({ plan: P0, profile: PR0 }, [w0]);

      const addDeferred = createDeferred();
      firestoreServiceMock.addWorkout.mockReturnValueOnce(addDeferred.promise);

      let pendingAdd;
      act(() => {
        pendingAdd = result.current.addWorkout(payloadA);
      });
      expect(result.current.workouts).toHaveLength(2);
      expect(result.current.workouts[1].id).toMatch(/^__optimistic_workout_\d+$/);

      // Firestore latency-compensation echo arrives BEFORE addWorkout resolves
      subs.emitWorkouts([w0, docA]);

      // Strictly ONE doc-A (no optimistic duplicate while pending!)
      expect(result.current.workouts).toEqual([w0, docA]);

      // Resolving addWorkout keeps strictly ONE doc-A
      await act(async () => {
        addDeferred.resolve(docA);
        await pendingAdd;
      });

      expect(result.current.workouts).toEqual([w0, docA]);

      // Even if completedAt differed between optimistic fallback and server doc, resolving removes tempId cleanly
      const addDeferred2 = createDeferred();
      firestoreServiceMock.addWorkout.mockReturnValueOnce(addDeferred2.promise);
      const payloadNoDate = {
        weekNumber: 1,
        dayNumber: 2,
        dayName: "Tuesday",
        focus: "Pull",
        logs: [],
        duration: 1200,
      };
      const docB = {
        id: "doc-B",
        ...payloadNoDate,
        completedAt: "2026-11-25T12:34:56.000Z",
      };

      let pendingAdd2;
      act(() => {
        pendingAdd2 = result.current.addWorkout(payloadNoDate);
      });

      subs.emitWorkouts([w0, docA, docB]);

      await act(async () => {
        addDeferred2.resolve(docB);
        await pendingAdd2;
      });

      expect(result.current.workouts).toEqual([w0, docA, docB]);
    });

    it("deduplicates when subscribeWorkouts echoes the added workout AFTER addWorkout resolves", async () => {
      const w0 = makeWorkout("w-0");
      const payloadA = {
        weekNumber: 1,
        dayNumber: 1,
        dayName: "Monday",
        focus: "Push",
        logs: [],
        duration: 1500,
        completedAt: "2026-11-24T10:00:00.000Z",
      };
      const docA = { id: "doc-A", ...payloadA };

      const { result } = renderHook(() =>
        useUserData({ uid: "user-w-echo-after" })
      );
      subs.emitInitial({ plan: P0, profile: PR0 }, [w0]);

      const addDeferred = createDeferred();
      firestoreServiceMock.addWorkout.mockReturnValueOnce(addDeferred.promise);

      let pendingAdd;
      act(() => {
        pendingAdd = result.current.addWorkout(payloadA);
      });

      await act(async () => {
        addDeferred.resolve(docA);
        await pendingAdd;
      });

      expect(result.current.workouts).toEqual([w0, docA]);

      // Subsequent snapshot echoing docA produces strictly ONE doc-A
      subs.emitWorkouts([w0, docA]);
      expect(result.current.workouts).toEqual([w0, docA]);
    });

    it("handles initial and mid-session listener errors on either subscription, tears down sibling listener, blocks writes, and recovers cleanly via retrySync()", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      try {
        // 1) Initial error on subscribeUserData
        const onSync1 = vi.fn();
        const hook1 = renderHook(() =>
          useUserData({ uid: "u-err-user" }, { onSyncComplete: onSync1 })
        );
        const subUser1 = subs.latestUserSub();
        const userErr = new Error("User listener failed");

        subUser1.emitError(userErr);

        expect(hook1.result.current.status).toBe("error");
        expect(hook1.result.current.error).toBe(userErr);
        expect(hook1.result.current.syncError).toBe(userErr);
        expect(hook1.result.current.isSynced).toBe(false);
        expect(subUser1.unsub).toHaveBeenCalledTimes(1);
        expect(firestoreServiceMock.subscribeWorkouts).not.toHaveBeenCalled();
        expect(onSync1).toHaveBeenCalledTimes(1);
        expect(onSync1).toHaveBeenCalledWith(false);
        hook1.unmount();

        // 2) Initial error on subscribeWorkouts tears down BOTH listeners
        const onSync2 = vi.fn();
        const hook2 = renderHook(() =>
          useUserData({ uid: "u-err-workouts" }, { onSyncComplete: onSync2 })
        );
        const subUser2 = subs.latestUserSub();
        subUser2.emit({ plan: P0, profile: PR0 });
        const subWorkouts2 = subs.latestWorkoutsSub();
        const workoutsErr = new Error("Workouts listener failed");

        subWorkouts2.emitError(workoutsErr);

        expect(hook2.result.current.status).toBe("error");
        expect(hook2.result.current.error).toBe(workoutsErr);
        expect(hook2.result.current.syncError).toBe(workoutsErr);
        expect(hook2.result.current.isSynced).toBe(false);
        expect(subUser2.unsub).toHaveBeenCalledTimes(1);
        expect(subWorkouts2.unsub).toHaveBeenCalledTimes(1);
        expect(onSync2).toHaveBeenCalledTimes(1);
        expect(onSync2).toHaveBeenCalledWith(false);
        hook2.unmount();

        // 3) Mid-session error on subscribeWorkouts after ready: tears down sibling, preserves data, blocks writes, no repeat onSyncComplete, retrySync recovers
        const w0 = makeWorkout("w-0");
        const w1 = makeWorkout("w-1");
        const onSync3 = vi.fn();
        const hook3 = renderHook(() =>
          useUserData({ uid: "u-mid-workouts-err" }, { onSyncComplete: onSync3 })
        );
        subs.emitInitial({ plan: P0, profile: PR0 }, [w0]);
        expect(hook3.result.current.status).toBe("ready");
        expect(onSync3).toHaveBeenCalledTimes(1);
        expect(onSync3).toHaveBeenCalledWith(true);

        const subUser3 = subs.latestUserSub();
        const subWorkouts3 = subs.latestWorkoutsSub();
        const midErr = new Error("Mid-session workouts disconnect");

        subWorkouts3.emitError(midErr);

        expect(hook3.result.current.status).toBe("error");
        expect(hook3.result.current.error).toBe(midErr);
        expect(hook3.result.current.syncError).toBe(midErr);
        expect(hook3.result.current.isSynced).toBe(false);
        expect(subUser3.unsub).toHaveBeenCalledTimes(1);
        expect(subWorkouts3.unsub).toHaveBeenCalledTimes(1);
        expect(hook3.result.current.plan).toEqual(P0);
        expect(hook3.result.current.profile).toEqual(PR0);
        expect(hook3.result.current.workouts).toEqual([w0]);
        expect(onSync3).toHaveBeenCalledTimes(1);

        // Trailing sibling snapshot is ignored
        subUser3.emit({ plan: P1, profile: PR1 });
        expect(hook3.result.current.plan).toEqual(P0);
        expect(hook3.result.current.profile).toEqual(PR0);

        // Writes are blocked with sync-failed error
        await expect(hook3.result.current.updatePlan(P1)).rejects.toThrow(
          SYNC_FAILED_DEFAULT
        );
        expect(firestoreServiceMock.saveUserData).not.toHaveBeenCalled();

        // retrySync transitions immediately error -> loading -> ready
        act(() => {
          hook3.result.current.retrySync();
        });
        expect(hook3.result.current.status).toBe("loading");
        expect(hook3.result.current.error).toBeNull();
        expect(hook3.result.current.syncError).toBeNull();
        expect(hook3.result.current.isSynced).toBe(false);

        subs.emitInitial({ plan: P1, profile: PR1 }, [w0, w1]);
        expect(hook3.result.current.status).toBe("ready");
        expect(hook3.result.current.isSynced).toBe(true);
        expect(hook3.result.current.plan).toEqual(P1);
        expect(hook3.result.current.profile).toEqual(PR1);
        expect(hook3.result.current.workouts).toEqual([w0, w1]);
        expect(onSync3).toHaveBeenCalledTimes(2);
        expect(onSync3).toHaveBeenLastCalledWith(true);
        hook3.unmount();

        // 4) Mid-session error on subscribeUserData tears down subscribeWorkouts and does not re-invoke onSyncComplete
        const onSync4 = vi.fn();
        const hook4 = renderHook(() =>
          useUserData({ uid: "u-mid-user-err" }, { onSyncComplete: onSync4 })
        );
        subs.emitInitial({ plan: P0, profile: PR0 }, [w0]);
        expect(onSync4).toHaveBeenCalledTimes(1);

        const subUser4 = subs.latestUserSub();
        const subWorkouts4 = subs.latestWorkoutsSub();
        const midUserErr = new Error("Mid-session user doc error");

        subUser4.emitError(midUserErr);

        expect(hook4.result.current.status).toBe("error");
        expect(hook4.result.current.error).toBe(midUserErr);
        expect(hook4.result.current.syncError).toBe(midUserErr);
        expect(subUser4.unsub).toHaveBeenCalledTimes(1);
        expect(subWorkouts4.unsub).toHaveBeenCalledTimes(1);
        expect(onSync4).toHaveBeenCalledTimes(1);

        // Trailing workouts snapshot is ignored
        subWorkouts4.emit([w0, w1]);
        expect(hook4.result.current.workouts).toEqual([w0]);
        hook4.unmount();
      } finally {
        consoleErrorSpy.mockRestore();
      }
    });

    it("tears down both unsubUser and unsubWorkouts exactly once on unmount, logout, account switch, retrySync, deleteAll resolve (not failure), and clearLocalData", async () => {
      const w0 = makeWorkout("w-0");

      // 1) Hook unmount
      const hUnmount = renderHook(() => useUserData({ uid: "u-unmount" }));
      subs.emitInitial({ plan: P0, profile: PR0 }, [w0]);
      const u1 = subs.latestUserSub();
      const w1 = subs.latestWorkoutsSub();
      hUnmount.unmount();
      expect(u1.unsub).toHaveBeenCalledTimes(1);
      expect(w1.unsub).toHaveBeenCalledTimes(1);

      // 2) Logout (user -> null)
      const hLogout = renderHook(
        ({ currentUser }) => useUserData(currentUser),
        { initialProps: { currentUser: { uid: "u-logout" } } }
      );
      subs.emitInitial({ plan: P0, profile: PR0 }, [w0]);
      const u2 = subs.latestUserSub();
      const w2 = subs.latestWorkoutsSub();
      hLogout.rerender({ currentUser: null });
      expect(u2.unsub).toHaveBeenCalledTimes(1);
      expect(w2.unsub).toHaveBeenCalledTimes(1);
      u2.emit({ plan: P1, profile: PR1 });
      w2.emit([w0]);
      expect(hLogout.result.current.plan).toBeNull();
      expect(hLogout.result.current.workouts).toEqual([]);
      hLogout.unmount();

      // 3) Account switch (userA -> userB)
      const hSwitch = renderHook(
        ({ currentUser }) => useUserData(currentUser),
        { initialProps: { currentUser: { uid: "u-switch-A" } } }
      );
      subs.emitInitial({ plan: P0, profile: PR0 }, [w0]);
      const uA = subs.latestUserSub();
      const wA = subs.latestWorkoutsSub();
      hSwitch.rerender({ currentUser: { uid: "u-switch-B" } });
      expect(uA.unsub).toHaveBeenCalledTimes(1);
      expect(wA.unsub).toHaveBeenCalledTimes(1);
      subs.emitInitial({ plan: P1, profile: PR1 }, []);
      uA.emit({ plan: P0, profile: PR0 });
      wA.emit([w0]);
      expect(hSwitch.result.current.plan).toEqual(P1);
      expect(hSwitch.result.current.workouts).toEqual([]);
      hSwitch.unmount();

      // 4) retrySync()
      const hRetry = renderHook(() => useUserData({ uid: "u-retry-td" }));
      subs.emitInitial({ plan: P0, profile: PR0 }, [w0]);
      const uRetryOld = subs.latestUserSub();
      const wRetryOld = subs.latestWorkoutsSub();
      act(() => {
        hRetry.result.current.retrySync();
      });
      expect(uRetryOld.unsub).toHaveBeenCalledTimes(1);
      expect(wRetryOld.unsub).toHaveBeenCalledTimes(1);
      hRetry.unmount();

      // 5) deleteAll(): failure keeps listeners alive & state intact; resolve unsubscribes both and prevents snapshot resurrection
      const hDel = renderHook(() => useUserData({ uid: "u-del-td" }));
      subs.emitInitial({ plan: P0, profile: PR0 }, [w0]);
      const uDel = subs.latestUserSub();
      const wDel = subs.latestWorkoutsSub();

      // Failed deleteAll keeps listeners alive and state untouched
      firestoreServiceMock.deleteUserData.mockRejectedValueOnce(
        new Error("Delete rejected")
      );
      await expect(hDel.result.current.deleteAll()).rejects.toThrow(
        "Delete rejected"
      );
      expect(uDel.unsub).not.toHaveBeenCalled();
      expect(wDel.unsub).not.toHaveBeenCalled();
      expect(hDel.result.current.plan).toEqual(P0);
      expect(hDel.result.current.workouts).toEqual([w0]);

      // Listeners still work after failed deleteAll
      uDel.emit({ plan: P1, profile: PR1 });
      expect(hDel.result.current.plan).toEqual(P1);

      // Pending deleteAll suppresses intermediate partial deletion snapshots, then tears down listeners on resolve
      const delDeferred = createDeferred();
      firestoreServiceMock.deleteUserData.mockReturnValueOnce(
        delDeferred.promise
      );
      let pendingDel;
      act(() => {
        pendingDel = hDel.result.current.deleteAll();
      });
      // Partial snapshot during pending deleteAll does not flicker state
      wDel.emit([]);
      expect(hDel.result.current.workouts).toEqual([w0]);

      await act(async () => {
        delDeferred.resolve({ deletedWorkoutsCount: 1 });
        await pendingDel;
      });
      expect(uDel.unsub).toHaveBeenCalledTimes(1);
      expect(wDel.unsub).toHaveBeenCalledTimes(1);
      expect(hDel.result.current.plan).toBeNull();
      expect(hDel.result.current.profile).toBeNull();
      expect(hDel.result.current.workouts).toEqual([]);

      // Late snapshots after deleteAll resolve CANNOT resurrect deleted state
      uDel.emit({ plan: P0, profile: PR0 });
      wDel.emit([w0]);
      expect(hDel.result.current.plan).toBeNull();
      expect(hDel.result.current.profile).toBeNull();
      expect(hDel.result.current.workouts).toEqual([]);
      hDel.unmount();
      // Idempotent teardown: still called exactly once even after unmount
      expect(uDel.unsub).toHaveBeenCalledTimes(1);
      expect(wDel.unsub).toHaveBeenCalledTimes(1);

      // 6) clearLocalData() tears down both listeners and ignores late snapshots
      const hClear = renderHook(() => useUserData({ uid: "u-clear-td" }));
      subs.emitInitial({ plan: P0, profile: PR0 }, [w0]);
      const uClear = subs.latestUserSub();
      const wClear = subs.latestWorkoutsSub();

      act(() => {
        hClear.result.current.clearLocalData();
      });
      expect(uClear.unsub).toHaveBeenCalledTimes(1);
      expect(wClear.unsub).toHaveBeenCalledTimes(1);
      expect(hClear.result.current.plan).toBeNull();
      expect(hClear.result.current.profile).toBeNull();
      expect(hClear.result.current.workouts).toEqual([]);

      uClear.emit({ plan: P1, profile: PR1 });
      wClear.emit([w0]);
      expect(hClear.result.current.plan).toBeNull();
      expect(hClear.result.current.profile).toBeNull();
      expect(hClear.result.current.workouts).toEqual([]);
      hClear.unmount();
      expect(uClear.unsub).toHaveBeenCalledTimes(1);
      expect(wClear.unsub).toHaveBeenCalledTimes(1);
    });

    it("immediately unsubscribes on synchronous listener error during registration and does not resubscribe on same-UID user or onSyncComplete identity changes", () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      try {
        // 1) Synchronous onError inside subscribeUserData immediately invokes returned unsubscribe
        const syncUserUnsub = vi.fn();
        const syncUserErr = new Error("Sync user listener error");
        firestoreServiceMock.subscribeUserData.mockImplementationOnce(
          (_uid, _onData, onError) => {
            onError(syncUserErr);
            return syncUserUnsub;
          }
        );

        const hSyncErr1 = renderHook(() =>
          useUserData({ uid: "u-sync-err-1" })
        );
        expect(syncUserUnsub).toHaveBeenCalledTimes(1);
        expect(hSyncErr1.result.current.status).toBe("error");
        expect(hSyncErr1.result.current.error).toBe(syncUserErr);
        expect(firestoreServiceMock.subscribeWorkouts).not.toHaveBeenCalled();
        hSyncErr1.unmount();

        // 2) Synchronous onError inside subscribeWorkouts immediately invokes BOTH unsubscribes
        const syncWorkoutsUnsub = vi.fn();
        const syncWorkoutsErr = new Error("Sync workouts listener error");
        firestoreServiceMock.subscribeWorkouts.mockImplementationOnce(
          (_uid, _onData, onError) => {
            onError(syncWorkoutsErr);
            return syncWorkoutsUnsub;
          }
        );

        const hSyncErr2 = renderHook(() =>
          useUserData({ uid: "u-sync-err-2" })
        );
        const uSync2 = subs.latestUserSub();
        uSync2.emit({ plan: P0, profile: PR0 });

        expect(uSync2.unsub).toHaveBeenCalledTimes(1);
        expect(syncWorkoutsUnsub).toHaveBeenCalledTimes(1);
        expect(hSyncErr2.result.current.status).toBe("error");
        expect(hSyncErr2.result.current.error).toBe(syncWorkoutsErr);
        hSyncErr2.unmount();

        // 3) Same-UID new user object reference and new onSyncComplete reference do not resubscribe
        const userCallCountBefore =
          firestoreServiceMock.subscribeUserData.mock.calls.length;
        const workoutsCallCountBefore =
          firestoreServiceMock.subscribeWorkouts.mock.calls.length;

        const cb1 = vi.fn();
        const cb2 = vi.fn();
        const hStable = renderHook(
          ({ currentUser, onSyncComplete }) =>
            useUserData(currentUser, { onSyncComplete }),
          {
            initialProps: {
              currentUser: { uid: "u-stable", email: "a@b.com" },
              onSyncComplete: cb1,
            },
          }
        );

        subs.emitInitial({ plan: P0, profile: PR0 }, [makeWorkout("w-0")]);
        const uStable = subs.latestUserSub();
        const wStable = subs.latestWorkoutsSub();

        hStable.rerender({
          currentUser: { uid: "u-stable", email: "a@b.com" },
          onSyncComplete: cb2,
        });

        expect(
          firestoreServiceMock.subscribeUserData.mock.calls.length
        ).toBe(userCallCountBefore + 1);
        expect(
          firestoreServiceMock.subscribeWorkouts.mock.calls.length
        ).toBe(workoutsCallCountBefore + 1);
        expect(uStable.unsub).not.toHaveBeenCalled();
        expect(wStable.unsub).not.toHaveBeenCalled();
        hStable.unmount();
      } finally {
        consoleErrorSpy.mockRestore();
      }
    });
  });
});
