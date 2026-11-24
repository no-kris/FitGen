import { authService } from "../services/firebase/authServices";
import { firestoreService } from "../services/firebase/firestoreServices";
import { activeWorkoutStore } from "../services/storage/activeWorkoutStore";
import sendWelcomeMessage from "../services/api/emailService";

function mapReauthErrorMessage(error) {
  switch (error?.code) {
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect password. Please try again.";
    case "auth/too-many-requests":
      return "Too many failed attempts. Please wait a moment and try again.";
    case "auth/network-request-failed":
      return "Network error. Please check your connection and try again.";
    case "auth/user-mismatch":
    case "auth/user-not-found":
      return "Unable to verify your account. Please log out and sign back in.";
    default:
      return (
        error?.message || "Failed to verify your password. Please try again."
      );
  }
}

export function useAuth({ user, clearStorage, setShowAuth } = {}) {
  const handleSignUp = async (userData) => {
    try {
      await authService.signUp(userData.email, userData.password);
      sendWelcomeMessage(userData.email);
      alert("Account successfully created! Welcome email sent.");
      setShowAuth(false);
    } catch (error) {
      console.error("Signup failed", error);
      throw new Error("Failed to Sign up. Try again.");
    }
  };

  const handleLogin = async (userData) => {
    try {
      await authService.signIn(userData.email, userData.password);
      setShowAuth(false);
    } catch (error) {
      console.error("Login failed", error);
      throw new Error("Failed to login. Try again or create an account.");
    }
  };

  const handleResetPassword = async (email) => {
    try {
      await authService.resetPassword(email);
    } catch (error) {
      console.error("Reset password failed", error);
    }
  };

  const handleDeleteAccount = async (password) => {
    if (!user || !user.uid) {
      throw new Error("No authenticated user found.");
    }
    if (typeof password !== "string" || password.length === 0) {
      throw new Error("Please enter your password to confirm account deletion.");
    }

    try {
      await authService.reauthenticate(password);
    } catch (error) {
      console.error("Account deletion re-authentication failed:", error);
      const err = new Error(mapReauthErrorMessage(error));
      err.code = error?.code;
      err.stage = "reauthenticate";
      throw err;
    }

    try {
      await firestoreService.deleteUserData(user.uid);
    } catch (error) {
      console.error("Failed to delete user data:", error);
      const err = new Error(
        "Failed to delete your cloud data. Your account was not deleted. Please try again."
      );
      err.code = error?.code;
      err.stage = "firestore";
      throw err;
    }

    try {
      await authService.deleteAccount();
    } catch (error) {
      console.error("Failed to delete auth account:", error);
      const message =
        error?.code === "auth/requires-recent-login"
          ? "Your session expired before account deletion completed. Please re-enter your password and try again."
          : "Your cloud data was deleted, but we could not remove your login account. Please try again.";
      const err = new Error(message);
      err.code = error?.code;
      err.stage = "auth";
      throw err;
    }

    activeWorkoutStore.clear();
    if (typeof clearStorage === "function") {
      clearStorage();
    }
    return { deleted: true };
  };

  const handleLogout = async () => {
    try {
      await authService.logout();
    } catch (error) {
      console.error("Logout failed", error);
      throw new Error("Failed to log out. Please try again.");
    }
    activeWorkoutStore.clear();
    if (typeof clearStorage === "function") {
      clearStorage();
    }
  };

  return {
    handleSignUp,
    handleLogin,
    handleResetPassword,
    handleLogout,
    handleDeleteAccount,
  };
}
