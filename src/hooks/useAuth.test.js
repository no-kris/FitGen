import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const authServiceMock = vi.hoisted(() => ({
  signUp: vi.fn(),
  signIn: vi.fn(),
  logout: vi.fn(),
  resetPassword: vi.fn(),
  reauthenticate: vi.fn(),
  deleteAccount: vi.fn(),
  subscribeToAuthChanges: vi.fn(),
}));

const firestoreServiceMock = vi.hoisted(() => ({
  clearUserData: vi.fn(),
  resetUserProgram: vi.fn(),
  deleteUserData: vi.fn(),
}));

const activeWorkoutStoreMock = vi.hoisted(() => ({
  clear: vi.fn(),
}));

const emailServiceMock = vi.hoisted(() => vi.fn());

vi.mock("../services/firebase/authServices", () => ({
  authService: authServiceMock,
}));

vi.mock("../services/firebase/firestoreServices", () => ({
  firestoreService: firestoreServiceMock,
}));

vi.mock("../services/storage/activeWorkoutStore", () => ({
  activeWorkoutStore: activeWorkoutStoreMock,
}));

vi.mock("../services/api/emailService", () => ({
  default: emailServiceMock,
}));

import { useAuth } from "./useAuth";

describe("useAuth", () => {
  let consoleErrorSpy;
  let originalAlert;

  beforeEach(() => {
    vi.resetAllMocks();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    originalAlert = globalThis.alert;
    globalThis.alert = vi.fn();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    globalThis.alert = originalAlert;
  });

  it("returns only the 5 email-account auth handlers", () => {
    const handlers = useAuth({
      user: { uid: "u-1", isAnonymous: false },
      clearStorage: vi.fn(),
      setShowAuth: vi.fn(),
    });

    expect(Object.keys(handlers).sort()).toEqual([
      "handleDeleteAccount",
      "handleLogin",
      "handleLogout",
      "handleResetPassword",
      "handleSignUp",
    ]);
  });

  it("supports calling useAuth with no arguments", () => {
    let handlers;
    expect(() => {
      handlers = useAuth();
    }).not.toThrow();

    expect(Object.keys(handlers).sort()).toEqual([
      "handleDeleteAccount",
      "handleLogin",
      "handleLogout",
      "handleResetPassword",
      "handleSignUp",
    ]);
  });

  describe("handleLogout", () => {
    it("awaits authService.logout then clears activeWorkoutStore and invokes clearStorage without deleting cloud data", async () => {
      const callOrder = [];
      const clearStorage = vi.fn(() => callOrder.push("clearStorage"));
      authServiceMock.logout.mockImplementationOnce(async () => {
        callOrder.push("logout");
      });
      activeWorkoutStoreMock.clear.mockImplementationOnce(() => {
        callOrder.push("activeWorkoutStore.clear");
      });

      const { handleLogout } = useAuth({
        user: { uid: "u-1", isAnonymous: false },
        clearStorage,
        setShowAuth: vi.fn(),
      });

      await handleLogout();

      expect(callOrder).toEqual([
        "logout",
        "activeWorkoutStore.clear",
        "clearStorage",
      ]);
      expect(firestoreServiceMock.deleteUserData).not.toHaveBeenCalled();
      expect(firestoreServiceMock.resetUserProgram).not.toHaveBeenCalled();
      expect(firestoreServiceMock.clearUserData).not.toHaveBeenCalled();
      expect(authServiceMock.deleteAccount).not.toHaveBeenCalled();
    });

    it("clears storage on logout even if user.isAnonymous is true and handles omitted clearStorage", async () => {
      authServiceMock.logout.mockResolvedValueOnce(undefined);

      const { handleLogout } = useAuth({
        user: { uid: "anon-1", isAnonymous: true },
        setShowAuth: vi.fn(),
      });

      await expect(handleLogout()).resolves.toBeUndefined();

      expect(authServiceMock.logout).toHaveBeenCalledTimes(1);
      expect(activeWorkoutStoreMock.clear).toHaveBeenCalledTimes(1);
      expect(firestoreServiceMock.deleteUserData).not.toHaveBeenCalled();
      expect(firestoreServiceMock.resetUserProgram).not.toHaveBeenCalled();
      expect(authServiceMock.deleteAccount).not.toHaveBeenCalled();
    });

    it("logs, rethrows a clear error, and preserves local storage when authService.logout rejects", async () => {
      const logoutError = new Error("Network failure");
      const clearStorage = vi.fn();
      authServiceMock.logout.mockRejectedValueOnce(logoutError);

      const { handleLogout } = useAuth({
        user: { uid: "u-1", isAnonymous: false },
        clearStorage,
        setShowAuth: vi.fn(),
      });

      await expect(handleLogout()).rejects.toThrow(
        "Failed to log out. Please try again."
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Logout failed",
        logoutError
      );
      expect(activeWorkoutStoreMock.clear).not.toHaveBeenCalled();
      expect(clearStorage).not.toHaveBeenCalled();
    });
  });

  describe("handleDeleteAccount", () => {
    it("executes reauthenticate -> deleteUserData -> deleteAccount -> local cleanup in strict order with zero alert() calls", async () => {
      const callOrder = [];
      const clearStorage = vi.fn(() => callOrder.push("clearStorage"));

      authServiceMock.reauthenticate.mockImplementationOnce(async (pw) => {
        callOrder.push(`reauthenticate:${pw}`);
      });
      firestoreServiceMock.deleteUserData.mockImplementationOnce(async (uid) => {
        callOrder.push(`deleteUserData:${uid}`);
        return { deletedWorkoutsCount: 3 };
      });
      authServiceMock.deleteAccount.mockImplementationOnce(async () => {
        callOrder.push("deleteAccount");
      });
      activeWorkoutStoreMock.clear.mockImplementationOnce(() => {
        callOrder.push("activeWorkoutStore.clear");
      });

      const { handleDeleteAccount } = useAuth({
        user: { uid: "user-del-1", email: "user@example.com" },
        clearStorage,
        setShowAuth: vi.fn(),
      });

      const result = await handleDeleteAccount("my pass 123");

      expect(result).toEqual({ deleted: true });
      expect(callOrder).toEqual([
        "reauthenticate:my pass 123",
        "deleteUserData:user-del-1",
        "deleteAccount",
        "activeWorkoutStore.clear",
        "clearStorage",
      ]);
      expect(firestoreServiceMock.clearUserData).not.toHaveBeenCalled();
      expect(globalThis.alert).not.toHaveBeenCalled();
    });

    it("rejects immediately when password is empty or missing with zero external calls", async () => {
      const clearStorage = vi.fn();
      const { handleDeleteAccount } = useAuth({
        user: { uid: "user-1" },
        clearStorage,
      });

      await expect(handleDeleteAccount("")).rejects.toThrow(
        "Please enter your password to confirm account deletion."
      );
      await expect(handleDeleteAccount(undefined)).rejects.toThrow(
        "Please enter your password to confirm account deletion."
      );

      expect(authServiceMock.reauthenticate).not.toHaveBeenCalled();
      expect(firestoreServiceMock.deleteUserData).not.toHaveBeenCalled();
      expect(firestoreServiceMock.clearUserData).not.toHaveBeenCalled();
      expect(authServiceMock.deleteAccount).not.toHaveBeenCalled();
      expect(activeWorkoutStoreMock.clear).not.toHaveBeenCalled();
      expect(clearStorage).not.toHaveBeenCalled();
      expect(globalThis.alert).not.toHaveBeenCalled();
    });

    it("rejects immediately when user or user.uid is missing with zero external calls", async () => {
      const clearStorage = vi.fn();
      const { handleDeleteAccount } = useAuth({
        user: null,
        clearStorage,
      });

      await expect(handleDeleteAccount("secret")).rejects.toThrow(
        "No authenticated user found."
      );

      expect(authServiceMock.reauthenticate).not.toHaveBeenCalled();
      expect(firestoreServiceMock.deleteUserData).not.toHaveBeenCalled();
      expect(authServiceMock.deleteAccount).not.toHaveBeenCalled();
      expect(activeWorkoutStoreMock.clear).not.toHaveBeenCalled();
      expect(clearStorage).not.toHaveBeenCalled();
      expect(globalThis.alert).not.toHaveBeenCalled();
    });

    it("aborts on re-auth wrong-password / invalid-credential and makes zero Firestore, Auth delete, or storage cleanup calls", async () => {
      const clearStorage = vi.fn();
      const { handleDeleteAccount } = useAuth({
        user: { uid: "user-1" },
        clearStorage,
      });

      for (const code of ["auth/wrong-password", "auth/invalid-credential"]) {
        vi.clearAllMocks();
        authServiceMock.reauthenticate.mockRejectedValueOnce(
          Object.assign(new Error("Firebase auth error"), { code })
        );

        await expect(handleDeleteAccount("bad-pass")).rejects.toMatchObject({
          message: "Incorrect password. Please try again.",
          code,
          stage: "reauthenticate",
        });

        expect(firestoreServiceMock.deleteUserData).not.toHaveBeenCalled();
        expect(firestoreServiceMock.clearUserData).not.toHaveBeenCalled();
        expect(authServiceMock.deleteAccount).not.toHaveBeenCalled();
        expect(activeWorkoutStoreMock.clear).not.toHaveBeenCalled();
        expect(clearStorage).not.toHaveBeenCalled();
        expect(globalThis.alert).not.toHaveBeenCalled();
      }
    });

    it("maps too-many-requests, network-request-failed, and user-mismatch re-auth errors cleanly", async () => {
      const { handleDeleteAccount } = useAuth({
        user: { uid: "user-1" },
        clearStorage: vi.fn(),
      });

      const cases = [
        [
          "auth/too-many-requests",
          "Too many failed attempts. Please wait a moment and try again.",
        ],
        [
          "auth/network-request-failed",
          "Network error. Please check your connection and try again.",
        ],
        [
          "auth/user-mismatch",
          "Unable to verify your account. Please log out and sign back in.",
        ],
      ];

      for (const [code, expectedMessage] of cases) {
        authServiceMock.reauthenticate.mockRejectedValueOnce(
          Object.assign(new Error("raw"), { code })
        );
        await expect(handleDeleteAccount("pass")).rejects.toMatchObject({
          message: expectedMessage,
          code,
          stage: "reauthenticate",
        });
      }
    });

    it("aborts on Firestore deleteUserData failure without deleting Auth account or clearing local storage", async () => {
      const clearStorage = vi.fn();
      authServiceMock.reauthenticate.mockResolvedValueOnce(undefined);
      firestoreServiceMock.deleteUserData.mockRejectedValueOnce(
        Object.assign(new Error("permission-denied"), {
          code: "permission-denied",
        })
      );

      const { handleDeleteAccount } = useAuth({
        user: { uid: "user-fs-fail" },
        clearStorage,
      });

      await expect(handleDeleteAccount("good-pass")).rejects.toMatchObject({
        message:
          "Failed to delete your cloud data. Your account was not deleted. Please try again.",
        code: "permission-denied",
        stage: "firestore",
      });

      expect(authServiceMock.reauthenticate).toHaveBeenCalledTimes(1);
      expect(firestoreServiceMock.deleteUserData).toHaveBeenCalledWith(
        "user-fs-fail"
      );
      expect(authServiceMock.deleteAccount).not.toHaveBeenCalled();
      expect(activeWorkoutStoreMock.clear).not.toHaveBeenCalled();
      expect(clearStorage).not.toHaveBeenCalled();
      expect(globalThis.alert).not.toHaveBeenCalled();
    });

    it("propagates Auth deleteAccount failures with stage=auth and does not clear storage", async () => {
      const clearStorage = vi.fn();
      const { handleDeleteAccount } = useAuth({
        user: { uid: "user-auth-fail" },
        clearStorage,
      });

      authServiceMock.reauthenticate.mockResolvedValueOnce(undefined);
      firestoreServiceMock.deleteUserData.mockResolvedValueOnce({
        deletedWorkoutsCount: 0,
      });
      authServiceMock.deleteAccount.mockRejectedValueOnce(
        Object.assign(new Error("Recent login required"), {
          code: "auth/requires-recent-login",
        })
      );

      await expect(handleDeleteAccount("good-pass")).rejects.toMatchObject({
        message:
          "Your session expired before account deletion completed. Please re-enter your password and try again.",
        code: "auth/requires-recent-login",
        stage: "auth",
      });
      expect(activeWorkoutStoreMock.clear).not.toHaveBeenCalled();
      expect(clearStorage).not.toHaveBeenCalled();
      expect(globalThis.alert).not.toHaveBeenCalled();

      vi.clearAllMocks();
      authServiceMock.reauthenticate.mockResolvedValueOnce(undefined);
      firestoreServiceMock.deleteUserData.mockResolvedValueOnce({
        deletedWorkoutsCount: 1,
      });
      authServiceMock.deleteAccount.mockRejectedValueOnce(
        Object.assign(new Error("Internal error"), {
          code: "auth/internal-error",
        })
      );

      await expect(handleDeleteAccount("good-pass")).rejects.toMatchObject({
        message:
          "Your cloud data was deleted, but we could not remove your login account. Please try again.",
        code: "auth/internal-error",
        stage: "auth",
      });
      expect(activeWorkoutStoreMock.clear).not.toHaveBeenCalled();
      expect(clearStorage).not.toHaveBeenCalled();
      expect(globalThis.alert).not.toHaveBeenCalled();
    });
  });
});
