import { describe, it, expect, vi } from "vitest";

const MODULE_URL = new URL("./cleanupAnonymousUsers.js", import.meta.url).href;

async function loadCleanupModule() {
  let mod = null;
  let loadError = null;
  try {
    mod = await import(MODULE_URL);
  } catch (error) {
    loadError = error;
  }
  expect(
    mod,
    `Expected scripts/cleanupAnonymousUsers.js to load cleanly${
      loadError ? ` (${loadError.message})` : ""
    }`
  ).not.toBeNull();
  return mod;
}

function createSilentLogger() {
  return {
    log: vi.fn(),
    error: vi.fn(),
  };
}

describe("scripts/cleanupAnonymousUsers", () => {
  it("can be imported without executing the CLI or touching process.exit", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {});
    const initialExitCode = process.exitCode;

    try {
      const mod = await loadCleanupModule();

      expect(exitSpy).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(initialExitCode);
      expect(mod.LIST_PAGE_SIZE).toBe(1000);
      expect(mod.DELETE_BATCH_LIMIT).toBe(1000);
      expect(mod.USERS_COLLECTION).toBe("users");
      expect(typeof mod.parseCliArgs).toBe("function");
      expect(typeof mod.isAnonymousUser).toBe("function");
      expect(typeof mod.chunkArray).toBe("function");
      expect(typeof mod.cleanupAnonymousUsers).toBe("function");
      expect(typeof mod.initializeAdminServices).toBe("function");
      expect(typeof mod.runCli).toBe("function");
    } finally {
      exitSpy.mockRestore();
    }
  });

  describe("parseCliArgs", () => {
    it("parses --dry-run, --credentials forms, and --help/-h", async () => {
      const { parseCliArgs } = await loadCleanupModule();

      expect(parseCliArgs([])).toEqual({
        dryRun: false,
        credentialsPath: null,
        help: false,
      });

      expect(parseCliArgs(["--dry-run"])).toEqual({
        dryRun: true,
        credentialsPath: null,
        help: false,
      });

      expect(parseCliArgs(["--credentials", "/a/b.json"])).toEqual({
        dryRun: false,
        credentialsPath: "/a/b.json",
        help: false,
      });

      expect(parseCliArgs(["--credentials=/a/b.json", "--dry-run"])).toEqual({
        dryRun: true,
        credentialsPath: "/a/b.json",
        help: false,
      });

      expect(parseCliArgs(["--help"]).help).toBe(true);
      expect(parseCliArgs(["-h"]).help).toBe(true);
    });

    it("rejects unknown flags and --credentials without a value", async () => {
      const { parseCliArgs } = await loadCleanupModule();

      expect(() => parseCliArgs(["--bogus"])).toThrow(/Unknown argument/i);
      expect(() => parseCliArgs(["--credentials"])).toThrow();
      expect(() => parseCliArgs(["--credentials="])).toThrow();
      expect(() => parseCliArgs(["--credentials", "--dry-run"])).toThrow();
    });
  });

  describe("isAnonymousUser", () => {
    it("returns true for valid uid with empty or missing providerData and false otherwise", async () => {
      const { isAnonymousUser } = await loadCleanupModule();

      expect(isAnonymousUser({ uid: "anon-1", providerData: [] })).toBe(true);
      expect(isAnonymousUser({ uid: "anon-2" })).toBe(true);

      expect(
        isAnonymousUser({
          uid: "email-1",
          providerData: [{ providerId: "password" }],
        })
      ).toBe(false);
      expect(isAnonymousUser({ uid: "", providerData: [] })).toBe(false);
      expect(isAnonymousUser({ providerData: [] })).toBe(false);
      expect(isAnonymousUser(null)).toBe(false);
      expect(isAnonymousUser(undefined)).toBe(false);
    });
  });

  describe("chunkArray", () => {
    it("splits 2,500 items into [1000, 1000, 500], handles empty input, and validates chunkSize", async () => {
      const { chunkArray } = await loadCleanupModule();

      const items = Array.from({ length: 2500 }, (_, i) => `uid-${i}`);
      const chunks = chunkArray(items);

      expect(chunks.map((c) => c.length)).toEqual([1000, 1000, 500]);
      expect(chunks.flat()).toEqual(items);

      expect(chunkArray([])).toEqual([]);
      expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);

      expect(() => chunkArray(items, 0)).toThrow(RangeError);
      expect(() => chunkArray(items, -5)).toThrow(RangeError);
      expect(() => chunkArray(items, 1.5)).toThrow(RangeError);
    });
  });

  describe("cleanupAnonymousUsers", () => {
    it("paginates through all listUsers pages and filters only anonymous users", async () => {
      const { cleanupAnonymousUsers, LIST_PAGE_SIZE } =
        await loadCleanupModule();

      const auth = {
        listUsers: vi
          .fn()
          .mockResolvedValueOnce({
            users: [
              { uid: "anon-1", providerData: [] },
              { uid: "email-1", providerData: [{ providerId: "password" }] },
            ],
            pageToken: "next-page-1",
          })
          .mockResolvedValueOnce({
            users: [
              { uid: "anon-2" },
              {
                uid: "google-1",
                providerData: [{ providerId: "google.com" }],
              },
            ],
            pageToken: undefined,
          }),
        deleteUsers: vi
          .fn()
          .mockResolvedValue({ successCount: 2, failureCount: 0, errors: [] }),
      };

      const db = {
        doc: vi.fn((path) => ({ path })),
        recursiveDelete: vi.fn().mockResolvedValue(undefined),
      };

      const logger = createSilentLogger();

      const summary = await cleanupAnonymousUsers({
        auth,
        db,
        dryRun: false,
        logger,
      });

      expect(auth.listUsers).toHaveBeenCalledTimes(2);
      expect(auth.listUsers).toHaveBeenNthCalledWith(
        1,
        LIST_PAGE_SIZE,
        undefined
      );
      expect(auth.listUsers).toHaveBeenNthCalledWith(
        2,
        LIST_PAGE_SIZE,
        "next-page-1"
      );
      expect(db.doc).toHaveBeenCalledWith("users/anon-1");
      expect(db.doc).toHaveBeenCalledWith("users/anon-2");
      expect(db.doc).not.toHaveBeenCalledWith("users/email-1");
      expect(db.doc).not.toHaveBeenCalledWith("users/google-1");
      expect(auth.deleteUsers).toHaveBeenCalledWith(["anon-1", "anon-2"]);
      expect(summary).toEqual({
        dryRun: false,
        scannedCount: 4,
        anonymousCount: 2,
        firestoreDeletedCount: 2,
        authDeletedCount: 2,
        firestoreErrors: [],
        authErrors: [],
      });
    });

    it("makes zero writes or deletions in --dry-run mode", async () => {
      const { cleanupAnonymousUsers } = await loadCleanupModule();

      const auth = {
        listUsers: vi.fn().mockResolvedValueOnce({
          users: [
            { uid: "anon-1", providerData: [] },
            { uid: "email-1", providerData: [{ providerId: "password" }] },
            { uid: "anon-2", providerData: [] },
          ],
        }),
        deleteUsers: vi.fn(),
      };

      const db = {
        doc: vi.fn(),
        recursiveDelete: vi.fn(),
      };

      const logger = createSilentLogger();

      const summary = await cleanupAnonymousUsers({
        auth,
        db,
        dryRun: true,
        logger,
      });

      expect(summary).toEqual({
        dryRun: true,
        scannedCount: 3,
        anonymousCount: 2,
        firestoreDeletedCount: 0,
        authDeletedCount: 0,
        firestoreErrors: [],
        authErrors: [],
      });
      expect(db.doc).not.toHaveBeenCalled();
      expect(db.recursiveDelete).not.toHaveBeenCalled();
      expect(auth.deleteUsers).not.toHaveBeenCalled();
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining("[DRY RUN]")
      );
    });

    it("deletes Firestore trees first and chunks Auth deletions at <= 1000 users in live mode", async () => {
      const { cleanupAnonymousUsers } = await loadCleanupModule();

      const page1Users = Array.from({ length: 1000 }, (_, i) => ({
        uid: `anon-${i}`,
        providerData: [],
      }));
      const page2Users = Array.from({ length: 250 }, (_, i) => ({
        uid: `anon-${1000 + i}`,
        providerData: [],
      }));

      const events = [];

      const auth = {
        listUsers: vi
          .fn()
          .mockResolvedValueOnce({ users: page1Users, pageToken: "p2" })
          .mockResolvedValueOnce({ users: page2Users }),
        deleteUsers: vi.fn(async (batch) => {
          events.push(`auth:${batch.length}`);
          return {
            successCount: batch.length,
            failureCount: 0,
            errors: [],
          };
        }),
      };

      const db = {
        doc: vi.fn((path) => ({ path })),
        recursiveDelete: vi.fn(async () => {
          if (events.length === 0) {
            events.push("firestore-started");
          }
        }),
      };

      const logger = createSilentLogger();

      const summary = await cleanupAnonymousUsers({
        auth,
        db,
        dryRun: false,
        logger,
      });

      expect(db.recursiveDelete).toHaveBeenCalledTimes(1250);
      expect(auth.deleteUsers).toHaveBeenCalledTimes(2);
      expect(auth.deleteUsers.mock.calls[0][0]).toHaveLength(1000);
      expect(auth.deleteUsers.mock.calls[1][0]).toHaveLength(250);
      expect(events).toEqual(["firestore-started", "auth:1000", "auth:250"]);
      expect(summary).toEqual({
        dryRun: false,
        scannedCount: 1250,
        anonymousCount: 1250,
        firestoreDeletedCount: 1250,
        authDeletedCount: 1250,
        firestoreErrors: [],
        authErrors: [],
      });
    });

    it("preserves Auth record when Firestore recursiveDelete fails so re-runs can retry", async () => {
      const { cleanupAnonymousUsers } = await loadCleanupModule();

      const auth = {
        listUsers: vi.fn().mockResolvedValueOnce({
          users: [
            { uid: "anon-1", providerData: [] },
            { uid: "anon-2", providerData: [] },
            { uid: "anon-3", providerData: [] },
          ],
        }),
        deleteUsers: vi.fn(async (batch) => ({
          successCount: batch.length,
          failureCount: 0,
          errors: [],
        })),
      };

      const db = {
        doc: vi.fn((path) => ({ path })),
        recursiveDelete: vi.fn(async (ref) => {
          if (ref.path === "users/anon-2") {
            throw new Error("Firestore unavailable");
          }
        }),
      };

      const logger = createSilentLogger();

      const summary = await cleanupAnonymousUsers({
        auth,
        db,
        dryRun: false,
        logger,
      });

      expect(auth.deleteUsers).toHaveBeenCalledTimes(1);
      expect(auth.deleteUsers).toHaveBeenCalledWith(["anon-1", "anon-3"]);
      expect(summary.firestoreDeletedCount).toBe(2);
      expect(summary.authDeletedCount).toBe(2);
      expect(summary.firestoreErrors).toEqual([
        { uid: "anon-2", message: "Firestore unavailable" },
      ]);
      expect(summary.authErrors).toEqual([]);
      expect(logger.error).toHaveBeenCalled();
    });

    it("captures partial deleteUsers errors and rejected batch errors with accurate counts", async () => {
      const { cleanupAnonymousUsers } = await loadCleanupModule();

      const auth = {
        listUsers: vi.fn().mockResolvedValueOnce({
          users: [
            { uid: "anon-1", providerData: [] },
            { uid: "anon-2", providerData: [] },
            { uid: "anon-3", providerData: [] },
            { uid: "anon-4", providerData: [] },
          ],
        }),
        deleteUsers: vi
          .fn()
          .mockResolvedValueOnce({
            successCount: 1,
            failureCount: 1,
            errors: [{ index: 1, error: { message: "User delete failed" } }],
          })
          .mockRejectedValueOnce(new Error("Auth quota exceeded")),
      };

      const db = {
        doc: vi.fn((path) => ({ path })),
        recursiveDelete: vi.fn().mockResolvedValue(undefined),
      };

      const logger = createSilentLogger();

      const summary = await cleanupAnonymousUsers({
        auth,
        db,
        dryRun: false,
        logger,
        batchSize: 2,
      });

      expect(auth.deleteUsers).toHaveBeenCalledTimes(2);
      expect(summary.firestoreDeletedCount).toBe(4);
      expect(summary.authDeletedCount).toBe(1);
      expect(summary.firestoreErrors).toEqual([]);
      expect(summary.authErrors).toEqual([
        { uid: "anon-2", index: 1, message: "User delete failed" },
        { uid: "anon-3", index: null, message: "Auth quota exceeded" },
        { uid: "anon-4", index: null, message: "Auth quota exceeded" },
      ]);
      expect(logger.error).toHaveBeenCalled();
    });

    it("validates required services and batchSize bounds", async () => {
      const { cleanupAnonymousUsers } = await loadCleanupModule();
      const validAuth = { listUsers: vi.fn(), deleteUsers: vi.fn() };
      const validDb = { doc: vi.fn(), recursiveDelete: vi.fn() };

      await expect(
        cleanupAnonymousUsers({ auth: null, db: validDb })
      ).rejects.toThrow();
      await expect(
        cleanupAnonymousUsers({ auth: validAuth, db: null, dryRun: false })
      ).rejects.toThrow();
      await expect(
        cleanupAnonymousUsers({
          auth: validAuth,
          db: validDb,
          batchSize: 1001,
        })
      ).rejects.toThrow(RangeError);
    });
  });

  describe("runCli", () => {
    it("handles --help and sets exitCode based on summary errors", async () => {
      const { runCli } = await loadCleanupModule();
      const logger = createSilentLogger();
      const initMock = vi.fn();
      const cleanupMock = vi.fn();

      const helpResult = await runCli(["--help"], {
        initializeAdminServices: initMock,
        cleanupAnonymousUsers: cleanupMock,
        logger,
      });
      expect(helpResult.exitCode).toBe(0);
      expect(initMock).not.toHaveBeenCalled();
      expect(cleanupMock).not.toHaveBeenCalled();

      initMock.mockResolvedValue({ auth: {}, db: {} });
      cleanupMock.mockResolvedValueOnce({
        dryRun: true,
        scannedCount: 0,
        anonymousCount: 0,
        firestoreDeletedCount: 0,
        authDeletedCount: 0,
        firestoreErrors: [],
        authErrors: [],
      });
      const okResult = await runCli(["--dry-run"], {
        initializeAdminServices: initMock,
        cleanupAnonymousUsers: cleanupMock,
        logger,
      });
      expect(okResult.exitCode).toBe(0);

      cleanupMock.mockResolvedValueOnce({
        dryRun: false,
        scannedCount: 1,
        anonymousCount: 1,
        firestoreDeletedCount: 0,
        authDeletedCount: 0,
        firestoreErrors: [{ uid: "anon-1", message: "boom" }],
        authErrors: [],
      });
      const errResult = await runCli([], {
        initializeAdminServices: initMock,
        cleanupAnonymousUsers: cleanupMock,
        logger,
      });
      expect(errResult.exitCode).toBe(1);
    });
  });
});
