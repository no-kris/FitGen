import { describe, it, expect, vi, beforeEach } from "vitest";

const firebaseAuthMocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  deleteUser: vi.fn(),
  reauthenticateWithCredential: vi.fn(),
  credential: vi.fn(),
}));

const fakeAuth = vi.hoisted(() => ({ currentUser: null }));

vi.mock("firebase/auth", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    signOut: firebaseAuthMocks.signOut,
    deleteUser: firebaseAuthMocks.deleteUser,
    reauthenticateWithCredential:
      firebaseAuthMocks.reauthenticateWithCredential,
    EmailAuthProvider: {
      credential: firebaseAuthMocks.credential,
    },
  };
});

vi.mock("./firebaseHelper", () => ({
  auth: fakeAuth,
}));

import { authService } from "./authServices";

describe("authService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    fakeAuth.currentUser = null;
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

  describe("reauthenticate", () => {
    it("creates an email credential for auth.currentUser and calls reauthenticateWithCredential", async () => {
      const user = { uid: "u-1", email: "athlete@example.com" };
      const fakeCredential = { providerId: "password" };
      fakeAuth.currentUser = user;
      firebaseAuthMocks.credential.mockReturnValueOnce(fakeCredential);
      firebaseAuthMocks.reauthenticateWithCredential.mockResolvedValueOnce(
        undefined
      );

      await authService.reauthenticate("secret-pass");

      expect(firebaseAuthMocks.credential).toHaveBeenCalledTimes(1);
      expect(firebaseAuthMocks.credential).toHaveBeenCalledWith(
        "athlete@example.com",
        "secret-pass"
      );
      expect(
        firebaseAuthMocks.reauthenticateWithCredential
      ).toHaveBeenCalledTimes(1);
      expect(
        firebaseAuthMocks.reauthenticateWithCredential
      ).toHaveBeenCalledWith(user, fakeCredential);
    });

    it("rejects with a descriptive error when auth.currentUser is null", async () => {
      fakeAuth.currentUser = null;

      await expect(authService.reauthenticate("secret-pass")).rejects.toThrow(
        "No authenticated email user found."
      );
      expect(firebaseAuthMocks.credential).not.toHaveBeenCalled();
      expect(
        firebaseAuthMocks.reauthenticateWithCredential
      ).not.toHaveBeenCalled();
    });

    it("rejects with a descriptive error when auth.currentUser.email is missing", async () => {
      fakeAuth.currentUser = { uid: "u-no-email", email: "" };

      await expect(authService.reauthenticate("secret-pass")).rejects.toThrow(
        "No authenticated email user found."
      );
      expect(firebaseAuthMocks.credential).not.toHaveBeenCalled();
      expect(
        firebaseAuthMocks.reauthenticateWithCredential
      ).not.toHaveBeenCalled();
    });

    it("rejects with a descriptive error when password is empty or non-string", async () => {
      fakeAuth.currentUser = { uid: "u-1", email: "athlete@example.com" };

      await expect(authService.reauthenticate("")).rejects.toThrow(
        "Password is required for re-authentication."
      );
      await expect(authService.reauthenticate(undefined)).rejects.toThrow(
        "Password is required for re-authentication."
      );
      expect(firebaseAuthMocks.credential).not.toHaveBeenCalled();
      expect(
        firebaseAuthMocks.reauthenticateWithCredential
      ).not.toHaveBeenCalled();
    });

    it("propagates Firebase Auth errors including error.code unchanged", async () => {
      const user = { uid: "u-1", email: "athlete@example.com" };
      const authError = Object.assign(new Error("Firebase: wrong password"), {
        code: "auth/wrong-password",
      });
      fakeAuth.currentUser = user;
      firebaseAuthMocks.credential.mockReturnValueOnce({ id: "cred" });
      firebaseAuthMocks.reauthenticateWithCredential.mockRejectedValueOnce(
        authError
      );

      await expect(
        authService.reauthenticate("wrong-pass")
      ).rejects.toMatchObject({
        message: "Firebase: wrong password",
        code: "auth/wrong-password",
      });
    });
  });

  describe("deleteAccount", () => {
    it("rejects with a descriptive error when auth.currentUser is null", async () => {
      fakeAuth.currentUser = null;

      await expect(authService.deleteAccount()).rejects.toThrow(
        "No authenticated user found."
      );
      expect(firebaseAuthMocks.deleteUser).not.toHaveBeenCalled();
    });

    it("calls deleteUser with auth.currentUser when signed in", async () => {
      const user = { uid: "u-1", email: "athlete@example.com" };
      fakeAuth.currentUser = user;
      firebaseAuthMocks.deleteUser.mockResolvedValueOnce(undefined);

      await authService.deleteAccount();

      expect(firebaseAuthMocks.deleteUser).toHaveBeenCalledTimes(1);
      expect(firebaseAuthMocks.deleteUser).toHaveBeenCalledWith(user);
    });

    it("propagates Firebase Auth errors including error.code unchanged", async () => {
      const user = { uid: "u-1", email: "athlete@example.com" };
      const recentLoginError = Object.assign(
        new Error("Requires recent login"),
        { code: "auth/requires-recent-login" }
      );
      fakeAuth.currentUser = user;
      firebaseAuthMocks.deleteUser.mockRejectedValueOnce(recentLoginError);

      await expect(authService.deleteAccount()).rejects.toMatchObject({
        message: "Requires recent login",
        code: "auth/requires-recent-login",
      });
    });
  });
});
