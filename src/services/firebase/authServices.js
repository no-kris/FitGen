import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
  signInAnonymously,
} from "firebase/auth";
import { auth } from "./firebaseHelper";

export const authService = {
  // Sign Up
  signUp: async (email, password) => {
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );
    const user = userCredential.user;

    return user;
  },

  // Sign In
  signIn: async (email, password) => {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );
    return userCredential.user;
  },

  // Sign in as anonymous user
  signInGuest: async () => {
    const userCredential = await signInAnonymously(auth);
    return userCredential.user;
  },

  // Log Out
  logout: async () => {
    await signOut(auth);
  },

  // Password Reset
  resetPassword: async (email) => {
    await sendPasswordResetEmail(auth, email);
  },

  // Re-authenticate
  reauthenticate: async (password) => {
    const user = auth.currentUser;
    const credential = EmailAuthProvider.credential(user.email, password);
    await reauthenticateWithCredential(user, credential);
  },

  // Delete User information
  deleteAccount: async () => {
    await deleteUser(auth.currentUser);
  },

  // Auth State Listener
  subscribeToAuthChanges: (callback) => {
    return onAuthStateChanged(auth, callback);
  },
};
