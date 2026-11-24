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
  const optimisticWorkoutSeqRef = useRef(1);

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

  const retrySync = useCallback(() => {
    if (!uid) {
      return;
    }
    sessionEpochRef.current += 1;
    docSliceRef.current = {
      ...docSliceRef.current,
      pending: [],
    };
    setSyncAttempt((prev) => prev + 1);
  }, [uid]);

  useEffect(() => {
    sessionEpochRef.current += 1;
    docSliceRef.current = createEmptyDocSlice(docSliceRef.current.nextId);

    if (!uid) {
      return;
    }

    let isMounted = true;
    const syncData = async () => {
      let finalHasPlan = false;
      try {
        const cloudData = await firestoreService.getUserData(uid);
        if (!isMounted) {
          return;
        }
        if (cloudData && Array.isArray(cloudData.history)) {
          await firestoreService.migrateLegacyHistory(uid, cloudData.history);
          if (!isMounted) {
            return;
          }
        }
        const cloudWorkouts = await firestoreService.getWorkouts(uid);
        if (!isMounted) {
          return;
        }

        let hydratedProfile = null;
        let hydratedPlan = null;
        let hydratedWorkouts = EMPTY_WORKOUTS;

        if (cloudData || cloudWorkouts.length > 0) {
          hydratedProfile = cloudData?.profile ?? null;
          hydratedPlan = cloudData?.plan ?? null;
          hydratedWorkouts = cloudWorkouts;
          finalHasPlan = Boolean(cloudData?.plan);
        } else {
          const currentLocal = localDataRef.current;
          if (
            currentLocal.ownerUid === null &&
            (currentLocal.plan || currentLocal.profile)
          ) {
            await firestoreService.saveUserData(uid, {
              plan: currentLocal.plan,
              profile: currentLocal.profile,
            });
            if (!isMounted) {
              return;
            }
            hydratedProfile = currentLocal.profile ?? null;
            hydratedPlan = currentLocal.plan ?? null;
            hydratedWorkouts = EMPTY_WORKOUTS;
            finalHasPlan = Boolean(currentLocal.plan);
          } else {
            finalHasPlan = false;
          }
        }

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
        setDataState({
          ownerUid: uid,
          profile: hydratedProfile,
          plan: hydratedPlan,
          workouts: hydratedWorkouts,
        });

        if (isMounted) {
          setSyncState({
            uid,
            attempt: syncAttempt,
            status: "ready",
            error: null,
          });
        }
      } catch (err) {
        console.error("Sync Error:", err);
        if (isMounted) {
          setSyncState({
            uid,
            attempt: syncAttempt,
            status: "error",
            error: err,
          });
        }
      } finally {
        if (isMounted && onSyncCompleteRef.current) {
          onSyncCompleteRef.current(finalHasPlan);
        }
      }
    };

    syncData();

    return () => {
      isMounted = false;
    };
  }, [uid, syncAttempt]);

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

      setDataState((prev) => ({
        ...prev,
        ownerUid: writeUid,
        workouts: [...prev.workouts, optimisticEntry],
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
          setDataState((prev) => {
            let replaced = false;
            const nextWorkouts = prev.workouts.map((entry) => {
              if (entry.id === tempId) {
                replaced = true;
                return savedEntry;
              }
              return entry;
            });
            if (
              !replaced &&
              (savedEntry?.id == null ||
                !nextWorkouts.some((entry) => entry.id === savedEntry.id))
            ) {
              nextWorkouts.push(savedEntry);
            }
            return {
              ...prev,
              ownerUid: writeUid,
              workouts: nextWorkouts,
            };
          });
        }
        return savedEntry;
      } catch (err) {
        if (
          sessionEpochRef.current === writeEpoch &&
          currentUidRef.current === writeUid
        ) {
          setDataState((prev) => ({
            ...prev,
            ownerUid: writeUid,
            workouts: prev.workouts.filter((entry) => entry.id !== tempId),
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
    const result = await firestoreService.deleteUserData(writeUid);
    if (
      sessionEpochRef.current === writeEpoch &&
      currentUidRef.current === writeUid
    ) {
      sessionEpochRef.current += 1;
      docSliceRef.current = createEmptyDocSlice(docSliceRef.current.nextId);
      setDataState({
        ownerUid: writeUid,
        profile: null,
        plan: null,
        workouts: EMPTY_WORKOUTS,
      });
    }
    return result;
  }, [uid]);

  const clearLocalData = useCallback(() => {
    sessionEpochRef.current += 1;
    docSliceRef.current = createEmptyDocSlice(docSliceRef.current.nextId);
    setDataState(EMPTY_DATA_STATE);
  }, []);

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
