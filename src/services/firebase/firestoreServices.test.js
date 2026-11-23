import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

class FakeFieldValue {
  constructor(op) {
    this.op = op;
  }
}

const firestoreMocks = vi.hoisted(() => ({
  doc: vi.fn((...args) => {
    const segments = args.slice(1);
    return {
      __type: "doc",
      path: segments.join("/"),
      id: segments[segments.length - 1],
    };
  }),
  collection: vi.fn((...args) => {
    const segments = args.slice(1);
    return {
      __type: "collection",
      path: segments.join("/"),
    };
  }),
  query: vi.fn((colRef, ...constraints) => ({
    __type: "query",
    colRef,
    constraints,
  })),
  orderBy: vi.fn((field, direction) => ({
    __type: "orderBy",
    field,
    direction,
  })),
  setDoc: vi.fn(),
  getDoc: vi.fn(),
  deleteDoc: vi.fn(),
  addDoc: vi.fn(),
  getDocs: vi.fn(),
  writeBatch: vi.fn(),
  deleteField: vi.fn(),
}));

vi.mock("./firebaseHelper", () => ({
  db: { __type: "mock-db" },
}));

vi.mock("firebase/firestore", () => ({
  doc: firestoreMocks.doc,
  collection: firestoreMocks.collection,
  query: firestoreMocks.query,
  orderBy: firestoreMocks.orderBy,
  setDoc: firestoreMocks.setDoc,
  getDoc: firestoreMocks.getDoc,
  deleteDoc: firestoreMocks.deleteDoc,
  addDoc: firestoreMocks.addDoc,
  getDocs: firestoreMocks.getDocs,
  writeBatch: firestoreMocks.writeBatch,
  deleteField: firestoreMocks.deleteField,
}));

import * as firestoreModule from "./firestoreServices";

function createBatchRecorder() {
  const batches = [];
  firestoreMocks.writeBatch.mockImplementation(() => {
    const ops = [];
    const batch = {
      ops,
      set: vi.fn((ref, data, options) => {
        ops.push({ ref, data, options });
      }),
      commit: vi.fn(async () => undefined),
    };
    batches.push(batch);
    return batch;
  });
  return batches;
}

describe("firestoreServices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestoreMocks.setDoc.mockReset();
    firestoreMocks.getDoc.mockReset();
    firestoreMocks.deleteDoc.mockReset();
    firestoreMocks.addDoc.mockReset();
    firestoreMocks.getDocs.mockReset();
    firestoreMocks.writeBatch.mockReset();
    firestoreMocks.deleteField.mockImplementation(
      () => new FakeFieldValue("deleteField")
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("COLLECTIONS", () => {
    it("exports canonical collection names", () => {
      expect(firestoreModule.COLLECTIONS).toEqual({
        USERS: "users",
        WORKOUTS: "workouts",
      });
    });
  });

  describe("stripUndefined", () => {
    it("removes undefined keys recursively without mutating the input", () => {
      expect(firestoreModule.stripUndefined).toBeTypeOf("function");

      const input = {
        programName: "Hypertrophy",
        description: undefined,
        nested: {
          keep: "yes",
          drop: undefined,
          deep: { a: 1, b: undefined },
        },
      };
      const snapshot = structuredClone(input);

      const cleaned = firestoreModule.stripUndefined(input);

      expect(cleaned).toEqual({
        programName: "Hypertrophy",
        nested: {
          keep: "yes",
          deep: { a: 1 },
        },
      });
      expect("description" in cleaned).toBe(false);
      expect("drop" in cleaned.nested).toBe(false);
      expect(input).toEqual(snapshot);
    });

    it("strips undefined items from arrays and cleans nested objects inside arrays", () => {
      expect(firestoreModule.stripUndefined).toBeTypeOf("function");

      const result = firestoreModule.stripUndefined({
        items: [1, undefined, { a: "x", b: undefined }, undefined, null],
      });

      expect(result).toEqual({
        items: [1, { a: "x" }, null],
      });
    });

    it("preserves null, 0, false, empty string, and non-plain objects like Date and FieldValue", () => {
      expect(firestoreModule.stripUndefined).toBeTypeOf("function");

      const date = new Date("2026-11-23T00:00:00.000Z");
      const sentinel = new FakeFieldValue("deleteField");

      const result = firestoreModule.stripUndefined({
        nothing: null,
        zero: 0,
        flag: false,
        empty: "",
        createdAt: date,
        removedField: sentinel,
        dropped: undefined,
      });

      expect(result.nothing).toBeNull();
      expect(result.zero).toBe(0);
      expect(result.flag).toBe(false);
      expect(result.empty).toBe("");
      expect(result.createdAt).toBe(date);
      expect(result.removedField).toBe(sentinel);
      expect("dropped" in result).toBe(false);
    });
  });

  describe("normalizeWorkoutEntry", () => {
    it("converts a legacy nested workout log into the 7 canonical lean fields only", () => {
      expect(firestoreModule.normalizeWorkoutEntry).toBeTypeOf("function");

      const legacyEntry = {
        workout: {
          weekNumber: 2,
          dayNumber: 1,
          dayName: "Monday",
          focus: "Push",
          date: "2026-10-01T15:30:00.000Z",
          exercises: [
            { name: "Bench Press", alternatives: ["DB Press", "Push-ups"] },
          ],
          alternatives: ["Should not be stored"],
        },
        logs: [
          {
            name: "Bench Press",
            sets: [{ weight: "135", reps: "10", completed: true }],
          },
        ],
        duration: 2400,
      };

      const normalized = firestoreModule.normalizeWorkoutEntry(legacyEntry);

      expect(Object.keys(normalized).sort()).toEqual([
        "completedAt",
        "dayName",
        "dayNumber",
        "duration",
        "focus",
        "logs",
        "weekNumber",
      ]);
      expect(normalized).toEqual({
        weekNumber: 2,
        dayNumber: 1,
        dayName: "Monday",
        focus: "Push",
        logs: legacyEntry.logs,
        duration: 2400,
        completedAt: "2026-10-01T15:30:00.000Z",
      });
      expect("workout" in normalized).toBe(false);
      expect("exercises" in normalized).toBe(false);
      expect("alternatives" in normalized).toBe(false);
    });

    it("preserves flat entries and applies fallbackCompletedAt and safe defaults", () => {
      expect(firestoreModule.normalizeWorkoutEntry).toBeTypeOf("function");

      const normalized = firestoreModule.normalizeWorkoutEntry(
        {
          dayName: "Friday",
          focus: "Legs",
          logs: [],
        },
        "2026-11-23T12:00:00.000Z"
      );

      expect(normalized).toEqual({
        weekNumber: 0,
        dayNumber: null,
        dayName: "Friday",
        focus: "Legs",
        logs: [],
        duration: 0,
        completedAt: "2026-11-23T12:00:00.000Z",
      });
    });
  });

  describe("buildMigrationWorkoutId", () => {
    it("produces deterministic IDs from weekNumber, dayNumber, and completedAt", () => {
      expect(firestoreModule.buildMigrationWorkoutId).toBeTypeOf("function");

      const entry = {
        weekNumber: 1,
        dayNumber: 3,
        dayName: "Wednesday",
        completedAt: "2026-10-05T18:20:00.000Z",
      };

      const id1 = firestoreModule.buildMigrationWorkoutId(entry, 0);
      const id2 = firestoreModule.buildMigrationWorkoutId(entry, 0);

      expect(id1).toBe(id2);
      expect(id1).toBe("migrated-w1-d3-2026-10-05T18_20_00_000Z");
    });

    it("falls back to sanitized dayName and index when dayNumber or completedAt is absent", () => {
      expect(firestoreModule.buildMigrationWorkoutId).toBeTypeOf("function");

      const dateless = {
        weekNumber: 2,
        dayNumber: null,
        dayName: "Upper Body A",
        completedAt: "",
      };

      const id1 = firestoreModule.buildMigrationWorkoutId(dateless, 4);
      const id2 = firestoreModule.buildMigrationWorkoutId(dateless, 4);

      expect(id1).toBe(id2);
      expect(id1).toBe("migrated-w2-upper_body_a-idx4");
    });
  });

  describe("firestoreService.saveUserData", () => {
    it("throws when userId is missing", async () => {
      await expect(
        firestoreModule.firestoreService.saveUserData("", { plan: {} })
      ).rejects.toThrow();
      expect(firestoreMocks.setDoc).not.toHaveBeenCalled();
    });

    it("strips undefined fields, removes history/workouts keys, sets updatedAt, and merges", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-11-23T05:00:00.000Z"));
      firestoreMocks.setDoc.mockResolvedValueOnce(undefined);

      await firestoreModule.firestoreService.saveUserData("user-1", {
        plan: {
          programName: "Strength",
          description: undefined,
          weeks: [{ weekNumber: 1, coachNotes: undefined }],
        },
        profile: { goal: "muscle" },
        history: [{ should: "be stripped" }],
        workouts: [{ should: "also be stripped" }],
      });

      expect(firestoreMocks.setDoc).toHaveBeenCalledTimes(1);
      const [ref, payload, options] = firestoreMocks.setDoc.mock.calls[0];
      expect(ref.path).toBe("users/user-1");
      expect(options).toEqual({ merge: true });
      expect(payload).toEqual({
        plan: {
          programName: "Strength",
          weeks: [{ weekNumber: 1 }],
        },
        profile: { goal: "muscle" },
        updatedAt: "2026-11-23T05:00:00.000Z",
      });
      expect("history" in payload).toBe(false);
      expect("workouts" in payload).toBe(false);
    });

    it("rethrows Firestore write errors", async () => {
      firestoreMocks.setDoc.mockRejectedValueOnce(new Error("permission-denied"));

      await expect(
        firestoreModule.firestoreService.saveUserData("user-1", {
          profile: { goal: "strength" },
        })
      ).rejects.toThrow("permission-denied");
    });
  });

  describe("firestoreService.addWorkout", () => {
    it("throws when userId is missing", async () => {
      expect(firestoreModule.firestoreService.addWorkout).toBeTypeOf("function");

      await expect(
        firestoreModule.firestoreService.addWorkout(null, { dayName: "Monday" })
      ).rejects.toThrow();
      expect(firestoreMocks.addDoc).not.toHaveBeenCalled();
    });

    it("writes lean workout payload to users/{uid}/workouts via addDoc and returns { id, ...payload }", async () => {
      expect(firestoreModule.firestoreService.addWorkout).toBeTypeOf("function");
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-11-23T06:30:00.000Z"));
      firestoreMocks.addDoc.mockResolvedValueOnce({ id: "workout-doc-123" });

      const result = await firestoreModule.firestoreService.addWorkout(
        "user-42",
        {
          workout: {
            weekNumber: 1,
            dayNumber: 2,
            dayName: "Wednesday",
            focus: "Pull",
            exercises: [{ name: "Pull-up" }],
          },
          logs: [
            {
              name: "Pull-up",
              sets: [{ weight: "0", reps: "8", completed: true }],
            },
          ],
          duration: 1950,
        }
      );

      expect(firestoreMocks.addDoc).toHaveBeenCalledTimes(1);
      const [colRef, payload] = firestoreMocks.addDoc.mock.calls[0];
      expect(colRef.path).toBe("users/user-42/workouts");
      expect(payload).toEqual({
        weekNumber: 1,
        dayNumber: 2,
        dayName: "Wednesday",
        focus: "Pull",
        logs: [
          {
            name: "Pull-up",
            sets: [{ weight: "0", reps: "8", completed: true }],
          },
        ],
        duration: 1950,
        completedAt: "2026-11-23T06:30:00.000Z",
      });
      expect("workout" in payload).toBe(false);
      expect(result).toEqual({ id: "workout-doc-123", ...payload });
    });

    it("rethrows Firestore errors from addDoc", async () => {
      expect(firestoreModule.firestoreService.addWorkout).toBeTypeOf("function");
      firestoreMocks.addDoc.mockRejectedValueOnce(new Error("unavailable"));

      await expect(
        firestoreModule.firestoreService.addWorkout("user-42", {
          weekNumber: 1,
          dayNumber: 1,
          dayName: "Monday",
          focus: "Push",
          logs: [],
          duration: 600,
        })
      ).rejects.toThrow("unavailable");
    });
  });

  describe("firestoreService.getWorkouts", () => {
    it("throws when userId is missing", async () => {
      expect(firestoreModule.firestoreService.getWorkouts).toBeTypeOf("function");

      await expect(
        firestoreModule.firestoreService.getWorkouts("")
      ).rejects.toThrow();
    });

    it("reads users/{uid}/workouts ordered by completedAt asc and attaches doc id", async () => {
      expect(firestoreModule.firestoreService.getWorkouts).toBeTypeOf("function");
      firestoreMocks.getDocs.mockResolvedValueOnce({
        docs: [
          {
            id: "w-1",
            data: () => ({
              weekNumber: 1,
              dayNumber: 1,
              dayName: "Monday",
              focus: "Push",
              logs: [],
              duration: 1200,
              completedAt: "2026-11-20T10:00:00.000Z",
            }),
          },
          {
            id: "w-2",
            data: () => ({
              weekNumber: 1,
              dayNumber: 2,
              dayName: "Wednesday",
              focus: "Pull",
              logs: [],
              duration: 1500,
              completedAt: "2026-11-22T10:00:00.000Z",
            }),
          },
        ],
      });

      const workouts = await firestoreModule.firestoreService.getWorkouts("u-9");

      expect(firestoreMocks.collection).toHaveBeenCalledWith(
        expect.anything(),
        "users",
        "u-9",
        "workouts"
      );
      expect(firestoreMocks.orderBy).toHaveBeenCalledWith("completedAt", "asc");
      expect(firestoreMocks.query).toHaveBeenCalledTimes(1);
      expect(workouts).toEqual([
        expect.objectContaining({ id: "w-1", dayName: "Monday" }),
        expect.objectContaining({ id: "w-2", dayName: "Wednesday" }),
      ]);
    });

    it("rethrows Firestore errors from getDocs", async () => {
      expect(firestoreModule.firestoreService.getWorkouts).toBeTypeOf("function");
      firestoreMocks.getDocs.mockRejectedValueOnce(new Error("read-failed"));

      await expect(
        firestoreModule.firestoreService.getWorkouts("u-9")
      ).rejects.toThrow("read-failed");
    });
  });

  describe("firestoreService.migrateLegacyHistory", () => {
    it("throws when userId is missing", async () => {
      expect(
        firestoreModule.firestoreService.migrateLegacyHistory
      ).toBeTypeOf("function");

      await expect(
        firestoreModule.firestoreService.migrateLegacyHistory("", [])
      ).rejects.toThrow();
    });

    it("returns { migratedCount: 0 } without writing when legacyHistory is not an array", async () => {
      expect(
        firestoreModule.firestoreService.migrateLegacyHistory
      ).toBeTypeOf("function");
      const batches = createBatchRecorder();

      const res = await firestoreModule.firestoreService.migrateLegacyHistory(
        "user-1",
        null
      );

      expect(res).toEqual({ migratedCount: 0 });
      expect(batches).toHaveLength(0);
    });

    it("migrates legacy entries to deterministic doc IDs and deletes users/{uid}.history", async () => {
      expect(
        firestoreModule.firestoreService.migrateLegacyHistory
      ).toBeTypeOf("function");
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-11-23T08:00:00.000Z"));
      const batches = createBatchRecorder();

      const legacyHistory = [
        {
          workout: {
            weekNumber: 1,
            dayNumber: 1,
            dayName: "Monday",
            focus: "Push",
            date: "2026-11-01T10:00:00.000Z",
          },
          logs: [{ name: "Bench", sets: [] }],
          duration: 1800,
        },
        {
          workout: {
            weekNumber: 1,
            dayNumber: 2,
            dayName: "Wednesday",
            focus: "Pull",
          },
          logs: [{ name: "Row", sets: [] }],
          duration: 1500,
        },
      ];

      const result =
        await firestoreModule.firestoreService.migrateLegacyHistory(
          "user-1",
          legacyHistory
        );

      expect(result).toEqual({ migratedCount: 2 });
      expect(batches).toHaveLength(1);
      expect(batches[0].commit).toHaveBeenCalledTimes(1);

      const workoutOps = batches[0].ops.filter((op) =>
        op.ref.path.startsWith("users/user-1/workouts/")
      );
      const userOp = batches[0].ops.find((op) => op.ref.path === "users/user-1");

      expect(workoutOps).toHaveLength(2);
      expect(workoutOps[0].data.workout).toBeUndefined();
      expect(workoutOps[0].data.dayName).toBe("Monday");
      expect(workoutOps[1].data.dayName).toBe("Wednesday");
      expect(userOp).toBeDefined();
      expect(userOp.options).toEqual({ merge: true });
      expect(userOp.data.history).toBeInstanceOf(FakeFieldValue);
      expect(userOp.data.updatedAt).toBe("2026-11-23T08:00:00.000Z");
    });

    it("is idempotent across repeated runs including dateless entries", async () => {
      expect(
        firestoreModule.firestoreService.migrateLegacyHistory
      ).toBeTypeOf("function");

      const legacyHistory = [
        {
          workout: {
            weekNumber: 1,
            dayNumber: 1,
            dayName: "Monday",
            focus: "Push",
            date: "2026-11-01T10:00:00.000Z",
          },
          logs: [],
          duration: 900,
        },
        {
          workout: {
            weekNumber: 1,
            dayName: "Friday",
            focus: "Legs",
          },
          logs: [],
          duration: 1100,
        },
      ];

      const batchesRun1 = createBatchRecorder();
      await firestoreModule.firestoreService.migrateLegacyHistory(
        "user-1",
        legacyHistory
      );
      const idsRun1 = batchesRun1[0].ops
        .filter((op) => op.ref.path.startsWith("users/user-1/workouts/"))
        .map((op) => op.ref.id);

      const batchesRun2 = createBatchRecorder();
      await firestoreModule.firestoreService.migrateLegacyHistory(
        "user-1",
        legacyHistory
      );
      const idsRun2 = batchesRun2[0].ops
        .filter((op) => op.ref.path.startsWith("users/user-1/workouts/"))
        .map((op) => op.ref.id);

      expect(idsRun1).toHaveLength(2);
      expect(idsRun2).toEqual(idsRun1);
    });

    it("chunks histories exceeding 450 entries across multiple batches and deletes history only in the final batch", async () => {
      expect(
        firestoreModule.firestoreService.migrateLegacyHistory
      ).toBeTypeOf("function");
      const batches = createBatchRecorder();

      const largeHistory = [];
      for (let i = 0; i < 455; i += 1) {
        largeHistory.push({
          weekNumber: 1 + Math.floor(i / 7),
          dayNumber: (i % 7) + 1,
          dayName: `Day ${i + 1}`,
          focus: "Full Body",
          logs: [],
          duration: 1200,
          completedAt: `2026-01-01T00:00:${String(i).padStart(4, "0")}Z`,
        });
      }

      const result =
        await firestoreModule.firestoreService.migrateLegacyHistory(
          "user-big",
          largeHistory
        );

      expect(result).toEqual({ migratedCount: 455 });
      expect(batches).toHaveLength(2);
      expect(batches[0].ops).toHaveLength(450);
      expect(
        batches[0].ops.some((op) => op.ref.path === "users/user-big")
      ).toBe(false);
      expect(batches[0].commit).toHaveBeenCalledTimes(1);

      const finalBatchUserOps = batches[1].ops.filter(
        (op) => op.ref.path === "users/user-big"
      );
      const finalBatchWorkoutOps = batches[1].ops.filter((op) =>
        op.ref.path.startsWith("users/user-big/workouts/")
      );
      expect(finalBatchWorkoutOps).toHaveLength(5);
      expect(finalBatchUserOps).toHaveLength(1);
      expect(finalBatchUserOps[0].data.history).toBeInstanceOf(FakeFieldValue);
      expect(batches[1].commit).toHaveBeenCalledTimes(1);
    });

    it("deletes legacy history field cleanly when legacyHistory is an empty array", async () => {
      expect(
        firestoreModule.firestoreService.migrateLegacyHistory
      ).toBeTypeOf("function");
      const batches = createBatchRecorder();

      const result =
        await firestoreModule.firestoreService.migrateLegacyHistory(
          "user-empty",
          []
        );

      expect(result).toEqual({ migratedCount: 0 });
      expect(batches).toHaveLength(1);
      expect(batches[0].ops).toHaveLength(1);
      expect(batches[0].ops[0].ref.path).toBe("users/user-empty");
      expect(batches[0].ops[0].data.history).toBeInstanceOf(FakeFieldValue);
      expect(batches[0].commit).toHaveBeenCalledTimes(1);
    });

    it("rethrows errors if a batch commit fails", async () => {
      expect(
        firestoreModule.firestoreService.migrateLegacyHistory
      ).toBeTypeOf("function");
      firestoreMocks.writeBatch.mockImplementationOnce(() => ({
        set: vi.fn(),
        commit: vi.fn(async () => {
          throw new Error("batch-failed");
        }),
      }));

      await expect(
        firestoreModule.firestoreService.migrateLegacyHistory("user-err", [
          {
            weekNumber: 1,
            dayNumber: 1,
            dayName: "Monday",
            focus: "Push",
            logs: [],
            duration: 1000,
          },
        ])
      ).rejects.toThrow("batch-failed");
    });
  });
});
