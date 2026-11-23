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
}));

const emailServiceMock = vi.hoisted(() => vi.fn());

vi.mock("../services/firebase/authServices", () => ({
  authService: authServiceMock,
}));

vi.mock("../services/firebase/firestoreServices", () => ({
  firestoreService: firestoreServiceMock,
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

  it("calls authService.logout unconditionally without deleting data even if user.isAnonymous is true", async () => {
    const clearStorage = vi.fn();
    authServiceMock.logout.mockResolvedValueOnce(undefined);

    const { handleLogout } = useAuth({
      user: { uid: "anon-1", isAnonymous: true },
      clearStorage,
      setShowAuth: vi.fn(),
    });

    await handleLogout();

    expect(authServiceMock.logout).toHaveBeenCalledTimes(1);
    expect(firestoreServiceMock.clearUserData).not.toHaveBeenCalled();
    expect(authServiceMock.deleteAccount).not.toHaveBeenCalled();
    expect(clearStorage).not.toHaveBeenCalled();
  });

  it("calls authService.logout for standard email accounts", async () => {
    const clearStorage = vi.fn();
    authServiceMock.logout.mockResolvedValueOnce(undefined);

    const { handleLogout } = useAuth({
      user: { uid: "u-1", isAnonymous: false },
      clearStorage,
      setShowAuth: vi.fn(),
    });

    await handleLogout();

    expect(authServiceMock.logout).toHaveBeenCalledTimes(1);
    expect(firestoreServiceMock.clearUserData).not.toHaveBeenCalled();
    expect(authServiceMock.deleteAccount).not.toHaveBeenCalled();
    expect(clearStorage).not.toHaveBeenCalled();
  });

  it("catches and logs errors from authService.logout without throwing", async () => {
    const logoutError = new Error("Logout failed");
    authServiceMock.logout.mockRejectedValueOnce(logoutError);

    const { handleLogout } = useAuth({
      user: { uid: "u-1", isAnonymous: false },
      clearStorage: vi.fn(),
      setShowAuth: vi.fn(),
    });

    await expect(handleLogout()).resolves.toBeUndefined();
    expect(consoleErrorSpy).toHaveBeenCalledWith("Logout failed", logoutError);
  });
});
