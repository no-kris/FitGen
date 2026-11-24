export const STORAGE_KEYS = {
  ACTIVE_WORKOUT: "fitgen:active:v1",
  LEGACY_ACTIVE_WORKOUT: "fitgen-active",
};

const ACTIVE_KEY_PREFIXES = ["fitgen-active", "fitgen:active"];

function normalizePayload(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const weekNumber = parsed.weekNumber ?? parsed.workout?.weekNumber;
  const rawDayNumber = parsed.dayNumber ?? parsed.workout?.dayNumber ?? null;
  const rawDayName = parsed.dayName ?? parsed.workout?.dayName ?? "";
  const rawFocus = parsed.focus ?? parsed.workout?.focus ?? "";

  const hasValidWeek =
    typeof weekNumber === "number" && Number.isFinite(weekNumber);
  const hasValidDayNumber =
    typeof rawDayNumber === "number" && Number.isFinite(rawDayNumber);
  const hasValidDayName =
    typeof rawDayName === "string" && rawDayName.length > 0;

  if (!hasValidWeek || (!hasValidDayNumber && !hasValidDayName)) {
    return null;
  }

  return {
    weekNumber,
    dayNumber: hasValidDayNumber ? rawDayNumber : null,
    dayName: typeof rawDayName === "string" ? rawDayName : "",
    focus: typeof rawFocus === "string" ? rawFocus : "",
    workout: parsed.workout ?? null,
    logs: Array.isArray(parsed.logs) ? parsed.logs : null,
    elapsed:
      typeof parsed.elapsed === "number" &&
      Number.isFinite(parsed.elapsed) &&
      parsed.elapsed >= 0
        ? parsed.elapsed
        : 0,
  };
}

export const activeWorkoutStore = {
  save(payload) {
    try {
      const normalized = {
        weekNumber: payload?.weekNumber ?? payload?.workout?.weekNumber,
        dayNumber: payload?.dayNumber ?? payload?.workout?.dayNumber ?? null,
        dayName: payload?.dayName ?? payload?.workout?.dayName ?? "",
        focus: payload?.focus ?? payload?.workout?.focus ?? "",
        workout: payload?.workout ?? null,
        logs: Array.isArray(payload?.logs) ? payload.logs : null,
        elapsed:
          typeof payload?.elapsed === "number" &&
          Number.isFinite(payload.elapsed) &&
          payload.elapsed >= 0
            ? payload.elapsed
            : 0,
      };
      localStorage.setItem(
        STORAGE_KEYS.ACTIVE_WORKOUT,
        JSON.stringify(normalized)
      );
      localStorage.removeItem(STORAGE_KEYS.LEGACY_ACTIVE_WORKOUT);
    } catch (error) {
      console.error("Error saving active workout:", error);
    }
  },

  load() {
    try {
      const raw =
        localStorage.getItem(STORAGE_KEYS.ACTIVE_WORKOUT) ??
        localStorage.getItem(STORAGE_KEYS.LEGACY_ACTIVE_WORKOUT);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      return normalizePayload(parsed);
    } catch {
      return null;
    }
  },

  clear() {
    try {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_WORKOUT);
      localStorage.removeItem(STORAGE_KEYS.LEGACY_ACTIVE_WORKOUT);
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (
          typeof key === "string" &&
          ACTIVE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
        ) {
          keysToRemove.push(key);
        }
      }
      for (const key of keysToRemove) {
        localStorage.removeItem(key);
      }
    } catch (error) {
      console.error("Error clearing active workout:", error);
    }
  },

  matchesDay(saved, day) {
    if (!saved || !day) {
      return false;
    }
    if (saved.weekNumber !== day.weekNumber) {
      return false;
    }
    if (saved.dayNumber != null && day.dayNumber != null) {
      return saved.dayNumber === day.dayNumber;
    }
    return (
      typeof saved.dayName === "string" &&
      saved.dayName.length > 0 &&
      saved.dayName === day.dayName
    );
  },
};
