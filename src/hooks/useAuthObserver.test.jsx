// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";

const authServiceMock = vi.hoisted(() => ({
  subscribeToAuthChanges: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("../services/firebase/authServices", () => ({
  authService: authServiceMock,
}));

import { useAuthObserver } from "./useAuthObserver";

describe("useAuthObserver", () => {
  let authListener;
  let unsubscribeMock;
  let consoleErrorSpy;

  beforeEach(() => {
    vi.resetAllMocks();
    authListener = null;
    unsubscribeMock = vi.fn();
    authServiceMock.subscribeToAuthChanges.mockImplementation((cb) => {
      authListener = cb;
      return unsubscribeMock;
    });
    authServiceMock.logout.mockResolvedValue(undefined);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    consoleErrorSpy.mockRestore();
  });

  it("returns strictly user and setUser keys", () => {
    const { result } = renderHook(() => useAuthObserver(vi.fn()));

    expect(Object.keys(result.current).sort()).toEqual(["setUser", "user"]);
    expect(result.current.user).toBeNull();
  });

  it("sets user when a non-anonymous user signs in without logging out", () => {
    const onLogout = vi.fn();
    const { result } = renderHook(() => useAuthObserver(onLogout));
    const emailUser = { uid: "u1", isAnonymous: false };

    act(() => {
      authListener(emailUser);
    });

    expect(result.current.user).toEqual(emailUser);
    expect(authServiceMock.logout).not.toHaveBeenCalled();
    expect(onLogout).not.toHaveBeenCalled();
  });

  it("keeps user null, calls authService.logout, and invokes onLogout for an anonymous user", () => {
    const onLogout = vi.fn();
    const { result } = renderHook(() => useAuthObserver(onLogout));

    act(() => {
      authListener({ uid: "a1", isAnonymous: true });
    });

    expect(result.current.user).toBeNull();
    expect(authServiceMock.logout).toHaveBeenCalledTimes(1);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("handles asynchronous rejection from authService.logout safely during anonymous sign-out", async () => {
    const logoutError = new Error("Async sign-out failure");
    authServiceMock.logout.mockRejectedValueOnce(logoutError);
    const onLogout = vi.fn();
    const { result } = renderHook(() => useAuthObserver(onLogout));

    act(() => {
      authListener({ uid: "a2", isAnonymous: true });
    });

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    expect(result.current.user).toBeNull();
    expect(authServiceMock.logout).toHaveBeenCalledTimes(1);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("handles synchronous throw from authService.logout safely during anonymous sign-out", () => {
    const logoutError = new Error("Sync sign-out failure");
    authServiceMock.logout.mockImplementationOnce(() => {
      throw logoutError;
    });
    const onLogout = vi.fn();
    const { result } = renderHook(() => useAuthObserver(onLogout));

    expect(() => {
      act(() => {
        authListener({ uid: "a3", isAnonymous: true });
      });
    }).not.toThrow();

    expect(result.current.user).toBeNull();
    expect(authServiceMock.logout).toHaveBeenCalledTimes(1);
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("resets user to null and calls onLogout when auth emits null", () => {
    const onLogout = vi.fn();
    const { result } = renderHook(() => useAuthObserver(onLogout));

    act(() => {
      authListener({ uid: "u1", isAnonymous: false });
    });
    expect(result.current.user).toEqual({ uid: "u1", isAnonymous: false });

    act(() => {
      authListener(null);
    });

    expect(result.current.user).toBeNull();
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("invokes the unsubscribe callback on unmount", () => {
    const { unmount } = renderHook(() => useAuthObserver(vi.fn()));

    expect(unsubscribeMock).not.toHaveBeenCalled();
    unmount();
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });
});
