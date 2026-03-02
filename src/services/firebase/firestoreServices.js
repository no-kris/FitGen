import { doc, setDoc, getDoc, deleteDoc } from "firebase/firestore";
import { db } from "./firebaseHelper";

export const firestoreService = {
  saveUserData: async (userId, data) => {
    try {
      const userRef = doc(db, "users", userId);
      await setDoc(userRef, data, { merge: true });
    } catch (error) {
      console.log("Error saving user:", error);
      throw error;
    }
  },

  getUserData: async (userId) => {
    try {
      const userRef = doc(db, "users", userId);
      const docSnap = await getDoc(userRef);

      if (docSnap.exists()) {
        return docSnap.data();
      } else {
        return null;
      }
    } catch (error) {
      console.log("Error fetching user data:", error);
      throw error;
    }
  },

  clearUserData: async (userId) => {
    try {
      const userRef = doc(db, "users", userId);
      await deleteDoc(userRef);
    } catch (error) {
      console.log("Error clearing user data:", error);
      throw error;
    }
  },
};
