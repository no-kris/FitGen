import {
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  writeBatch,
  deleteField,
} from "firebase/firestore";
import { db } from "./firebaseHelper";

export const COLLECTIONS = {
  USERS: "users",
  WORKOUTS: "workouts",
};

const BATCH_LIMIT = 450;

export function stripUndefined(value) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => stripUndefined(item));
  }

  if (value !== null && typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      return value;
    }

    const cleaned = {};
    for (const [key, val] of Object.entries(value)) {
      if (val !== undefined) {
        cleaned[key] = stripUndefined(val);
      }
    }
    return cleaned;
  }

  return value;
}

export function normalizeWorkoutEntry(rawEntry, fallbackCompletedAt = "") {
  const entry = rawEntry && typeof rawEntry === "object" ? rawEntry : {};
  const nested =
    entry.workout && typeof entry.workout === "object" ? entry.workout : {};

  const rawWeek = entry.weekNumber ?? nested.weekNumber;
  const weekNumber =
    typeof rawWeek === "number" && Number.isFinite(rawWeek) && rawWeek >= 0
      ? Math.trunc(rawWeek)
      : 0;

  const rawDayNumber = entry.dayNumber ?? nested.dayNumber;
  const dayNumber =
    typeof rawDayNumber === "number" && Number.isFinite(rawDayNumber)
      ? Math.trunc(rawDayNumber)
      : null;

  const rawDayName = entry.dayName ?? nested.dayName;
  const dayName = typeof rawDayName === "string" ? rawDayName : "";

  const rawFocus = entry.focus ?? nested.focus;
  const focus = typeof rawFocus === "string" ? rawFocus : "";

  const logs = Array.isArray(entry.logs) ? entry.logs : [];

  const rawDuration = entry.duration;
  const duration =
    typeof rawDuration === "number" &&
    Number.isFinite(rawDuration) &&
    rawDuration >= 0
      ? rawDuration
      : 0;

  const rawCompletedAt =
    entry.completedAt ?? nested.date ?? fallbackCompletedAt;
  const completedAt =
    typeof rawCompletedAt === "string" ? rawCompletedAt : "";

  return stripUndefined({
    weekNumber,
    dayNumber,
    dayName,
    focus,
    logs,
    duration,
    completedAt,
  });
}

function sanitizeIdPart(str) {
  return String(str).replace(/[^a-zA-Z0-9-]/g, "_");
}

export function buildMigrationWorkoutId(normalizedEntry, index = 0) {
  const weekPart = normalizedEntry?.weekNumber ?? 0;
  const dayPart =
    normalizedEntry?.dayNumber != null
      ? `d${normalizedEntry.dayNumber}`
      : sanitizeIdPart((normalizedEntry?.dayName || "day").toLowerCase());
  const datePart = normalizedEntry?.completedAt
    ? sanitizeIdPart(normalizedEntry.completedAt)
    : `idx${index}`;

  return `migrated-w${weekPart}-${dayPart}-${datePart}`;
}

export const firestoreService = {
  saveUserData: async (userId, data) => {
    if (!userId) {
      throw new Error("User ID is required to save user data.");
    }
    try {
      const sanitizedData = { ...(data || {}) };
      delete sanitizedData.history;
      delete sanitizedData.workouts;

      const cleaned = stripUndefined({
        ...sanitizedData,
        updatedAt: new Date().toISOString(),
      });
      const userRef = doc(db, COLLECTIONS.USERS, userId);
      await setDoc(userRef, cleaned, { merge: true });
    } catch (error) {
      console.error("Error saving user:", error);
      throw error;
    }
  },

  getUserData: async (userId) => {
    try {
      const userRef = doc(db, COLLECTIONS.USERS, userId);
      const docSnap = await getDoc(userRef);

      if (docSnap.exists()) {
        return docSnap.data();
      } else {
        return null;
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
      throw error;
    }
  },

  addWorkout: async (userId, workoutData) => {
    if (!userId) {
      throw new Error("User ID is required to add a workout.");
    }
    try {
      const payload = normalizeWorkoutEntry(
        workoutData,
        new Date().toISOString()
      );
      const workoutsRef = collection(
        db,
        COLLECTIONS.USERS,
        userId,
        COLLECTIONS.WORKOUTS
      );
      const docRef = await addDoc(workoutsRef, payload);
      return { id: docRef.id, ...payload };
    } catch (error) {
      console.error("Error adding workout:", error);
      throw error;
    }
  },

  getWorkouts: async (userId) => {
    if (!userId) {
      throw new Error("User ID is required to fetch workouts.");
    }
    try {
      const workoutsRef = collection(
        db,
        COLLECTIONS.USERS,
        userId,
        COLLECTIONS.WORKOUTS
      );
      const q = query(workoutsRef, orderBy("completedAt", "asc"));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (error) {
      console.error("Error fetching workouts:", error);
      throw error;
    }
  },

  migrateLegacyHistory: async (userId, legacyHistory) => {
    if (!userId) {
      throw new Error("User ID is required to migrate workout history.");
    }
    if (!Array.isArray(legacyHistory)) {
      return { migratedCount: 0 };
    }

    try {
      const userRef = doc(db, COLLECTIONS.USERS, userId);
      const validEntries = [];
      legacyHistory.forEach((entry, index) => {
        if (entry && typeof entry === "object" && !Array.isArray(entry)) {
          validEntries.push({ entry, index });
        }
      });

      if (validEntries.length === 0) {
        const batch = writeBatch(db);
        batch.set(
          userRef,
          { history: deleteField(), updatedAt: new Date().toISOString() },
          { merge: true }
        );
        await batch.commit();
        return { migratedCount: 0 };
      }

      const chunks = [];
      for (let i = 0; i < validEntries.length; i += BATCH_LIMIT) {
        chunks.push(validEntries.slice(i, i + BATCH_LIMIT));
      }

      for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx += 1) {
        const chunk = chunks[chunkIdx];
        const batch = writeBatch(db);

        for (const { entry, index } of chunk) {
          const normalized = normalizeWorkoutEntry(entry);
          const docId = buildMigrationWorkoutId(normalized, index);
          const workoutRef = doc(
            db,
            COLLECTIONS.USERS,
            userId,
            COLLECTIONS.WORKOUTS,
            docId
          );
          batch.set(workoutRef, normalized);
        }

        if (chunkIdx === chunks.length - 1) {
          batch.set(
            userRef,
            { history: deleteField(), updatedAt: new Date().toISOString() },
            { merge: true }
          );
        }

        await batch.commit();
      }

      return { migratedCount: validEntries.length };
    } catch (error) {
      console.error("Error migrating legacy history:", error);
      throw error;
    }
  },

  resetUserProgram: async (userId) => {
    if (!userId) {
      throw new Error("User ID is required to reset program.");
    }
    try {
      const userRef = doc(db, COLLECTIONS.USERS, userId);
      await setDoc(
        userRef,
        {
          plan: null,
          profile: null,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (error) {
      console.error("Error resetting user program:", error);
      throw error;
    }
  },

  deleteUserData: async (userId) => {
    if (!userId) {
      throw new Error("User ID is required to delete user data.");
    }
    try {
      const workoutsRef = collection(
        db,
        COLLECTIONS.USERS,
        userId,
        COLLECTIONS.WORKOUTS
      );
      const snapshot = await getDocs(workoutsRef);
      const workoutRefs = snapshot.docs.map((d) =>
        doc(db, COLLECTIONS.USERS, userId, COLLECTIONS.WORKOUTS, d.id)
      );
      const userRef = doc(db, COLLECTIONS.USERS, userId);
      const refsToDelete = [...workoutRefs, userRef];

      for (let i = 0; i < refsToDelete.length; i += BATCH_LIMIT) {
        const chunk = refsToDelete.slice(i, i + BATCH_LIMIT);
        const batch = writeBatch(db);
        for (const ref of chunk) {
          batch.delete(ref);
        }
        await batch.commit();
      }

      return { deletedWorkoutsCount: workoutRefs.length };
    } catch (error) {
      console.error("Error deleting user data:", error);
      throw error;
    }
  },
};
