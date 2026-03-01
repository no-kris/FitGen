import { authService } from "../services/firebase/authServices";
import { firestoreService } from "../services/firebase/firestoreServices";
import sendWelcomeMessage from "../services/api/emailService";

export function useAuth({ user, clearStorage, setShowAuth }) {
  const handleSignUp = async (userData) => {
    try {
      await authService.signUp(userData.email, userData.password);
      sendWelcomeMessage(userData.email);
      alert("Account successfully created! Welcome email sent.");
      setShowAuth(false);
    } catch (error) {
      console.error("Signup failed", error);
    }
  };

  const handleLogin = async (userData) => {
    try {
      await authService.signIn(userData.email, userData.password);
      setShowAuth(false);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleGuestLogin = async () => {
    try {
      await authService.signInGuest();
    } catch (error) {
      console.log("Guest login failed", error);
    }
  };

  const handleResetPassword = async (email) => {
    try {
      await authService.resetPassword(email);
    } catch (error) {
      console.error("Reset password failed", error);
    }
  };

  const handleDeleteAccount = async () => {
    try {
      clearStorage();
      await firestoreService.clearUserData(user.uid);
      await authService.deleteAccount();
      alert("Your account has been successfully deleted.");
    } catch (error) {
      console.log("Failed to delete the user", error);
      if (error.code === "auth/requires-recent-login") {
        alert(
          "For security reasons, please log out and log back in before deleting your account."
        );
      } else {
        alert("Failed to delete account completely. Please try again.");
      }
    }
  };

  const handleLogout = async () => {
    try {
      if (user && user.isAnonymous) {
        await handleDeleteAccount();
      } else {
        await authService.logout();
      }
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  return {
    handleSignUp,
    handleLogin,
    handleGuestLogin,
    handleResetPassword,
    handleLogout,
    handleDeleteAccount,
  };
}
