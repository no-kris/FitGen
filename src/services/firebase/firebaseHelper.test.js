import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  const mockApp = { name: "mock-firebase-app" };
  const mockAuth = { name: "mock-firebase-auth" };
  const mockPersistentDb = { name: "mock-persistent-db" };
  const mockInMemoryDb = { name: "mock-in-memory-db" };
  const mockTabManager = { __type: "persistentMultipleTabManager" };
  const mockLocalCache = { __type: "persistentLocalCache" };

  return {
    mockApp,
    mockAuth,
    mockPersistentDb,
    mockInMemoryDb,
    mockTabManager,
    mockLocalCache,
    initializeAppMock: vi.fn(() => mockApp),
    initializeAuthMock: vi.fn(() => mockAuth),
    getFirestoreMock: vi.fn(() => mockInMemoryDb),
    initializeFirestoreMock: vi.fn(() => mockPersistentDb),
    persistentLocalCacheMock: vi.fn(() => mockLocalCache),
    persistentMultipleTabManagerMock: vi.fn(() => mockTabManager),
  };
});

vi.mock("firebase/app", () => ({
  initializeApp: mocks.initializeAppMock,
}));

vi.mock("firebase/auth", () => ({
  initializeAuth: mocks.initializeAuthMock,
  indexedDBLocalPersistence: "indexedDBLocalPersistence",
  browserLocalPersistence: "browserLocalPersistence",
}));

vi.mock("firebase/firestore", () => ({
  getFirestore: mocks.getFirestoreMock,
  initializeFirestore: mocks.initializeFirestoreMock,
  persistentLocalCache: mocks.persistentLocalCacheMock,
  persistentMultipleTabManager: mocks.persistentMultipleTabManagerMock,
}));

describe("firebaseHelper", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("initializes Firestore with persistentLocalCache and persistentMultipleTabManager instead of getFirestore", async () => {
    const helper = await import("./firebaseHelper");

    expect(mocks.persistentMultipleTabManagerMock).toHaveBeenCalledTimes(1);
    expect(mocks.persistentLocalCacheMock).toHaveBeenCalledWith({
      tabManager: mocks.mockTabManager,
    });
    expect(mocks.initializeFirestoreMock).toHaveBeenCalledWith(mocks.mockApp, {
      localCache: mocks.mockLocalCache,
    });
    expect(mocks.getFirestoreMock).not.toHaveBeenCalled();
    expect(helper.db).toBe(mocks.mockPersistentDb);
  });
});
