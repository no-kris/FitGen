import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const LIST_PAGE_SIZE = 1000;
export const DELETE_BATCH_LIMIT = 1000;
export const USERS_COLLECTION = "users";

const USAGE = `Usage: node scripts/cleanupAnonymousUsers.js [options]

Purges anonymous Firebase Auth users and their Firestore user document trees.

Options:
  --dry-run                Scan and report anonymous accounts without deleting anything
  --credentials <path>     Path to Firebase service account JSON (or set GOOGLE_APPLICATION_CREDENTIALS)
  --credentials=<path>     Same as --credentials <path>
  -h, --help               Show this help message
`;

export function parseCliArgs(argv = []) {
  let dryRun = false;
  let credentialsPath = null;
  let help = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--credentials") {
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) {
        throw new Error("Missing value for --credentials");
      }
      credentialsPath = next;
      i += 1;
    } else if (arg.startsWith("--credentials=")) {
      const value = arg.slice("--credentials=".length);
      if (!value) {
        throw new Error("Missing value for --credentials");
      }
      credentialsPath = value;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { dryRun, credentialsPath, help };
}

export function isAnonymousUser(userRecord) {
  if (!userRecord || typeof userRecord !== "object") {
    return false;
  }
  if (typeof userRecord.uid !== "string" || userRecord.uid.length === 0) {
    return false;
  }
  return (
    !Array.isArray(userRecord.providerData) ||
    userRecord.providerData.length === 0
  );
}

export function chunkArray(items, chunkSize = DELETE_BATCH_LIMIT) {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) {
    throw new RangeError("chunkSize must be a positive integer");
  }
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const chunks = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

export async function cleanupAnonymousUsers({
  auth,
  db,
  dryRun = false,
  logger = console,
  batchSize = DELETE_BATCH_LIMIT,
} = {}) {
  if (
    !auth ||
    typeof auth.listUsers !== "function" ||
    typeof auth.deleteUsers !== "function"
  ) {
    throw new Error(
      "Valid Firebase Auth service with listUsers and deleteUsers is required."
    );
  }
  if (
    !dryRun &&
    (!db ||
      typeof db.doc !== "function" ||
      typeof db.recursiveDelete !== "function")
  ) {
    throw new Error(
      "Valid Firestore service with doc and recursiveDelete is required for live cleanup."
    );
  }
  if (
    !Number.isInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > DELETE_BATCH_LIMIT
  ) {
    throw new RangeError(
      `batchSize must be an integer between 1 and ${DELETE_BATCH_LIMIT}`
    );
  }

  let scannedCount = 0;
  const anonymousUids = [];
  let pageToken;

  do {
    const result = await auth.listUsers(LIST_PAGE_SIZE, pageToken);
    const users = Array.isArray(result?.users) ? result.users : [];
    scannedCount += users.length;

    for (const userRecord of users) {
      if (isAnonymousUser(userRecord)) {
        anonymousUids.push(userRecord.uid);
      }
    }

    pageToken = result?.pageToken || undefined;
  } while (pageToken);

  if (dryRun) {
    logger.log(
      `[DRY RUN] Scanned ${scannedCount} Auth users; found ${anonymousUids.length} anonymous users. Would delete ${anonymousUids.length} Firestore user trees and ${anonymousUids.length} Auth accounts.`
    );
    return {
      dryRun: true,
      scannedCount,
      anonymousCount: anonymousUids.length,
      firestoreDeletedCount: 0,
      authDeletedCount: 0,
      firestoreErrors: [],
      authErrors: [],
    };
  }

  let firestoreDeletedCount = 0;
  const firestoreErrors = [];
  const uidsReadyForAuthDelete = [];

  for (const uid of anonymousUids) {
    try {
      const docRef = db.doc(`${USERS_COLLECTION}/${uid}`);
      await db.recursiveDelete(docRef);
      firestoreDeletedCount += 1;
      uidsReadyForAuthDelete.push(uid);
    } catch (error) {
      const message = error?.message || String(error);
      firestoreErrors.push({ uid, message });
      logger.error(
        `[LIVE] Failed to delete Firestore tree for anonymous user ${uid}: ${message}`
      );
    }
  }

  let authDeletedCount = 0;
  const authErrors = [];
  const batches = chunkArray(uidsReadyForAuthDelete, batchSize);

  for (const batch of batches) {
    try {
      const res = await auth.deleteUsers(batch);
      authDeletedCount += res?.successCount ?? 0;

      if (Array.isArray(res?.errors) && res.errors.length > 0) {
        for (const item of res.errors) {
          const uid = batch[item.index] ?? null;
          const message = item.error?.message || String(item.error);
          authErrors.push({ uid, index: item.index, message });
          logger.error(
            `[LIVE] Failed to delete Auth user ${uid ?? `at index ${item.index}`}: ${message}`
          );
        }
      }
    } catch (error) {
      const message = error?.message || String(error);
      for (const uid of batch) {
        authErrors.push({ uid, index: null, message });
      }
      logger.error(
        `[LIVE] Failed to delete Auth batch of ${batch.length} users: ${message}`
      );
    }
  }

  logger.log(
    `[LIVE] Scanned ${scannedCount} Auth users; found ${anonymousUids.length} anonymous users; deleted ${firestoreDeletedCount} Firestore trees and ${authDeletedCount} Auth accounts (firestoreErrors=${firestoreErrors.length}, authErrors=${authErrors.length}).`
  );

  return {
    dryRun: false,
    scannedCount,
    anonymousCount: anonymousUids.length,
    firestoreDeletedCount,
    authDeletedCount,
    firestoreErrors,
    authErrors,
  };
}

export async function initializeAdminServices(credentialsPath) {
  const resolvedPath =
    credentialsPath || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!resolvedPath) {
    throw new Error(
      "Missing service account credentials path. Pass --credentials <path> or set GOOGLE_APPLICATION_CREDENTIALS."
    );
  }

  const rawJson = await readFile(resolvedPath, "utf8");
  const serviceAccount = JSON.parse(rawJson);

  let appModule;
  let authModule;
  let firestoreModule;
  try {
    [appModule, authModule, firestoreModule] = await Promise.all([
      import("firebase-admin/app"),
      import("firebase-admin/auth"),
      import("firebase-admin/firestore"),
    ]);
  } catch (error) {
    throw new Error(
      `Failed to load firebase-admin. Install it out-of-band (e.g., "npm install --no-save firebase-admin") in your ops environment before running this script. Original error: ${
        error?.message || String(error)
      }`
    );
  }

  const { initializeApp, cert, getApps } = appModule;
  const { getAuth } = authModule;
  const { getFirestore } = firestoreModule;

  const app =
    getApps().length > 0
      ? getApps()[0]
      : initializeApp({ credential: cert(serviceAccount) });
  const auth = getAuth(app);
  const db = getFirestore(app);

  return { auth, db, app };
}

export async function runCli(argv = process.argv.slice(2), deps = {}) {
  const {
    initializeAdminServices: initServices = initializeAdminServices,
    cleanupAnonymousUsers: runCleanup = cleanupAnonymousUsers,
    logger = console,
  } = deps;

  const args = parseCliArgs(argv);
  if (args.help) {
    logger.log(USAGE);
    return { exitCode: 0 };
  }

  const { auth, db } = await initServices(args.credentialsPath);
  const summary = await runCleanup({
    auth,
    db,
    dryRun: args.dryRun,
    logger,
  });

  const exitCode =
    summary.firestoreErrors.length > 0 || summary.authErrors.length > 0 ? 1 : 0;
  return { exitCode, summary };
}

const isDirectExecution =
  Boolean(process.argv[1]) &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  runCli(process.argv.slice(2))
    .then((result) => {
      process.exitCode = result.exitCode;
    })
    .catch((error) => {
      console.error(error?.message || String(error));
      process.exitCode = 1;
    });
}
