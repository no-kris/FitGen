// @vitest-environment jsdom
import { useEffect } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, act, cleanup } from "@testing-library/react";
import { useAppContext } from "./context/AppContext";

const authMocks = vi.hoisted(() => ({
  subscribeToAuthChanges: vi.fn(),
  logout: vi.fn(),
}));

const authCallbacks = vi.hoisted(() => ({
  listener: null,
}));

const firestoreServiceMock = vi.hoisted(() => ({
  getUserData: vi.fn(),
  getWorkouts: vi.fn(),
  saveUserData: vi.fn(),
  migrateLegacyHistory: vi.fn(),
  addWorkout: vi.fn(),
  clearUserData: vi.fn(),
  resetUserProgram: vi.fn(),
  deleteUserData: vi.fn(),
}));

const contextStore = vi.hoisted(() => ({
  value: null,
}));

function ContextCapture({ label, children = null }) {
  const ctx = useAppContext();
  useEffect(() => {
    contextStore.value = ctx;
  });
  return <div>{children ?? label}</div>;
}

vi.mock("./services/firebase/authServices", () => ({
  authService: {
    subscribeToAuthChanges: authMocks.subscribeToAuthChanges,
    logout: authMocks.logout,
  },
}));

vi.mock("./services/firebase/firestoreServices", () => ({
  firestoreService: firestoreServiceMock,
}));

vi.mock("./features/onboarding/WelcomeScreen", () => ({
  default: function MockWelcomeScreen() {
    return <ContextCapture label="Welcome Harness" />;
  },
}));

vi.mock("./components/layout/Layout", () => ({
  default: function MockLayout({ children }) {
    return <ContextCapture label="Layout">{children}</ContextCapture>;
  },
}));

vi.mock("./features/dashboard/PlanDashboard", () => ({
  default: function MockPlanDashboard() {
    return <ContextCapture label="Plan View" />;
  },
}));

vi.mock("./features/onboarding/ProfileSetupForm", () => ({
  default: function MockProfileSetupForm() {
    return <ContextCapture label="Profile Setup View" />;
  },
}));

vi.mock("./components/screens/ProfileScreen", () => ({
  default: function MockProfileScreen() {
    return <ContextCapture label="Profile View" />;
  },
}));

vi.mock("./components/screens/LogsScreen", () => ({
  default: function MockLogsScreen() {
    return <ContextCapture label="Logs View" />;
  },
}));

vi.mock("./features/workout/ActiveWorkout", () => ({
  default: function MockActiveWorkout() {
    return <ContextCapture label="Active View" />;
  },
}));

vi.mock("./features/auth/AuthModal", () => ({
  default: function MockAuthModal() {
    return <div>Auth Modal</div>;
  },
}));

import App from "./App";

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("App handleSavePlan, handleResetSystem, and sync guards", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetAllMocks();
    authCallbacks.listener = null;
    contextStore.value = null;
    authMocks.subscribeToAuthChanges.mockImplementation((cb) => {
      authCallbacks.listener = cb;
      return vi.fn();
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("blocks handleSavePlan while user is signed in and isSynced is false (pending), with zero Firestore writes", async () => {
    const userDeferred = createDeferred();
    firestoreServiceMock.getUserData.mockReturnValueOnce(userDeferred.promise);
    firestoreServiceMock.getWorkouts.mockResolvedValueOnce([]);

    render(<App />);

    await act(async () => {
      authCallbacks.listener({ uid: "user-1", isAnonymous: false });
    });

    expect(contextStore.value.status).toBe("loading");
    expect(contextStore.value.isSynced).toBe(false);
    expect(contextStore.value.syncError).toBeNull();

    await expect(
      Promise.resolve().then(() =>
        contextStore.value.handleSavePlan(
          { programName: "New Plan", weeks: [] },
          { goal: "strength" }
        )
      )
    ).rejects.toThrow(
      "Still syncing your data from the cloud. Please try again in a moment."
    );

    expect(firestoreServiceMock.saveUserData).not.toHaveBeenCalled();
    expect(contextStore.value.view).toBe("welcome");
  });

  it("distinguishes syncError from pending in handleSavePlan and handleResetSystem", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    firestoreServiceMock.getUserData.mockRejectedValueOnce(
      new Error("Firestore offline")
    );

    try {
      render(<App />);

      await act(async () => {
        authCallbacks.listener({ uid: "user-sync-err", isAnonymous: false });
      });

      await waitFor(() => {
        expect(contextStore.value.status).toBe("error");
        expect(contextStore.value.syncError).toBeInstanceOf(Error);
      });
      expect(contextStore.value.error).toBe(contextStore.value.syncError);
      expect(contextStore.value.isSynced).toBe(false);

      await expect(
        Promise.resolve().then(() =>
          contextStore.value.handleSavePlan(
            { programName: "Plan", weeks: [] },
            { goal: "strength" }
          )
        )
      ).rejects.toThrow(
        "Cloud sync failed. Please retry sync before saving your plan."
      );

      await expect(
        Promise.resolve().then(() => contextStore.value.handleResetSystem())
      ).rejects.toThrow(
        "Cloud sync failed. Please retry sync before resetting your program."
      );

      expect(firestoreServiceMock.saveUserData).not.toHaveBeenCalled();
      expect(firestoreServiceMock.resetUserProgram).not.toHaveBeenCalled();
      expect(firestoreServiceMock.deleteUserData).not.toHaveBeenCalled();
      expect(firestoreServiceMock.clearUserData).not.toHaveBeenCalled();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("blocks handleResetSystem while sync is pending with zero Firestore writes", async () => {
    const userDeferred = createDeferred();
    firestoreServiceMock.getUserData.mockReturnValueOnce(userDeferred.promise);
    firestoreServiceMock.getWorkouts.mockResolvedValueOnce([]);

    render(<App />);

    await act(async () => {
      authCallbacks.listener({ uid: "user-pending-reset", isAnonymous: false });
    });

    expect(contextStore.value.status).toBe("loading");
    expect(contextStore.value.isSynced).toBe(false);
    expect(contextStore.value.syncError).toBeNull();

    await expect(
      Promise.resolve().then(() => contextStore.value.handleResetSystem())
    ).rejects.toThrow(
      "Still syncing your data from the cloud. Please try again in a moment."
    );

    expect(firestoreServiceMock.resetUserProgram).not.toHaveBeenCalled();
    expect(firestoreServiceMock.deleteUserData).not.toHaveBeenCalled();
    expect(firestoreServiceMock.clearUserData).not.toHaveBeenCalled();
  });

  it("awaits saveUserData in handleSavePlan once synced and leaves view unchanged on write failure", async () => {
    firestoreServiceMock.getUserData.mockResolvedValueOnce(null);
    firestoreServiceMock.getWorkouts.mockResolvedValueOnce([]);

    render(<App />);

    await act(async () => {
      authCallbacks.listener({ uid: "user-2", isAnonymous: false });
    });

    await waitFor(() => {
      expect(contextStore.value.isSynced).toBe(true);
    });

    firestoreServiceMock.saveUserData.mockRejectedValueOnce(
      new Error("Firestore write failed")
    );

    await expect(
      Promise.resolve().then(() =>
        contextStore.value.handleSavePlan(
          { programName: "Plan A", weeks: [] },
          { goal: "muscle" }
        )
      )
    ).rejects.toThrow("Firestore write failed");

    expect(contextStore.value.view).not.toBe("plan");
    expect(contextStore.value.userData.plan).toBeNull();
    expect(contextStore.value.plan).toBeNull();

    const saveDeferred = createDeferred();
    firestoreServiceMock.saveUserData.mockReturnValueOnce(saveDeferred.promise);

    const pendingSave = contextStore.value.handleSavePlan(
      { programName: "Plan B", weeks: [] },
      { goal: "muscle" }
    );

    expect(contextStore.value.view).not.toBe("plan");

    await act(async () => {
      saveDeferred.resolve(undefined);
      await pendingSave;
    });

    await waitFor(() => {
      expect(contextStore.value.view).toBe("plan");
    });
    expect(contextStore.value.userData.plan.programName).toBe("Plan B");
    expect(contextStore.value.plan.programName).toBe("Plan B");
  });

  it("handleResetSystem awaits resetUserProgram, clears plan/profile/activeWorkout/active storage, preserves history, and switches view to profile", async () => {
    const existingHistory = [
      { id: "w-1", weekNumber: 1, dayNumber: 1, dayName: "Monday", focus: "Push", logs: [], duration: 1800, completedAt: "2026-11-20T10:00:00.000Z" },
      { id: "w-2", weekNumber: 1, dayNumber: 2, dayName: "Wednesday", focus: "Pull", logs: [], duration: 1500, completedAt: "2026-11-22T10:00:00.000Z" },
    ];
    firestoreServiceMock.getUserData.mockResolvedValueOnce({
      plan: { programName: "PPL", weeks: [] },
      profile: { goal: "Build Muscle" },
    });
    firestoreServiceMock.getWorkouts.mockResolvedValueOnce(existingHistory);
    firestoreServiceMock.resetUserProgram.mockResolvedValueOnce(undefined);

    localStorage.setItem("fitgen:active:v1", JSON.stringify({ weekNumber: 1 }));
    localStorage.setItem("fitgen-active", JSON.stringify({ legacy: true }));
    localStorage.setItem("fitgen-active-w1-d1", "{}");
    localStorage.setItem("theme", "dark");

    render(<App />);

    await act(async () => {
      authCallbacks.listener({ uid: "user-reset-ok", isAnonymous: false });
    });

    await waitFor(() => {
      expect(contextStore.value.isSynced).toBe(true);
      expect(contextStore.value.view).toBe("plan");
    });

    act(() => {
      contextStore.value.setActiveWorkout({ dayName: "Monday", weekNumber: 1 });
    });
    expect(contextStore.value.activeWorkout).not.toBeNull();

    await act(async () => {
      await contextStore.value.handleResetSystem();
    });

    expect(firestoreServiceMock.resetUserProgram).toHaveBeenCalledTimes(1);
    expect(firestoreServiceMock.resetUserProgram).toHaveBeenCalledWith(
      "user-reset-ok"
    );
    expect(firestoreServiceMock.deleteUserData).not.toHaveBeenCalled();
    expect(firestoreServiceMock.clearUserData).not.toHaveBeenCalled();

    expect(contextStore.value.plan).toBeNull();
    expect(contextStore.value.profile).toBeNull();
    expect(contextStore.value.workouts).toEqual(existingHistory);
    expect(contextStore.value.userData.plan).toBeNull();
    expect(contextStore.value.userData.profile).toBeNull();
    expect(contextStore.value.userData.history).toEqual(existingHistory);
    expect(contextStore.value.activeWorkout).toBeNull();
    expect(contextStore.value.view).toBe("profile");

    expect(localStorage.getItem("fitgen:active:v1")).toBeNull();
    expect(localStorage.getItem("fitgen-active")).toBeNull();
    expect(localStorage.getItem("fitgen-active-w1-d1")).toBeNull();
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  it("handleResetSystem rethrows on resetUserProgram failure and leaves state, activeWorkout, storage, and view unchanged", async () => {
    const existingHistory = [
      { id: "w-1", weekNumber: 1, dayNumber: 1, dayName: "Monday", focus: "Push", logs: [], duration: 1200, completedAt: "2026-11-20T10:00:00.000Z" },
    ];
    const existingPlan = { programName: "PPL", weeks: [] };
    const existingProfile = { goal: "Build Muscle" };

    firestoreServiceMock.getUserData.mockResolvedValueOnce({
      plan: existingPlan,
      profile: existingProfile,
    });
    firestoreServiceMock.getWorkouts.mockResolvedValueOnce(existingHistory);
    firestoreServiceMock.resetUserProgram.mockRejectedValueOnce(
      new Error("Reset failed on server")
    );

    localStorage.setItem("fitgen:active:v1", JSON.stringify({ weekNumber: 1 }));

    render(<App />);

    await act(async () => {
      authCallbacks.listener({ uid: "user-reset-fail", isAnonymous: false });
    });

    await waitFor(() => {
      expect(contextStore.value.isSynced).toBe(true);
      expect(contextStore.value.view).toBe("plan");
    });

    const active = { dayName: "Monday", weekNumber: 1 };
    act(() => {
      contextStore.value.setActiveWorkout(active);
    });

    await expect(
      Promise.resolve().then(() => contextStore.value.handleResetSystem())
    ).rejects.toThrow("Reset failed on server");

    expect(contextStore.value.userData.plan).toEqual(existingPlan);
    expect(contextStore.value.userData.profile).toEqual(existingProfile);
    expect(contextStore.value.userData.history).toEqual(existingHistory);
    expect(contextStore.value.activeWorkout).toEqual(active);
    expect(localStorage.getItem("fitgen:active:v1")).not.toBeNull();
    expect(contextStore.value.view).toBe("plan");
  });

  it("clearStorage resets unified data state, activeWorkout, and all fitgen:active* and fitgen-active* storage keys", async () => {
    localStorage.setItem("fitgen:active:v1", JSON.stringify({ weekNumber: 1 }));
    localStorage.setItem("fitgen-active", JSON.stringify({ old: true }));
    localStorage.setItem("fitgen-active-w1-d1", "{}");
    localStorage.setItem("fitgen:active:v0", "{}");
    localStorage.setItem("theme", "dark");

    render(<App />);

    await act(async () => {
      await contextStore.value.savePlan(
        { programName: "PPL", weeks: [] },
        { goal: "muscle" }
      );
      await contextStore.value.addWorkout({
        weekNumber: 1,
        dayNumber: 1,
        dayName: "Monday",
        focus: "Push",
        logs: [],
        duration: 600,
        completedAt: "2026-11-24T10:00:00.000Z",
      });
      contextStore.value.setActiveWorkout({ weekNumber: 1, dayName: "Monday" });
    });

    expect(contextStore.value.plan).not.toBeNull();
    expect(contextStore.value.profile).not.toBeNull();
    expect(contextStore.value.workouts).toHaveLength(1);
    expect(contextStore.value.activeWorkout).not.toBeNull();

    act(() => {
      contextStore.value.clearStorage();
    });

    expect(contextStore.value.profile).toBeNull();
    expect(contextStore.value.plan).toBeNull();
    expect(contextStore.value.workouts).toEqual([]);
    expect(contextStore.value.userData).toEqual({
      profile: null,
      plan: null,
      history: [],
    });
    expect(contextStore.value.activeWorkout).toBeNull();
    expect(localStorage.getItem("fitgen:active:v1")).toBeNull();
    expect(localStorage.getItem("fitgen-active")).toBeNull();
    expect(localStorage.getItem("fitgen-active-w1-d1")).toBeNull();
    expect(localStorage.getItem("fitgen:active:v0")).toBeNull();
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  it("integrates status, retrySync, and deleteAll through AppContext end-to-end", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const initialErr = new Error("Initial sync timeout");
    firestoreServiceMock.getUserData.mockRejectedValueOnce(initialErr);

    try {
      render(<App />);
      expect(contextStore.value.status).toBe("ready");
      expect(contextStore.value.isSynced).toBe(false);

      await act(async () => {
        authCallbacks.listener({ uid: "user-e2e", isAnonymous: false });
      });

      await waitFor(() => {
        expect(contextStore.value.status).toBe("error");
      });
      expect(contextStore.value.error).toBe(initialErr);
      expect(contextStore.value.syncError).toBe(initialErr);

      const retryUserDeferred = createDeferred();
      firestoreServiceMock.getUserData.mockReturnValueOnce(
        retryUserDeferred.promise
      );
      firestoreServiceMock.getWorkouts.mockResolvedValueOnce([
        { id: "w-e2e", weekNumber: 1, dayNumber: 1, dayName: "Monday" },
      ]);

      act(() => {
        contextStore.value.retrySync();
      });

      expect(contextStore.value.status).toBe("loading");
      expect(contextStore.value.error).toBeNull();
      expect(contextStore.value.syncError).toBeNull();

      await act(async () => {
        retryUserDeferred.resolve({
          plan: { programName: "E2E Plan", weeks: [] },
          profile: { goal: "strength" },
        });
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(contextStore.value.status).toBe("ready");
        expect(contextStore.value.isSynced).toBe(true);
      });
      expect(contextStore.value.plan.programName).toBe("E2E Plan");
      expect(contextStore.value.profile.goal).toBe("strength");
      expect(contextStore.value.workouts).toHaveLength(1);
      expect(contextStore.value.userData).toEqual({
        profile: contextStore.value.profile,
        plan: contextStore.value.plan,
        history: contextStore.value.workouts,
      });

      firestoreServiceMock.deleteUserData.mockResolvedValueOnce({
        deletedWorkoutsCount: 1,
      });

      let deleteResult;
      await act(async () => {
        deleteResult = await contextStore.value.deleteAll();
      });

      expect(firestoreServiceMock.deleteUserData).toHaveBeenCalledWith(
        "user-e2e"
      );
      expect(deleteResult).toEqual({ deletedWorkoutsCount: 1 });
      expect(contextStore.value.plan).toBeNull();
      expect(contextStore.value.profile).toBeNull();
      expect(contextStore.value.workouts).toEqual([]);
      expect(contextStore.value.userData).toEqual({
        profile: null,
        plan: null,
        history: [],
      });
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});

describe("App auth context, logout hygiene, and anonymous sign-out", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetAllMocks();
    authCallbacks.listener = null;
    contextStore.value = null;
    authMocks.logout.mockResolvedValue(undefined);
    authMocks.subscribeToAuthChanges.mockImplementation((cb) => {
      authCallbacks.listener = cb;
      return vi.fn();
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("exposes the exact 25 AppContext keys (unified data layer without setUserData)", () => {
    render(<App />);

    expect(Object.keys(contextStore.value).sort()).toEqual([
      "activeWorkout",
      "addWorkout",
      "clearStorage",
      "deleteAll",
      "error",
      "handleResetSystem",
      "handleSavePlan",
      "isSynced",
      "plan",
      "profile",
      "resetProgram",
      "retrySync",
      "savePlan",
      "setActiveWorkout",
      "setShowAuth",
      "setUser",
      "setView",
      "showAuth",
      "status",
      "syncError",
      "updatePlan",
      "user",
      "userData",
      "view",
      "workouts",
    ]);
    expect(contextStore.value.setUserData).toBeUndefined();
  });

  it("clears userData, activeWorkout, all active workout localStorage keys, and sets view to welcome on null auth transition", async () => {
    firestoreServiceMock.getUserData.mockResolvedValueOnce({
      plan: { programName: "PPL", weeks: [] },
      profile: { goal: "muscle" },
    });
    firestoreServiceMock.getWorkouts.mockResolvedValueOnce([{ id: "w-1" }]);

    localStorage.setItem("fitgen:active:v1", JSON.stringify({ weekNumber: 1 }));
    localStorage.setItem("fitgen-active", JSON.stringify({ legacy: true }));
    localStorage.setItem("fitgen-active-w2-d3", "{}");
    localStorage.setItem("theme", "dark");

    render(<App />);

    await act(async () => {
      authCallbacks.listener({ uid: "user-signed-in", isAnonymous: false });
    });

    await waitFor(() => {
      expect(contextStore.value.isSynced).toBe(true);
      expect(contextStore.value.view).toBe("plan");
    });

    act(() => {
      contextStore.value.setActiveWorkout({ weekNumber: 1, dayName: "Monday" });
    });

    await act(async () => {
      authCallbacks.listener(null);
    });

    expect(contextStore.value.user).toBeNull();
    expect(contextStore.value.profile).toBeNull();
    expect(contextStore.value.plan).toBeNull();
    expect(contextStore.value.workouts).toEqual([]);
    expect(contextStore.value.userData).toEqual({
      profile: null,
      plan: null,
      history: [],
    });
    expect(contextStore.value.activeWorkout).toBeNull();
    expect(contextStore.value.view).toBe("welcome");
    expect(localStorage.getItem("fitgen:active:v1")).toBeNull();
    expect(localStorage.getItem("fitgen-active")).toBeNull();
    expect(localStorage.getItem("fitgen-active-w2-d3")).toBeNull();
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  it("signs out an anonymous auth event, clears activeWorkout and active storage, stays on welcome, and skips Firestore sync", async () => {
    localStorage.setItem("fitgen:active:v1", JSON.stringify({ weekNumber: 1 }));
    localStorage.setItem("fitgen-active", JSON.stringify({ legacy: true }));
    localStorage.setItem("fitgen-active-anon", "{}");

    render(<App />);

    act(() => {
      contextStore.value.setActiveWorkout({ weekNumber: 1, dayName: "Monday" });
    });

    await act(async () => {
      authCallbacks.listener({ uid: "anon-1", isAnonymous: true });
    });

    expect(authMocks.logout).toHaveBeenCalledTimes(1);
    expect(contextStore.value.user).toBeNull();
    expect(contextStore.value.activeWorkout).toBeNull();
    expect(contextStore.value.view).toBe("welcome");
    expect(localStorage.getItem("fitgen:active:v1")).toBeNull();
    expect(localStorage.getItem("fitgen-active")).toBeNull();
    expect(localStorage.getItem("fitgen-active-anon")).toBeNull();
    expect(firestoreServiceMock.getUserData).not.toHaveBeenCalled();
    expect(firestoreServiceMock.getWorkouts).not.toHaveBeenCalled();
  });
});
