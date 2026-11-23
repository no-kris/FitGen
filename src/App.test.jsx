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

describe("App handleSavePlan and sync guard", () => {
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

  it("blocks handleSavePlan while user is signed in and isSynced is false, with zero Firestore writes", async () => {
    const userDeferred = createDeferred();
    firestoreServiceMock.getUserData.mockReturnValueOnce(userDeferred.promise);
    firestoreServiceMock.getWorkouts.mockResolvedValueOnce([]);

    render(<App />);

    await act(async () => {
      authCallbacks.listener({ uid: "user-1", isAnonymous: false });
    });

    expect(contextStore.value.isSynced).toBe(false);

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
  });

  it("clearStorage clears both fitgen:active:v1 and legacy fitgen-active keys", async () => {
    localStorage.setItem("fitgen:active:v1", JSON.stringify({ weekNumber: 1 }));
    localStorage.setItem("fitgen-active", JSON.stringify({ old: true }));

    render(<App />);

    act(() => {
      contextStore.value.clearStorage();
    });

    expect(localStorage.getItem("fitgen:active:v1")).toBeNull();
    expect(localStorage.getItem("fitgen-active")).toBeNull();
  });
});

describe("App auth context and anonymous sign-out", () => {
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

  it("exposes the exact 15 AppContext keys", () => {
    render(<App />);

    expect(Object.keys(contextStore.value).sort()).toEqual([
      "activeWorkout",
      "clearStorage",
      "handleResetSystem",
      "handleSavePlan",
      "isSynced",
      "setActiveWorkout",
      "setShowAuth",
      "setUser",
      "setUserData",
      "setView",
      "showAuth",
      "syncError",
      "user",
      "userData",
      "view",
    ]);
  });

  it("signs out an anonymous auth event, stays on welcome, and skips Firestore sync", async () => {
    render(<App />);

    await act(async () => {
      authCallbacks.listener({ uid: "anon-1", isAnonymous: true });
    });

    expect(authMocks.logout).toHaveBeenCalledTimes(1);
    expect(contextStore.value.user).toBeNull();
    expect(contextStore.value.view).toBe("welcome");
    expect(firestoreServiceMock.getUserData).not.toHaveBeenCalled();
    expect(firestoreServiceMock.getWorkouts).not.toHaveBeenCalled();
  });
});
