import { useCallback, useEffect, useRef, useState } from "react";
import { firestoreService } from "../services/firebase/firestoreServices";

const EMPTY_WORKOUTS = [];
const EMPTY_DATA_STATE = {
  ownerUid: null,
  profile: null,
  plan: null,
  workouts: EMPTY_WORKOUTS,
};

const SYNC_PENDING_ERROR =
  "Still syncing your data from the cloud. Please try again in a moment.";
const SYNC_FAILED_DEFAULT_ERROR =
  "Cloud sync failed. Please retry sync before saving changes.";
const SYNC_FAILED_SAVE_PLAN_ERROR =
  "Cloud sync failed. Please retry sync before saving your plan.";
const SYNC_FAILED_RESET_ERROR =
  "Cloud sync failed. Please retry sync before resetting your program.";

function createEmptyDocSlice(nextId = 1) {
  return {
    committed: { plan: null, profile: null },
    committedPlanId: 0,
    committedProfileId: 0,
    pending: [],
    nextId,
  };
}

function computeDocState(slice) {
  let plan = slice.committed.plan;
  let profile = slice.committed.profile;

  for (const patch of slice.pending) {
    if (patch.hasPlan && patch.id > slice.committedPlanId) {
      plan = patch.plan;
    }
    if (patch.hasProfile && patch.id > slice.committedProfileId) {
      profile = patch.profile;
    }
  }

  return { plan, profile };
}

function createEmptyWorkoutSlice() {
  return {
    snapshot: EMPTY_WORKOUTS,
    localEntries: [],
  };
}

function createEmptyDeleteSuppression() {
  return {
    count: 0,
    bufferedUser: { hasValue: false, value: null },
    bufferedWorkouts: { hasValue: false, value: null },
    bufferedError: null,
  };
}

function isMatchingWorkoutEcho(snapshotDoc, optimisticEntry) {
  if (!snapshotDoc || !optimisticEntry) {
    return false;
  }
  if (
    typeof optimisticEntry.completedAt !== "string" ||
    optimisticEntry.completedAt === "" ||
    snapshotDoc.completedAt !== optimisticEntry.completedAt
  ) {
    return false;
  }
  const snapshotLogsLen = Array.isArray(snapshotDoc.logs)
    ? snapshotDoc.logs.length
    : 0;
  const optimisticLogsLen = Array.isArray(optimisticEntry.logs)
    ? optimisticEntry.logs.length
    : 0;

  return (
    snapshotDoc.weekNumber === optimisticEntry.weekNumber &&
    snapshotDoc.dayNumber === optimisticEntry.dayNumber &&
    snapshotDoc.dayName === optimisticEntry.dayName &&
    snapshotDoc.focus === optimisticEntry.focus &&
    snapshotDoc.duration === optimisticEntry.duration &&
    snapshotLogsLen === optimisticLogsLen
  );
}

function computeWorkouts(slice) {
  if (slice.localEntries.length === 0) {
    return slice.snapshot;
  }

  const snapshotIds = new Set(
    slice.snapshot.map((w) => w?.id).filter((id) => id != null)
  );
  const matchedEchoIds = new Set();
  const tail = [];

  for (const item of slice.localEntries) {
    if (item.status === "resolved") {
      if (item.entry?.id != null && snapshotIds.has(item.entry.id)) {
        continue;
      }
      tail.push(item.entry);
    } else {
      const echoMatch = slice.snapshot.find(
        (doc) =>
          doc?.id != null &&
          !item.baselineIds.has(doc.id) &&
          !matchedEchoIds.has(doc.id) &&
          isMatchingWorkoutEcho(doc, item.entry)
      );
      if (echoMatch) {
        matchedEchoIds.add(echoMatch.id);
      } else {
        tail.push(item.entry);
      }
    }
  }

  if (tail.length === 0) {
    return slice.snapshot;
  }

  return [...slice.snapshot, ...tail];
}

function safeUnsubscribe(unsub) {
  if (typeof unsub === "function") {
    try {
      unsub();
    } catch (err) {
      console.error("Error unsubscribing Firestore listener:", err);
    }
  }
}

function buildOptimisticWorkoutEntry(id, rawEntry, fallbackCompletedAt = "") {
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

  return {
    id,
    weekNumber,
    dayNumber,
    dayName,
    focus,
    logs,
    duration,
    completedAt,
  };
}

export function useUserData(user, options = {}) {
  const { onSyncComplete } = options || {};
  const uid = user?.uid ?? null;

  const [prevUid, setPrevUid] = useState(uid);
  const [syncAttempt, setSyncAttempt] = useState(0);
  const [syncState, setSyncState] = useState({
    uid: null,
    attempt: 0,
    status: "ready",
    error: null,
  });
  const [dataState, setDataState] = useState(EMPTY_DATA_STATE);

  const currentUidRef = useRef(uid);
  const localDataRef = useRef(dataState);
  const onSyncCompleteRef = useRef(onSyncComplete);
  const sessionEpochRef = useRef(0);
  const docSliceRef = useRef(createEmptyDocSlice(1));
  const workoutSliceRef = useRef(createEmptyWorkoutSlice());
  const optimisticWorkoutSeqRef = useRef(1);
  const activeUnsubscribersRef = useRef([]);
  const activeHandlersRef = useRef(null);
  const deleteSuppressionRef = useRef(createEmptyDeleteSuppression());

  if (uid !== prevUid) {
    setPrevUid(uid);
    setSyncState({
      uid: null,
      attempt: syncAttempt,
      status: "ready",
      error: null,
    });
    if (prevUid !== null) {
      setDataState(EMPTY_DATA_STATE);
    }
  }

  useEffect(() => {
    currentUidRef.current = uid;
  }, [uid]);

  useEffect(() => {
    localDataRef.current = dataState;
  }, [dataState]);

  useEffect(() => {
    onSyncCompleteRef.current = onSyncComplete;
  }, [onSyncComplete]);

  const teardownSubscriptions = useCallback(() => {
    activeHandlersRef.current = null;
    const unsubs = activeUnsubscribersRef.current;
    activeUnsubscribersRef.current = [];
    for (const unsub of unsubs) {
      safeUnsubscribe(unsub);
    }
  }, []);

  const retrySync = useCallback(() => {
    if (!uid) {
      return;
    }
    sessionEpochRef.current += 1;
    teardownSubscriptions();
    docSliceRef.current = {
      ...docSliceRef.current,
      pending: [],
    };
    workoutSliceRef.current = {
      ...workoutSliceRef.current,
      localEntries: [],
    };
    setSyncAttempt((prev) => prev + 1);
  }, [uid, teardownSubscriptions]);

  useEffect(() => {
    sessionEpochRef.current += 1;
    const runEpoch = sessionEpochRef.current;
    docSliceRef.current = createEmptyDocSlice(docSliceRef.current.nextId);
    workoutSliceRef.current = createEmptyWorkoutSlice();
    deleteSuppressionRef.current = createEmptyDeleteSuppression();
    teardownSubscriptions();

    if (!uid) {
      return;
    }

    let isMounted = true;
    let hasFailed = false;
    let hasReceivedInitialUser = false;
    let hasAttachedWorkouts = false;
    let hasHandledInitialWorkouts = false;
    let isInitialReady = false;
    let hasCalledSyncComplete = false;
    let latestUserData = null;
    let latestWorkouts = EMPTY_WORKOUTS;

    const isActive = () =>
      isMounted &&
      !hasFailed &&
      sessionEpochRef.current === runEpoch &&
      currentUidRef.current === uid;

    const fireSyncCompleteOnce = (hasPlan) => {
      if (!hasCalledSyncComplete && isMounted && currentUidRef.current === uid) {
        hasCalledSyncComplete = true;
        onSyncCompleteRef.current?.(hasPlan);
      }
    };

    const handleSyncFailure = (err) => {
      if (!isActive()) {
        return;
      }
      if (deleteSuppressionRef.current.count > 0) {
        deleteSuppressionRef.current.bufferedError = err;
        return;
      }
      hasFailed = true;
      console.error("Sync Error:", err);
      sessionEpochRef.current += 1;
      teardownSubscriptions();
      docSliceRef.current = {
        ...docSliceRef.current,
        pending: [],
      };
      workoutSliceRef.current = {
        ...workoutSliceRef.current,
        localEntries: [],
      };
      setSyncState({
        uid,
        attempt: syncAttempt,
        status: "error",
        error: err,
      });
      fireSyncCompleteOnce(false);
    };

    const finalizeInitialHydration = ({
      hydratedProfile,
      hydratedPlan,
      hydratedWorkouts,
      finalHasPlan,
    }) => {
      if (!isActive() || isInitialReady) {
        return;
      }
      isInitialReady = true;
      docSliceRef.current = {
        committed: {
          plan: hydratedPlan,
          profile: hydratedProfile,
        },
        committedPlanId: 0,
        committedProfileId: 0,
        pending: [],
        nextId: docSliceRef.current.nextId,
      };
      workoutSliceRef.current = {
        snapshot: hydratedWorkouts,
        localEntries: [],
      };
      setDataState({
        ownerUid: uid,
        profile: hydratedProfile,
        plan: hydratedPlan,
        workouts: hydratedWorkouts,
      });
      setSyncState({
        uid,
        attempt: syncAttempt,
        status: "ready",
        error: null,
      });
      fireSyncCompleteOnce(finalHasPlan);
    };

    const onWorkoutsSnap = (cloudWorkouts) => {
      if (!isActive()) {
        return;
      }
      if (deleteSuppressionRef.current.count > 0) {
        deleteSuppressionRef.current.bufferedWorkouts = {
          hasValue: true,
          value: cloudWorkouts,
        };
        return;
      }

      const normalizedWorkouts = Array.isArray(cloudWorkouts)
        ? cloudWorkouts
        : EMPTY_WORKOUTS;

      if (!hasHandledInitialWorkouts) {
        hasHandledInitialWorkouts = true;
        latestWorkouts = normalizedWorkouts;

        if (latestUserData || latestWorkouts.length > 0) {
          const hydratedProfile = latestUserData?.profile ?? null;
          const hydratedPlan = latestUserData?.plan ?? null;
          finalizeInitialHydration({
            hydratedProfile,
            hydratedPlan,
            hydratedWorkouts: latestWorkouts,
            finalHasPlan: Boolean(hydratedPlan),
          });
          return;
        }

        const currentLocal = localDataRef.current;
        if (
          currentLocal.ownerUid === null &&
          (currentLocal.plan || currentLocal.profile)
        ) {
          firestoreService
            .saveUserData(uid, {
              plan: currentLocal.plan,
              profile: currentLocal.profile,
            })
            .then(() => {
              if (!isActive()) {
                return;
              }
              const hydratedProfile =
                latestUserData?.profile ?? currentLocal.profile ?? null;
              const hydratedPlan =
                latestUserData?.plan ?? currentLocal.plan ?? null;
              finalizeInitialHydration({
                hydratedProfile,
                hydratedPlan,
                hydratedWorkouts: latestWorkouts,
                finalHasPlan: Boolean(hydratedPlan),
              });
            })
            .catch((err) => {
              handleSyncFailure(err);
            });
          return;
        }

        finalizeInitialHydration({
          hydratedProfile: null,
          hydratedPlan: null,
          hydratedWorkouts: EMPTY_WORKOUTS,
          finalHasPlan: false,
        });
        return;
      }

      if (!isInitialReady) {
        latestWorkouts = normalizedWorkouts;
        return;
      }

      const nextIds = new Set(
        normalizedWorkouts.map((w) => w?.id).filter((id) => id != null)
      );
      const slice = workoutSliceRef.current;
      slice.snapshot = normalizedWorkouts;
      slice.localEntries = slice.localEntries.filter(
        (item) =>
          !(
            item.status === "resolved" &&
            item.entry?.id != null &&
            nextIds.has(item.entry.id)
          )
      );
      const nextWorkouts = computeWorkouts(slice);
      setDataState((prev) => ({
        ...prev,
        ownerUid: uid,
        workouts: nextWorkouts,
      }));
    };

    const attachWorkoutsListener = () => {
      if (!isActive() || hasAttachedWorkouts) {
        return;
      }
      hasAttachedWorkouts = true;
      try {
        const unsubWorkouts = firestoreService.subscribeWorkouts(
          uid,
          onWorkoutsSnap,
          handleSyncFailure
        );
        if (!isActive()) {
          safeUnsubscribe(unsubWorkouts);
          return;
        }
        activeUnsubscribersRef.current.push(unsubWorkouts);
      } catch (err) {
        handleSyncFailure(err);
      }
    };

    const onUserSnap = (cloudData) => {
      if (!isActive()) {
        return;
      }
      if (deleteSuppressionRef.current.count > 0) {
        deleteSuppressionRef.current.bufferedUser = {
          hasValue: true,
          value: cloudData,
        };
        return;
      }

      if (!hasReceivedInitialUser) {
        hasReceivedInitialUser = true;
        latestUserData = cloudData;

        if (cloudData && Array.isArray(cloudData.history)) {
          firestoreService
            .migrateLegacyHistory(uid, cloudData.history)
            .then(() => {
              if (!isActive()) {
                return;
              }
              attachWorkoutsListener();
            })
            .catch((err) => {
              handleSyncFailure(err);
            });
          return;
        }

        attachWorkoutsListener();
        return;
      }

      if (!isInitialReady) {
        latestUserData = cloudData;
        return;
      }

      const slice = docSliceRef.current;
      slice.committed = {
        plan: cloudData?.plan ?? null,
        profile: cloudData?.profile ?? null,
      };
      const nextDoc = computeDocState(slice);
      setDataState((prev) => ({
        ...prev,
        ownerUid: uid,
        plan: nextDoc.plan,
        profile: nextDoc.profile,
      }));
    };

    activeHandlersRef.current = {
      epoch: runEpoch,
      onUserSnap,
      onWorkoutsSnap,
      onSnapError: handleSyncFailure,
    };

    try {
      const unsubUser = firestoreService.subscribeUserData(
        uid,
        onUserSnap,
        handleSyncFailure
      );
      if (!isActive()) {
        safeUnsubscribe(unsubUser);
      } else {
        activeUnsubscribersRef.current.push(unsubUser);
      }
    } catch (err) {
      handleSyncFailure(err);
    }

    return () => {
      isMounted = false;
      teardownSubscriptions();
    };
  }, [uid, syncAttempt, teardownSubscriptions]);

  const isCurrentSync = Boolean(
    uid && syncState.uid === uid && syncState.attempt === syncAttempt
  );

  const status = !uid
    ? "ready"
    : isCurrentSync
      ? syncState.status
      : "loading";

  const error = uid && isCurrentSync ? syncState.error : null;
  const isSynced = Boolean(uid && status === "ready");
  const syncError = uid && status === "error" ? error : null;

  const isDataVisible = dataState.ownerUid === uid;
  const profile = isDataVisible ? dataState.profile : null;
  const plan = isDataVisible ? dataState.plan : null;
  const workouts = isDataVisible ? dataState.workouts : EMPTY_WORKOUTS;

  const assertReadyForWrite = useCallback(
    (failedMessage = SYNC_FAILED_DEFAULT_ERROR) => {
      if (!uid) {
        return;
      }
      if (status === "error") {
        throw new Error(failedMessage);
      }
      if (status !== "ready") {
        throw new Error(SYNC_PENDING_ERROR);
      }
    },
    [uid, status]
  );

  const runOptimisticDocWrite = useCallback(
    async ({ writeUid, patchSpec, writeFn }) => {
      if (!writeUid) {
        const slice = docSliceRef.current;
        const nextCommitted = {
          plan: patchSpec.hasPlan ? patchSpec.plan : slice.committed.plan,
          profile: patchSpec.hasProfile
            ? patchSpec.profile
            : slice.committed.profile,
        };
        docSliceRef.current = {
          committed: nextCommitted,
          committedPlanId: 0,
          committedProfileId: 0,
          pending: [],
          nextId: slice.nextId,
        };
        setDataState((prev) => ({
          ...prev,
          ownerUid: null,
          plan: nextCommitted.plan,
          profile: nextCommitted.profile,
        }));
        return;
      }

      const writeEpoch = sessionEpochRef.current;
      const patchId = docSliceRef.current.nextId++;
      const patch = { id: patchId, ...patchSpec };
      docSliceRef.current.pending.push(patch);

      const optimistic = computeDocState(docSliceRef.current);
      setDataState((prev) => ({
        ...prev,
        ownerUid: writeUid,
        plan: optimistic.plan,
        profile: optimistic.profile,
      }));

      try {
        await writeFn();
        if (
          sessionEpochRef.current === writeEpoch &&
          currentUidRef.current === writeUid
        ) {
          const slice = docSliceRef.current;
          if (patch.hasPlan && patchId > slice.committedPlanId) {
            slice.committed = { ...slice.committed, plan: patch.plan };
            slice.committedPlanId = patchId;
          }
          if (patch.hasProfile && patchId > slice.committedProfileId) {
            slice.committed = { ...slice.committed, profile: patch.profile };
            slice.committedProfileId = patchId;
          }
          slice.pending = slice.pending.filter((item) => item.id !== patchId);
          const nextDoc = computeDocState(slice);
          setDataState((prev) => ({
            ...prev,
            ownerUid: writeUid,
            plan: nextDoc.plan,
            profile: nextDoc.profile,
          }));
        }
      } catch (err) {
        if (
          sessionEpochRef.current === writeEpoch &&
          currentUidRef.current === writeUid
        ) {
          const slice = docSliceRef.current;
          slice.pending = slice.pending.filter((item) => item.id !== patchId);
          const rolledBack = computeDocState(slice);
          setDataState((prev) => ({
            ...prev,
            ownerUid: writeUid,
            plan: rolledBack.plan,
            profile: rolledBack.profile,
          }));
        }
        throw err;
      }
    },
    []
  );

  const savePlan = useCallback(
    async (nextPlan, nextProfile) => {
      assertReadyForWrite(SYNC_FAILED_SAVE_PLAN_ERROR);
      const writeUid = uid;
      await runOptimisticDocWrite({
        writeUid,
        patchSpec: {
          hasPlan: true,
          plan: nextPlan,
          hasProfile: true,
          profile: nextProfile,
        },
        writeFn: () =>
          firestoreService.saveUserData(writeUid, {
            plan: nextPlan,
            profile: nextProfile,
          }),
      });
      return { plan: nextPlan, profile: nextProfile };
    },
    [assertReadyForWrite, runOptimisticDocWrite, uid]
  );

  const updatePlan = useCallback(
    async (nextPlan) => {
      assertReadyForWrite(SYNC_FAILED_DEFAULT_ERROR);
      const writeUid = uid;
      await runOptimisticDocWrite({
        writeUid,
        patchSpec: {
          hasPlan: true,
          plan: nextPlan,
          hasProfile: false,
          profile: undefined,
        },
        writeFn: () =>
          firestoreService.saveUserData(writeUid, { plan: nextPlan }),
      });
      return nextPlan;
    },
    [assertReadyForWrite, runOptimisticDocWrite, uid]
  );

  const addWorkout = useCallback(
    async (workoutPayload) => {
      assertReadyForWrite(SYNC_FAILED_DEFAULT_ERROR);
      const writeUid = uid;

      if (!writeUid) {
        const localId = `local-${Date.now()}-${optimisticWorkoutSeqRef.current++}`;
        const localEntry = buildOptimisticWorkoutEntry(
          localId,
          workoutPayload,
          new Date().toISOString()
        );
        setDataState((prev) => ({
          ...prev,
          ownerUid: null,
          workouts: [...prev.workouts, localEntry],
        }));
        return localEntry;
      }

      const writeEpoch = sessionEpochRef.current;
      const tempId = `__optimistic_workout_${optimisticWorkoutSeqRef.current++}`;
      const optimisticEntry = buildOptimisticWorkoutEntry(
        tempId,
        workoutPayload,
        new Date().toISOString()
      );

      const slice = workoutSliceRef.current;
      const baselineIds = new Set(
        slice.snapshot.map((w) => w?.id).filter((id) => id != null)
      );
      slice.localEntries.push({
        status: "pending",
        tempId,
        entry: optimisticEntry,
        baselineIds,
      });

      const optimisticWorkouts = computeWorkouts(slice);
      setDataState((prev) => ({
        ...prev,
        ownerUid: writeUid,
        workouts: optimisticWorkouts,
      }));

      try {
        const savedEntry = await firestoreService.addWorkout(
          writeUid,
          workoutPayload
        );
        if (
          sessionEpochRef.current === writeEpoch &&
          currentUidRef.current === writeUid
        ) {
          const activeSlice = workoutSliceRef.current;
          const alreadyInSnapshot =
            savedEntry?.id != null &&
            activeSlice.snapshot.some((w) => w?.id === savedEntry.id);

          if (alreadyInSnapshot) {
            activeSlice.localEntries = activeSlice.localEntries.filter(
              (item) => item.tempId !== tempId
            );
          } else {
            let replaced = false;
            activeSlice.localEntries = activeSlice.localEntries.map((item) => {
              if (item.tempId === tempId) {
                replaced = true;
                return {
                  status: "resolved",
                  tempId,
                  entry: savedEntry,
                };
              }
              return item;
            });
            if (!replaced) {
              activeSlice.localEntries.push({
                status: "resolved",
                tempId,
                entry: savedEntry,
              });
            }
          }

          const nextWorkouts = computeWorkouts(activeSlice);
          setDataState((prev) => ({
            ...prev,
            ownerUid: writeUid,
            workouts: nextWorkouts,
          }));
        }
        return savedEntry;
      } catch (err) {
        if (
          sessionEpochRef.current === writeEpoch &&
          currentUidRef.current === writeUid
        ) {
          const activeSlice = workoutSliceRef.current;
          activeSlice.localEntries = activeSlice.localEntries.filter(
            (item) => item.tempId !== tempId
          );
          const nextWorkouts = computeWorkouts(activeSlice);
          setDataState((prev) => ({
            ...prev,
            ownerUid: writeUid,
            workouts: nextWorkouts,
          }));
        }
        throw err;
      }
    },
    [assertReadyForWrite, uid]
  );

  const resetProgram = useCallback(async () => {
    assertReadyForWrite(SYNC_FAILED_RESET_ERROR);
    const writeUid = uid;
    await runOptimisticDocWrite({
      writeUid,
      patchSpec: {
        hasPlan: true,
        plan: null,
        hasProfile: true,
        profile: null,
      },
      writeFn: () => firestoreService.resetUserProgram(writeUid),
    });
  }, [assertReadyForWrite, runOptimisticDocWrite, uid]);

  const deleteAll = useCallback(async () => {
    if (!uid) {
      throw new Error("User ID is required to delete user data.");
    }
    const writeUid = uid;
    const writeEpoch = sessionEpochRef.current;
    const suppression = deleteSuppressionRef.current;
    suppression.count += 1;

    try {
      const result = await firestoreService.deleteUserData(writeUid);
      suppression.count = Math.max(0, suppression.count - 1);
      if (suppression.count === 0) {
        suppression.bufferedUser = { hasValue: false, value: null };
        suppression.bufferedWorkouts = { hasValue: false, value: null };
        suppression.bufferedError = null;
      }
      if (
        sessionEpochRef.current === writeEpoch &&
        currentUidRef.current === writeUid
      ) {
        sessionEpochRef.current += 1;
        teardownSubscriptions();
        docSliceRef.current = createEmptyDocSlice(docSliceRef.current.nextId);
        workoutSliceRef.current = createEmptyWorkoutSlice();
        setDataState({
          ownerUid: writeUid,
          profile: null,
          plan: null,
          workouts: EMPTY_WORKOUTS,
        });
      }
      return result;
    } catch (err) {
      suppression.count = Math.max(0, suppression.count - 1);
      if (
        suppression.count === 0 &&
        sessionEpochRef.current === writeEpoch &&
        currentUidRef.current === writeUid
      ) {
        const bufferedUser = suppression.bufferedUser;
        const bufferedWorkouts = suppression.bufferedWorkouts;
        const bufferedError = suppression.bufferedError;
        suppression.bufferedUser = { hasValue: false, value: null };
        suppression.bufferedWorkouts = { hasValue: false, value: null };
        suppression.bufferedError = null;

        const handlers = activeHandlersRef.current;
        if (handlers && handlers.epoch === writeEpoch) {
          if (bufferedError) {
            handlers.onSnapError(bufferedError);
          } else {
            if (bufferedUser.hasValue) {
              handlers.onUserSnap(bufferedUser.value);
            }
            if (bufferedWorkouts.hasValue) {
              handlers.onWorkoutsSnap(bufferedWorkouts.value);
            }
          }
        }
      }
      throw err;
    }
  }, [uid, teardownSubscriptions]);

  const clearLocalData = useCallback(() => {
    sessionEpochRef.current += 1;
    teardownSubscriptions();
    docSliceRef.current = createEmptyDocSlice(docSliceRef.current.nextId);
    workoutSliceRef.current = createEmptyWorkoutSlice();
    setDataState(EMPTY_DATA_STATE);
  }, [teardownSubscriptions]);

  return {
    profile,
    plan,
    workouts,
    status,
    error,
    isSynced,
    syncError,
    retrySync,
    savePlan,
    updatePlan,
    addWorkout,
    resetProgram,
    deleteAll,
    clearLocalData,
  };
}
