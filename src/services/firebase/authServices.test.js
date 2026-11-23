import { describe, it, expect, vi, beforeEach } from "vitest";

const firebaseAuthMocks = vi.hoisted(() => ({
  signOut: vi.fn(),
}));

const fakeAuth = vi.hoisted(() => ({ currentUser: null }));

vi.mock("firebase/auth", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    signOut: firebaseAuthMocks.signOut,
  };
});

vi.mock("./firebaseHelper", () => ({
  auth: fakeAuth,
}));

import { authService } from "./authServices";

describe("authService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("exposes only the 7 email-account auth methods", () => {
    expect(Object.keys(authService).sort()).toEqual([
      "deleteAccount",
      "logout",
      "reauthenticate",
      "resetPassword",
      "signIn",
      "signUp",
      "subscribeToAuthChanges",
    ]);
  });

  it("calls signOut with the Firebase auth instance on logout", async () => {
    firebaseAuthMocks.signOut.mockResolvedValueOnce(undefined);

    await authService.logout();

    expect(firebaseAuthMocks.signOut).toHaveBeenCalledTimes(1);
    expect(firebaseAuthMocks.signOut).toHaveBeenCalledWith(fakeAuth);
  });
});
