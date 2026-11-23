// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const STORE_MODULE_PATH = "./activeWorkoutStore";

async function loadStoreModule() {
  try {
    return await import(STORE_MODULE_PATH);
  } catch {
    return null;
  }
}

describe("activeWorkoutStore", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exports versioned STORAGE_KEYS for active and legacy keys", async () => {
    const mod = await loadStoreModule();
    expect(mod).not.toBeNull();
    expect(mod.STORAGE_KEYS).toEqual({
      ACTIVE_WORKOUT: "fitgen:active:v1",
      LEGACY_ACTIVE_WORKOUT: "fitgen-active",
    });
  });

  it("round-trips active workout payload under fitgen:active:v1 and removes legacy key", async () => {
    const mod = await loadStoreModule();
    expect(mod).not.toBeNull();
    const { activeWorkoutStore, STORAGE_KEYS } = mod;

    localStorage.setItem(
      STORAGE_KEYS.LEGACY_ACTIVE_WORKOUT,
      JSON.stringify({ stale: true })
    );

    const workout = {
      weekNumber: 2,
      dayNumber: 1,
      dayName: "Monday",
      focus: "Push",
      exercises: [{ name: "Bench Press", sets: 3, reps: "8-10", rest: "90s" }],
    };
    const logs = [
      {
        name: "Bench Press",
        sets: [{ weight: "135", reps: "10", completed: true }],
      },
    ];

    activeWorkoutStore.save({
      weekNumber: 2,
      dayNumber: 1,
      dayName: "Monday",
      focus: "Push",
      workout,
      logs,
      elapsed: 425,
    });

    expect(
      localStorage.getItem(STORAGE_KEYS.LEGACY_ACTIVE_WORKOUT)
    ).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.ACTIVE_WORKOUT)).not.toBeNull();

    const loaded = activeWorkoutStore.load();
    expect(loaded).toEqual({
      weekNumber: 2,
      dayNumber: 1,
      dayName: "Monday",
      focus: "Push",
      workout,
      logs,
      elapsed: 425,
    });
  });

  it("falls back to legacy fitgen-active key when v1 key is absent without mutating storage", async () => {
    const mod = await loadStoreModule();
    expect(mod).not.toBeNull();
    const { activeWorkoutStore, STORAGE_KEYS } = mod;

    const legacyPayload = {
      workout: {
        weekNumber: 1,
        dayNumber: 3,
        dayName: "Wednesday",
        focus: "Pull",
        exercises: [{ name: "Pull-ups", sets: 3, reps: "8", rest: "90s" }],
      },
      logs: [
        {
          name: "Pull-ups",
          sets: [{ weight: "0", reps: "8", completed: true }],
        },
      ],
      elapsed: 300,
    };
    localStorage.setItem(
      STORAGE_KEYS.LEGACY_ACTIVE_WORKOUT,
      JSON.stringify(legacyPayload)
    );

    const loaded = activeWorkoutStore.load();

    expect(loaded).toEqual({
      weekNumber: 1,
      dayNumber: 3,
      dayName: "Wednesday",
      focus: "Pull",
      workout: legacyPayload.workout,
      logs: legacyPayload.logs,
      elapsed: 300,
    });
    expect(localStorage.getItem(STORAGE_KEYS.ACTIVE_WORKOUT)).toBeNull();
    expect(
      localStorage.getItem(STORAGE_KEYS.LEGACY_ACTIVE_WORKOUT)
    ).not.toBeNull();
  });

  it("returns null without throwing on empty, corrupt JSON, non-object JSON, or missing week/day identity", async () => {
    const mod = await loadStoreModule();
    expect(mod).not.toBeNull();
    const { activeWorkoutStore, STORAGE_KEYS } = mod;

    expect(activeWorkoutStore.load()).toBeNull();

    const invalidPayloads = [
      "{not valid json",
      JSON.stringify("just a string"),
      JSON.stringify(42),
      JSON.stringify(null),
      JSON.stringify([1, 2, 3]),
      JSON.stringify({ dayNumber: 1, dayName: "Monday", logs: [] }),
      JSON.stringify({ weekNumber: 1, logs: [] }),
      JSON.stringify({ weekNumber: "NaN", dayNumber: 1, dayName: "Monday" }),
    ];

    for (const raw of invalidPayloads) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_WORKOUT, raw);
      expect(() => activeWorkoutStore.load()).not.toThrow();
      expect(activeWorkoutStore.load()).toBeNull();
    }
  });

  it("tolerates missing or non-array logs and invalid elapsed values by normalizing them", async () => {
    const mod = await loadStoreModule();
    expect(mod).not.toBeNull();
    const { activeWorkoutStore, STORAGE_KEYS } = mod;

    localStorage.setItem(
      STORAGE_KEYS.ACTIVE_WORKOUT,
      JSON.stringify({
        weekNumber: 1,
        dayNumber: 2,
        dayName: "Tuesday",
        focus: "Legs",
        workout: { weekNumber: 1, dayNumber: 2, dayName: "Tuesday" },
        logs: "corrupted-logs",
        elapsed: -15,
      })
    );

    const loaded = activeWorkoutStore.load();
    expect(loaded).not.toBeNull();
    expect(loaded.logs).toBeNull();
    expect(loaded.elapsed).toBe(0);
  });

  it("clear removes both v1 and legacy keys and swallows storage errors safely", async () => {
    const mod = await loadStoreModule();
    expect(mod).not.toBeNull();
    const { activeWorkoutStore, STORAGE_KEYS } = mod;

    localStorage.setItem(STORAGE_KEYS.ACTIVE_WORKOUT, "{}");
    localStorage.setItem(STORAGE_KEYS.LEGACY_ACTIVE_WORKOUT, "{}");

    activeWorkoutStore.clear();

    expect(localStorage.getItem(STORAGE_KEYS.ACTIVE_WORKOUT)).toBeNull();
    expect(
      localStorage.getItem(STORAGE_KEYS.LEGACY_ACTIVE_WORKOUT)
    ).toBeNull();

    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    expect(() => activeWorkoutStore.clear()).not.toThrow();
  });

  it("save catches localStorage errors without throwing", async () => {
    const mod = await loadStoreModule();
    expect(mod).not.toBeNull();
    const { activeWorkoutStore } = mod;

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    expect(() =>
      activeWorkoutStore.save({
        weekNumber: 1,
        dayNumber: 1,
        dayName: "Monday",
        focus: "Push",
        workout: { weekNumber: 1, dayNumber: 1, dayName: "Monday" },
        logs: [],
        elapsed: 10,
      })
    ).not.toThrow();
  });

  describe("matchesDay", () => {
    it("matches by weekNumber and dayNumber when both dayNumbers are present", async () => {
      const mod = await loadStoreModule();
      expect(mod).not.toBeNull();
      const { activeWorkoutStore } = mod;

      const saved = { weekNumber: 1, dayNumber: 1, dayName: "Monday" };

      expect(
        activeWorkoutStore.matchesDay(saved, {
          weekNumber: 1,
          dayNumber: 1,
          dayName: "Monday",
        })
      ).toBe(true);
      expect(
        activeWorkoutStore.matchesDay(saved, {
          weekNumber: 2,
          dayNumber: 1,
          dayName: "Monday",
        })
      ).toBe(false);
      expect(
        activeWorkoutStore.matchesDay(saved, {
          weekNumber: 1,
          dayNumber: 2,
          dayName: "Wednesday",
        })
      ).toBe(false);
    });

    it("falls back to non-empty dayName when dayNumber is absent and returns false for null inputs", async () => {
      const mod = await loadStoreModule();
      expect(mod).not.toBeNull();
      const { activeWorkoutStore } = mod;

      expect(
        activeWorkoutStore.matchesDay(
          { weekNumber: 1, dayNumber: null, dayName: "Monday" },
          { weekNumber: 1, dayName: "Monday" }
        )
      ).toBe(true);
      expect(
        activeWorkoutStore.matchesDay(
          { weekNumber: 1, dayNumber: null, dayName: "Monday" },
          { weekNumber: 1, dayName: "Wednesday" }
        )
      ).toBe(false);
      expect(
        activeWorkoutStore.matchesDay(
          { weekNumber: 1, dayNumber: null, dayName: "" },
          { weekNumber: 1, dayName: "" }
        )
      ).toBe(false);
      expect(activeWorkoutStore.matchesDay(null, { weekNumber: 1 })).toBe(false);
      expect(activeWorkoutStore.matchesDay({ weekNumber: 1 }, null)).toBe(false);
    });
  });
});
